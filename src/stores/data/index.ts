import { create } from "zustand";
import type { DataState } from "./types";
import { supabase } from "../../lib/supabase";
import { reportError } from "../../lib/errors";
import { useAppStore } from "../appStore";
import { persistSnapshotToLocal, readLocalSnapshot, type LocalSnapshot } from "./localSync";
import { drainOutbox, registerOutboxReconciler } from "./outbox";
import { bootstrapDeltaCursors, pullDeltaChanges } from "./deltaSync";
import {
  mapAuditLog, mapBarcode, mapBrand, mapBusinessProfile, mapCategory, mapInventory, mapMovement,
  mapPriceLevel, mapPriceTier, mapProduct, mapProductUnit, mapProductUnitPrice, mapPurchaseOrder,
  mapPurchaseOrderItem, mapRefund, mapReprintLog, mapSale, mapSaleItem, mapShift, mapShop,
  mapStockTransfer, mapStockTransferItem, mapSupplier, mapSupplierPayment, mapSupplierProduct,
  mapUnitType, mapUser,
} from "./mappers";

// Import all slices
import { createShopSlice } from "./slices/shopSlice";
import { createCategorySlice } from "./slices/categorySlice";
import { createBrandSlice } from "./slices/brandSlice";
import { createUnitTypeSlice } from "./slices/unitTypeSlice";
import { createPriceLevelSlice } from "./slices/priceLevelSlice";
import { createProductSlice } from "./slices/productSlice";
import { createInventorySlice } from "./slices/inventorySlice";
import { createShiftSlice } from "./slices/shiftSlice";
import { createSaleSlice } from "./slices/saleSlice";
import { createTransferSlice } from "./slices/transferSlice";
import { createPurchaseSlice } from "./slices/purchaseSlice";
import { createPricingSlice } from "./slices/pricingSlice";
import { createAuditSlice } from "./slices/auditSlice";

// ============================================================
// Store
// ============================================================

