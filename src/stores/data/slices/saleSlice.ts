import type { StateCreator } from "zustand";
import type { DataState, SaleState, CreateSaleInput } from "../types";
import type { AuditLog, Inventory, InventoryMovement, Refund, Sale, SaleItem } from "../../../types";
import { supabase } from "../../../lib/supabase";

// Shape returned by the complete_sale RPC (keys are already camelCase).
interface CompleteSaleResult {
  sale: Sale;
  items: SaleItem[];
  movements: InventoryMovement[];
  inventory: Inventory[];
  auditLogs: AuditLog[];
  shopName: string;
  cashierName: string;
}

interface ApprovalResult {
  request: Refund;
  sale: Sale;
  movements: InventoryMovement[];
  inventory: Inventory[];
  auditLogs: AuditLog[];
}

interface RequestResult {
  request: Refund;
  auditLogs: AuditLog[];
}

// Merge RPC-returned inventory rows into the current store array.
const mergeInventory = (current: Inventory[], updates: Inventory[]): Inventory[] => {
  const result = [...current];
  for (const u of updates) {
    const idx = result.findIndex((i) => i.shopId === u.shopId && i.productId === u.productId);
    if (idx >= 0) result[idx] = { ...result[idx], qtyBaseUnits: u.qtyBaseUnits };
    else result.push(u);
  }
  return result;
};

const mergeRefundRequest = (current: Refund[], request: Refund): Refund[] => {
  const exists = current.some((item) => item.id === request.id);
  if (!exists) return [request, ...current];
  return current.map((item) => (item.id === request.id ? request : item));
};

export const createSaleSlice: StateCreator<DataState, [], [], SaleState> = (set, get) => ({
  sales: [],
  saleItems: [],
  refunds: [],
  refundVoidRequests: [],

  // POS checkout: a single atomic Supabase RPC. The database validates
  // permission, shop scope, the open shift, stock and overrides, then writes
  // the sale, items, inventory, movements and audit rows in one transaction.
  createSale: async ({ shopId, shiftId, cartItems, cartDiscountPct, paymentMethod, paidMmk }: CreateSaleInput) => {
    // Send the selected sellable unit. The RPC validates unit membership,
    // active status, stock deduction, and price server-side.
    const items = cartItems.map((item) => {
      const baseQuantitySold = item.qty * item.unitBaseQuantity;
      const productUnit = get().productUnits.find((unit) => unit.id === item.productUnitId);
      const unitPrice = item.priceOverriddenBy
        ? item.unitPriceMmk
        : productUnit?.isDefault && item.unitBaseQuantity === 1
          ? get().getProductPrice(item.productId, shopId, baseQuantitySold) || item.unitPriceMmk
          : item.unitPriceMmk;
      return {
        product_id: item.productId,
        product_unit_id: item.productUnitId,
        qty: item.qty,
        units_per_item: item.unitBaseQuantity,
        unit_price_mmk: unitPrice,
        item_discount_pct: item.itemDiscountPct ?? 0,
        unit_label: item.unitName,
        price_overridden: Boolean(item.priceOverriddenBy),
        stock_override_requested: Boolean(item.stockOverrideBy),
      };
    });

    const { data, error } = await supabase.rpc("complete_sale", {
      p_shop_id: shopId,
      p_shift_id: shiftId,
      p_payment_method: paymentMethod,
      p_paid_mmk: paidMmk,
      p_cart_discount_pct: cartDiscountPct,
      p_items: items,
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Checkout returned no data.");

    const result = data as CompleteSaleResult;

    // Reconcile local state from the authoritative RPC result.
    set((state) => ({
      sales: [result.sale, ...state.sales],
      saleItems: [...result.items, ...state.saleItems],
      inventory: mergeInventory(state.inventory, result.inventory),
      movements: [...result.movements, ...state.movements],
      auditLogs: [...result.auditLogs, ...state.auditLogs],
    }));

    return result.sale.id;
  },

  voidSale: async ({ saleId, reason }) => {
    const { data, error } = await supabase.rpc("create_refund_void_request", {
      p_sale_id: saleId,
      p_type: "VOID",
      p_reason: reason,
      p_items: null,
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Void request returned no data.");
    const result = data as RequestResult;

    set((state) => ({
      refunds: mergeRefundRequest(state.refunds, result.request),
      refundVoidRequests: mergeRefundRequest(state.refundVoidRequests, result.request),
      auditLogs: [...result.auditLogs, ...state.auditLogs],
    }));
  },

  requestVoid: async ({ saleId, reason }) => {
    const { data, error } = await supabase.rpc("create_refund_void_request", {
      p_sale_id: saleId,
      p_type: "VOID",
      p_reason: reason,
      p_items: null,
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Void request returned no data.");
    const result = data as RequestResult;

    set((state) => ({
      refunds: mergeRefundRequest(state.refunds, result.request),
      refundVoidRequests: mergeRefundRequest(state.refundVoidRequests, result.request),
      auditLogs: [...result.auditLogs, ...state.auditLogs],
    }));
  },

  requestRefund: async ({ saleId, items, reason }) => {
    const { data, error } = await supabase.rpc("create_refund_void_request", {
      p_sale_id: saleId,
      p_type: "PARTIAL",
      p_reason: reason,
      p_items: items.map((item) => ({
        productId: item.productId,
        qtyUnits: item.qtyUnits,
        amountMmk: item.amountMmk,
      })),
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Refund request returned no data.");
    const result = data as RequestResult;

    set((state) => ({
      refunds: mergeRefundRequest(state.refunds, result.request),
      refundVoidRequests: mergeRefundRequest(state.refundVoidRequests, result.request),
      auditLogs: [...result.auditLogs, ...state.auditLogs],
    }));
  },

  approveRefund: async ({ refundId }) => {
    const request = get().refundVoidRequests.find((item) => item.id === refundId) ?? get().refunds.find((item) => item.id === refundId);
    if (!request) throw new Error("Refund or void request not found.");

    const rpcName = request.type === "VOID" ? "approve_void_request" : "approve_refund_request";
    const { data, error } = await supabase.rpc(rpcName, { p_request_id: refundId });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Approval returned no data.");

    const result = data as ApprovalResult;

    set((state) => ({
      refunds: mergeRefundRequest(state.refunds, result.request),
      refundVoidRequests: mergeRefundRequest(state.refundVoidRequests, result.request),
      sales: state.sales.map((sale) => (sale.id === result.sale.id ? result.sale : sale)),
      inventory: mergeInventory(state.inventory, result.inventory),
      movements: [...result.movements, ...state.movements],
      auditLogs: [...result.auditLogs, ...state.auditLogs],
    }));
  },
});
