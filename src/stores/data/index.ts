import { create } from "zustand";
import type { DataState } from "./types";
import { supabase } from "../../lib/supabase";
import { reportError } from "../../lib/errors";
import { useAppStore } from "../appStore";
import type {
  AuditLog, Category, Inventory, InventoryMovement, PriceTier,
  Product, ProductBarcode, PurchaseOrder, PurchaseOrderItem,
  Refund, Sale, SaleItem, Shift, Shop, StockTransfer, StockTransferItem,
  Supplier, SupplierPayment, User,
} from "../../types";

// Import all slices
import { createShopSlice } from "./slices/shopSlice";
import { createCategorySlice } from "./slices/categorySlice";
import { createProductSlice } from "./slices/productSlice";
import { createInventorySlice } from "./slices/inventorySlice";
import { createShiftSlice } from "./slices/shiftSlice";
import { createSaleSlice } from "./slices/saleSlice";
import { createTransferSlice } from "./slices/transferSlice";
import { createPurchaseSlice } from "./slices/purchaseSlice";
import { createPricingSlice } from "./slices/pricingSlice";
import { createAuditSlice } from "./slices/auditSlice";

// ============================================================
// Row Mappers: DB snake_case → TypeScript camelCase
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapShop = (r: any): Shop => ({
  id: r.id, code: r.code, name: r.name, address: r.address,
  phone: r.phone ?? undefined, email: r.email ?? undefined,
  isActive: r.is_active, createdAt: r.created_at,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapUser = (r: any): User => ({
  id: r.id, name: r.name, email: r.email ?? undefined, role: r.role,
  shopId: r.shop_id ?? undefined, authId: r.auth_id ?? undefined,
  permissions: r.permissions ?? undefined,
  grantedPermissions: r.granted_permissions ?? undefined,
  revokedPermissions: r.revoked_permissions ?? undefined,
  isActive: r.is_active, createdAt: r.created_at,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapCategory = (r: any): Category => ({
  id: r.id, name: r.name, color: r.color, iconKey: r.icon_key ?? undefined,
  isActive: r.is_active, createdAt: r.created_at,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapProduct = (r: any): Product => ({
  id: r.id, sku: r.sku ?? undefined, name: r.name, category: r.category,
  unitType: r.unit_type, priceMmk: r.price_mmk, costMmk: r.cost_mmk ?? undefined,
  packSize: r.pack_size ?? undefined, lowStockThreshold: r.low_stock_threshold,
  expiryDate: r.expiry_date ?? undefined, imageUrl: r.image_url ?? undefined,
  isActive: r.is_active, createdAt: r.created_at,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapBarcode = (r: any): ProductBarcode => ({
  id: r.id, productId: r.product_id, value: r.value, type: r.type,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapPriceTier = (r: any): PriceTier => ({
  id: r.id, productId: r.product_id, shopId: r.shop_id ?? undefined,
  minQty: r.min_qty, maxQty: r.max_qty ?? undefined, priceMmk: r.price_mmk,
  isActive: r.is_active, createdAt: r.created_at, createdBy: r.created_by,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapInventory = (r: any): Inventory => ({
  shopId: r.shop_id, productId: r.product_id, qtyBaseUnits: r.qty_base_units,
  storageLocation: r.storage_location ?? undefined, lastCountedAt: r.last_counted_at ?? undefined,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapMovement = (r: any): InventoryMovement => ({
  id: r.id, shopId: r.shop_id, productId: r.product_id, type: r.type,
  qtyChange: r.qty_change, qtyBefore: r.qty_before, qtyAfter: r.qty_after,
  reason: r.reason, referenceType: r.reference_type ?? undefined,
  referenceId: r.reference_id ?? undefined, createdBy: r.created_by, createdAt: r.created_at,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapSupplier = (r: any): Supplier => ({
  id: r.id, code: r.code, name: r.name, contactPerson: r.contact_person ?? undefined,
  phone: r.phone ?? undefined, email: r.email ?? undefined, address: r.address ?? undefined,
  notes: r.notes ?? undefined, isActive: r.is_active, createdAt: r.created_at,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapPurchaseOrder = (r: any): PurchaseOrder => ({
  id: r.id, orderNo: r.order_no, shopId: r.shop_id, supplierId: r.supplier_id,
  status: r.status, subtotalMmk: r.subtotal_mmk, taxMmk: r.tax_mmk ?? undefined,
  totalMmk: r.total_mmk, paidMmk: r.paid_mmk ?? undefined,
  paymentStatus: r.payment_status ?? undefined,
  supplierInvoiceNo: r.supplier_invoice_no ?? undefined,
  deliveryNoteNo: r.delivery_note_no ?? undefined,
  notes: r.notes ?? undefined, createdBy: r.created_by,
  createdAt: r.created_at, approvedBy: r.approved_by ?? undefined,
  approvedAt: r.approved_at ?? undefined, receivedBy: r.received_by ?? undefined,
  receivedAt: r.received_at ?? undefined,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapPurchaseOrderItem = (r: any): PurchaseOrderItem => ({
  id: r.id, purchaseOrderId: r.purchase_order_id, productId: r.product_id,
  orderedQty: r.ordered_qty, receivedQty: r.received_qty ?? undefined,
  unitCostMmk: r.unit_cost_mmk, lineTotalMmk: r.line_total_mmk,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapSupplierPayment = (r: any): SupplierPayment => ({
  id: r.id, supplierId: r.supplier_id, purchaseOrderId: r.purchase_order_id,
  shopId: r.shop_id, amountMmk: r.amount_mmk, paymentMethod: r.payment_method,
  referenceNo: r.reference_no ?? undefined, notes: r.notes ?? undefined,
  paidAt: r.paid_at, createdBy: r.created_by, createdAt: r.created_at,
  voidedAt: r.voided_at ?? undefined, voidedBy: r.voided_by ?? undefined,
  voidReason: r.void_reason ?? undefined,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapStockTransfer = (r: any): StockTransfer => ({
  id: r.id, transferNo: r.transfer_no, fromShopId: r.from_shop_id, toShopId: r.to_shop_id,
  status: r.status, notes: r.notes ?? undefined, createdBy: r.created_by, createdAt: r.created_at,
  approvedBy: r.approved_by ?? undefined, approvedAt: r.approved_at ?? undefined,
  completedAt: r.completed_at ?? undefined, canceledBy: r.canceled_by ?? undefined,
  canceledAt: r.canceled_at ?? undefined, cancelReason: r.cancel_reason ?? undefined,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapStockTransferItem = (r: any): StockTransferItem => ({
  id: r.id, transferId: r.transfer_id, productId: r.product_id,
  requestedQty: r.requested_qty, approvedQty: r.approved_qty ?? undefined,
  transferredQty: r.transferred_qty ?? undefined,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapShift = (r: any): Shift => ({
  id: r.id, shopId: r.shop_id, cashierId: r.cashier_id, startedAt: r.started_at,
  endedAt: r.ended_at ?? undefined, openingCashMmk: r.opening_cash_mmk,
  closingCashMmk: r.closing_cash_mmk ?? undefined, expectedCashMmk: r.expected_cash_mmk ?? undefined,
  varianceMmk: r.variance_mmk ?? undefined, varianceReason: r.variance_reason ?? undefined,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapSale = (r: any): Sale => ({
  id: r.id, shopId: r.shop_id, shiftId: r.shift_id, receiptNo: r.receipt_no,
  cashierId: r.cashier_id, status: r.status, subtotalMmk: r.subtotal_mmk,
  discountMmk: r.discount_mmk, cartDiscountPct: r.cart_discount_pct ?? undefined,
  totalMmk: r.total_mmk, paymentMethod: r.payment_method,
  paidMmk: r.paid_mmk, changeMmk: r.change_mmk, createdAt: r.created_at,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapSaleItem = (r: any): SaleItem => ({
  saleId: r.sale_id, productId: r.product_id, qtyUnits: r.qty_units,
  unitPriceMmk: r.unit_price_mmk, itemDiscountPct: r.item_discount_pct ?? undefined,
  lineTotalMmk: r.line_total_mmk, priceOverriddenBy: r.price_overridden_by ?? undefined,
  unitLabel: r.unit_label ?? undefined, unitsPerItem: r.units_per_item ?? undefined,
  stockOverrideBy: r.stock_override_by ?? undefined,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapReprintLog = (r: any) => ({
  id: r.id, saleId: r.sale_id, printedBy: r.printed_by, printedAt: r.printed_at,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapRefund = (r: any): Refund => ({
  id: r.id, saleId: r.sale_id, shopId: r.shop_id, type: r.type,
  reason: r.reason, createdBy: r.created_by, createdAt: r.created_at,
  items: r.items ?? undefined, status: r.status ?? undefined,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapAuditLog = (r: any): AuditLog => ({
  id: r.id, shopId: r.shop_id ?? undefined, actorId: r.actor_id,
  actionType: r.action_type, message: r.message, entityType: r.entity_type,
  entityId: r.entity_id, createdAt: r.created_at,
});

// ============================================================
// Store
// ============================================================

export const useDataStore = create<DataState>()((...args) => {
  const [set, get] = args;
  return {
    ...createShopSlice(...args),
    ...createCategorySlice(...args),
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

    loadData: async (options) => {
      if (get().isLoading) return;
      if (get().isLoaded && !options?.force) return;
      set({ isLoading: true, loadError: null });
      try {
        const [
          shops, users, categories, products, barcodes, priceTiers,
          inventory, movements, suppliers, purchaseOrders, purchaseOrderItems, supplierPayments,
          stockTransfers, stockTransferItems, shifts, sales, saleItems,
          reprintLogs, refunds, auditLogs,
        ] = await Promise.all([
          supabase.from("shops").select("*"),
          supabase.from("users").select("*"),
          supabase.from("categories").select("*"),
          supabase.from("products").select("*"),
          supabase.from("product_barcodes").select("*"),
          supabase.from("price_tiers").select("*"),
          supabase.from("inventory").select("*"),
          supabase.from("inventory_movements").select("*").order("created_at", { ascending: false }).limit(500),
          supabase.from("suppliers").select("*"),
          supabase.from("purchase_orders").select("*"),
          supabase.from("purchase_order_items").select("*"),
          supabase.from("supplier_payments").select("*").order("paid_at", { ascending: false }),
          supabase.from("stock_transfers").select("*"),
          supabase.from("stock_transfer_items").select("*"),
          supabase.from("shifts").select("*"),
          supabase.from("sales").select("*").order("created_at", { ascending: false }).limit(1000),
          supabase.from("sale_items").select("*"),
          supabase.from("reprint_logs").select("*"),
          supabase.from("refund_void_requests").select("*"),
          supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(500),
        ]);

        // Surface RLS / network failures from any of the parallel reads.
        // The arrays default to [] otherwise — that would render an empty
        // shop with no error indication, hiding the real cause.
        const failedRead = [
          shops, users, categories, products, barcodes, priceTiers, inventory, movements,
          suppliers, purchaseOrders, purchaseOrderItems, supplierPayments,
          stockTransfers, stockTransferItems, shifts, sales, saleItems,
          reprintLogs, refunds, auditLogs,
        ].find((result) => result.error);
        if (failedRead?.error) throw failedRead.error;

        // Ensure currentShopId always points to a valid shop in the list
        let shopsList = (shops.data ?? []).map(mapShop);

        // Ensure currentShopId always points to a real shop
        const { currentShopId, setShopId } = useAppStore.getState();
        if (!currentShopId || !shopsList.find((s) => s.id === currentShopId)) {
          setShopId(shopsList[0]?.id ?? null);
        }

        const mappedRefunds = (refunds.data ?? []).map(mapRefund);
        set({
          shops: shopsList,
          users: (users.data ?? []).map(mapUser),
          categories: (categories.data ?? []).map(mapCategory),
          products: (products.data ?? []).map(mapProduct),
          barcodes: (barcodes.data ?? []).map(mapBarcode),
          priceTiers: (priceTiers.data ?? []).map(mapPriceTier),
          inventory: (inventory.data ?? []).map(mapInventory),
          movements: (movements.data ?? []).map(mapMovement),
          suppliers: (suppliers.data ?? []).map(mapSupplier),
          purchaseOrders: (purchaseOrders.data ?? []).map(mapPurchaseOrder),
          purchaseOrderItems: (purchaseOrderItems.data ?? []).map(mapPurchaseOrderItem),
          supplierPayments: (supplierPayments.data ?? []).map(mapSupplierPayment),
          stockTransfers: (stockTransfers.data ?? []).map(mapStockTransfer),
          stockTransferItems: (stockTransferItems.data ?? []).map(mapStockTransferItem),
          shifts: (shifts.data ?? []).map(mapShift),
          sales: (sales.data ?? []).map(mapSale),
          saleItems: (saleItems.data ?? []).map(mapSaleItem),
          reprintLogs: (reprintLogs.data ?? []).map(mapReprintLog),
          refunds: mappedRefunds,
          refundVoidRequests: mappedRefunds,
          auditLogs: (auditLogs.data ?? []).map(mapAuditLog),
          isLoading: false,
          isLoaded: true,
        });
      } catch (err) {
        const message = reportError("loadData", err, "Failed to load data. Please try again.");
        set({ isLoading: false, loadError: message });
      }
    },
  };
});

export type { DataState } from "./types";