export const useDataStore = create<DataState>()((...args) => {
  const [set, get] = args;
  return {
    ...createShopSlice(...args),
    ...createCategorySlice(...args),
    ...createBrandSlice(...args),
    ...createUnitTypeSlice(...args),
    ...createPriceLevelSlice(...args),
    ...createProductSlice(...args),
    ...createInventorySlice(...args),
    ...createShiftSlice(...args),
    ...createSaleSlice(...args),
    ...createTransferSlice(...args),
    ...createPurchaseSlice(...args),
    ...createPricingSlice(...args),
    ...createAuditSlice(...args),

    isLoading: false,
    isLoaded: false,
    loadError: null,

    retryLoadData: async () => {
      await get().loadData({ force: true });
    },

    pullDeltas: async () => {
      if (!get().isLoaded) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      try {
        const { changes } = await pullDeltaChanges(get());
        if (Object.keys(changes).length > 0) set(changes);
      } catch (err) {
        console.error("[DB] pullDeltas failed:", err);
      }
    },

    loadData: async (options) => {
      if (get().isLoading) return;
      if (get().isLoaded && !options?.force) return;

      // Fast path: render immediately from the local mirror (works offline
      // and on a cold, slow connection). The network fetch below still runs
      // in the background to refresh it — isLoading stays true throughout so
      // callers can show a non-blocking "syncing" indicator.
      if (!get().isLoaded) {
        try {
          const cached = await readLocalSnapshot();
          if (cached) set({ ...cached, refundVoidRequests: cached.refunds, isLoaded: true });
        } catch (err) {
          console.error("[DB] Failed to hydrate from local cache:", err);
        }
      }

      // No point firing 27 requests that will just fail — leave whatever we
      // rendered from cache (or the "Loading data…" / Retry screen if this is
      // a first run with no cache yet) in place until connectivity returns.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        if (!get().isLoaded) set({ loadError: "You're offline and no cached data is available yet." });
        return;
      }

      set({ isLoading: true, loadError: null });
      try {
        const [
          shops, users, categories, brands, unitTypes, products, productUnits, barcodes, priceTiers,
          priceLevels, productUnitPrices,
          inventory, movements, suppliers, purchaseOrders, purchaseOrderItems, supplierPayments,
          supplierProducts,
          stockTransfers, stockTransferItems, shifts, sales, saleItems,
          reprintLogs, refunds, auditLogs, businessProfileRes,
        ] = await Promise.all([
          supabase.from("shops").select("*"),
          supabase.from("users").select("*"),
          supabase.from("categories").select("*"),
          supabase.from("brands").select("*").order("sort_order", { ascending: true }),
          supabase.from("unit_types").select("*").order("sort_order", { ascending: true }),
          supabase.from("products").select("*"),
          supabase.from("product_units").select("*").order("sort_order", { ascending: true }),
          supabase.from("product_barcodes").select("*"),
          supabase.from("price_tiers").select("*"),
          supabase.from("price_levels").select("*").order("sort_order", { ascending: true }),
          supabase.from("product_unit_prices").select("*"),
          supabase.from("inventory").select("*"),
          supabase.from("inventory_movements").select("*").order("created_at", { ascending: false }).limit(500),
          supabase.from("suppliers").select("*"),
          supabase.from("purchase_orders").select("*"),
          supabase.from("purchase_order_items").select("*"),
          supabase.from("supplier_payments").select("*").order("paid_at", { ascending: false }),
          supabase.from("supplier_products").select("*"),
          supabase.from("stock_transfers").select("*"),
          supabase.from("stock_transfer_items").select("*"),
          supabase.from("shifts").select("*"),
          supabase.from("sales").select("*").order("created_at", { ascending: false }).limit(1000),
          supabase.from("sale_items").select("*"),
          supabase.from("reprint_logs").select("*"),
          supabase.from("refund_void_requests").select("*"),
          supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(500),
          supabase.from("business_profile").select("*").eq("id", "default").maybeSingle(),
        ]);

        // Surface RLS / network failures from any of the parallel reads.
        // The arrays default to [] otherwise — that would render an empty
        // shop with no error indication, hiding the real cause.
        const failedRead = [
          shops, users, categories, brands, unitTypes, products, productUnits, barcodes, priceTiers,
          priceLevels, productUnitPrices,
          inventory, movements,
          suppliers, purchaseOrders, purchaseOrderItems, supplierPayments,
          supplierProducts,
          stockTransfers, stockTransferItems, shifts, sales, saleItems,
          reprintLogs, refunds, auditLogs, businessProfileRes,
        ].find((result) => result.error);
        if (failedRead?.error) throw failedRead.error;

        // Clear `currentShopId` only if it points to a shop that no longer
        // exists (e.g., it was deleted between sessions). We deliberately
        // DO NOT auto-pick `shops[0]` when nothing is selected — shop-scoped
        // UIs (POS, shift, inventory adjust, purchases, transfers) show a
        // clear "no shop selected" blocked state for ADMIN instead. See
        // `getEffectiveShopId` for the contract.
        const shopsList = (shops.data ?? []).map(mapShop);
        const { currentShopId, setShopId } = useAppStore.getState();
        if (currentShopId && !shopsList.find((s) => s.id === currentShopId)) {
          setShopId(null);
        }

        const mappedRefunds = (refunds.data ?? []).map(mapRefund);
        const snapshot: LocalSnapshot = {
          shops: shopsList,
          users: (users.data ?? []).map(mapUser),
          categories: (categories.data ?? []).map(mapCategory),
          brands: (brands.data ?? []).map(mapBrand),
          unitTypes: (unitTypes.data ?? []).map(mapUnitType),
          products: (products.data ?? []).map(mapProduct),
          productUnits: (productUnits.data ?? []).map(mapProductUnit),
          barcodes: (barcodes.data ?? []).map(mapBarcode),
          priceTiers: (priceTiers.data ?? []).map(mapPriceTier),
          priceLevels: (priceLevels.data ?? []).map(mapPriceLevel),
          productUnitPrices: (productUnitPrices.data ?? []).map(mapProductUnitPrice),
          inventory: (inventory.data ?? []).map(mapInventory),
          movements: (movements.data ?? []).map(mapMovement),
          suppliers: (suppliers.data ?? []).map(mapSupplier),
          purchaseOrders: (purchaseOrders.data ?? []).map(mapPurchaseOrder),
          purchaseOrderItems: (purchaseOrderItems.data ?? []).map(mapPurchaseOrderItem),
          supplierPayments: (supplierPayments.data ?? []).map(mapSupplierPayment),
          supplierProducts: (supplierProducts.data ?? []).map(mapSupplierProduct),
          stockTransfers: (stockTransfers.data ?? []).map(mapStockTransfer),
          stockTransferItems: (stockTransferItems.data ?? []).map(mapStockTransferItem),
          shifts: (shifts.data ?? []).map(mapShift),
          sales: (sales.data ?? []).map(mapSale),
          saleItems: (saleItems.data ?? []).map(mapSaleItem),
          reprintLogs: (reprintLogs.data ?? []).map(mapReprintLog),
          refunds: mappedRefunds,
          auditLogs: (auditLogs.data ?? []).map(mapAuditLog),
          businessProfile: businessProfileRes.data ? mapBusinessProfile(businessProfileRes.data) : null,
        };
        set({ ...snapshot, refundVoidRequests: mappedRefunds, isLoading: false, isLoaded: true });
        persistSnapshotToLocal(snapshot).catch((err) => {
          console.error("[DB] Failed to persist local cache:", err);
        });
        // A full load always has the freshest data for every table, so it's
        // always safe to (re)set the delta-pull cursors from it — the next
        // background refresh (see AppLayout.tsx) can then pull just what
        // changed since, instead of another full 27-table reload.
        bootstrapDeltaCursors(snapshot).catch((err) => {
          console.error("[DB] Failed to bootstrap delta-sync cursors:", err);
        });
        // We just proved the network is reachable — replay anything queued
        // while offline (previous outages, or writes made before this boot).
        drainOutbox().catch((err) => {
          console.error("[DB] Failed to drain the sync outbox:", err);
        });
      } catch (err) {
        const message = reportError("loadData", err, "Failed to load data. Please try again.");
        set({ isLoading: false, loadError: message });
      }
    },
  };
});

registerOutboxReconciler("complete_sale", (data, provisional) =>
  useDataStore.getState().reconcileCompleteSale(data, provisional ?? []));
registerOutboxReconciler("adjust_stock", (data, provisional) =>
  useDataStore.getState().reconcileAdjustStock(data, provisional ?? []));
registerOutboxReconciler("open_shift", (data, provisional) =>
  useDataStore.getState().reconcileOpenShift(data, provisional ?? []));
registerOutboxReconciler("close_shift", (data, provisional) =>
  useDataStore.getState().reconcileCloseShift(data, provisional ?? []));
registerOutboxReconciler("create_refund_void_request", (data, provisional) =>
  useDataStore.getState().reconcileCreateRefundVoidRequest(data, provisional ?? []));
registerOutboxReconciler("receive_purchase_order", (data, provisional) =>
  useDataStore.getState().reconcileReceivePurchaseOrder(data, provisional ?? []));
registerOutboxReconciler("record_supplier_payment", (data, provisional) =>
  useDataStore.getState().reconcileRecordSupplierPayment(data, provisional ?? []));
registerOutboxReconciler("dispatch_stock_transfer", (data, provisional) =>
  useDataStore.getState().reconcileDispatchTransfer(data, provisional ?? []));
registerOutboxReconciler("receive_stock_transfer", (data, provisional) =>
  useDataStore.getState().reconcileReceiveTransfer(data, provisional ?? []));

export type { DataState } from "./types";
