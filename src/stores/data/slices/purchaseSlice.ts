import type { StateCreator } from "zustand";
import type { DataState, PurchaseState, CreatePurchaseOrderInput } from "../types";
import type {
  AuditLog, Inventory, InventoryMovement, PurchaseOrder, PurchaseOrderItem,
  Supplier, SupplierPayment,
} from "../../../types";
import { supabase, dbExec } from "../../../lib/supabase";

// Shape returned by the receive_purchase_order RPC (camelCase keys).
interface ReceivePurchaseOrderResult {
  purchaseOrder: PurchaseOrder;
  purchaseOrderItems: PurchaseOrderItem[];
  inventory: Inventory[];
  movements: InventoryMovement[];
  auditLogs: AuditLog[];
}

interface CreatePurchaseOrderResult {
  purchaseOrder: PurchaseOrder;
  purchaseOrderItems: PurchaseOrderItem[];
  auditLogs: AuditLog[];
}

interface PurchaseOrderStatusResult {
  purchaseOrder: PurchaseOrder;
  auditLogs: AuditLog[];
}

interface RecordSupplierPaymentResult {
  purchaseOrder: PurchaseOrder;
  supplierPayment: SupplierPayment;
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

// snake_case row mappers for purchasing tables
const supplierRow = (s: Supplier) => ({
  id: s.id, code: s.code, name: s.name, contact_person: s.contactPerson ?? null,
  phone: s.phone ?? null, email: s.email ?? null, address: s.address ?? null,
  notes: s.notes ?? null, is_active: s.isActive, created_at: s.createdAt,
});

export const createPurchaseSlice: StateCreator<DataState, [], [], PurchaseState> = (set) => ({
  suppliers: [],
  purchaseOrders: [],
  purchaseOrderItems: [],
  supplierPayments: [],

  addSupplier: async (supplier: Supplier) => {
    await dbExec(supabase.from("suppliers").insert(supplierRow(supplier)), "Add supplier");
    set((state) => ({ suppliers: [...state.suppliers, supplier] }));
  },

  updateSupplier: async (supplier: Supplier) => {
    await dbExec(
      supabase.from("suppliers").update({
        code: supplier.code, name: supplier.name, contact_person: supplier.contactPerson ?? null,
        phone: supplier.phone ?? null, email: supplier.email ?? null,
        address: supplier.address ?? null, notes: supplier.notes ?? null, is_active: supplier.isActive,
      }).eq("id", supplier.id),
      "Update supplier"
    );
    set((state) => ({
      suppliers: state.suppliers.map((s) => (s.id === supplier.id ? supplier : s)),
    }));
  },

  createPurchaseOrder: async ({ shopId, supplierId, items, notes }: CreatePurchaseOrderInput) => {
    const { data, error } = await supabase.rpc("create_purchase_order", {
      p_shop_id: shopId,
      p_supplier_id: supplierId,
      p_notes: notes ?? null,
      p_items: items.map((item) => ({
        product_id: item.productId,
        ordered_qty: item.orderedQty,
        unit_cost_mmk: item.unitCostMmk,
      })),
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Create purchase order returned no data.");
    const result = data as CreatePurchaseOrderResult;

    set((s) => ({
      purchaseOrders: [result.purchaseOrder, ...s.purchaseOrders],
      purchaseOrderItems: [...result.purchaseOrderItems, ...s.purchaseOrderItems],
      auditLogs: [...result.auditLogs, ...s.auditLogs],
    }));
    return result.purchaseOrder.id;
  },

  approvePurchaseOrder: async ({ purchaseOrderId }) => {
    const { data, error } = await supabase.rpc("approve_purchase_order", {
      p_purchase_order_id: purchaseOrderId,
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Approve purchase order returned no data.");
    const result = data as PurchaseOrderStatusResult;

    set((s) => ({
      purchaseOrders: s.purchaseOrders.map((p) =>
        p.id === result.purchaseOrder.id ? result.purchaseOrder : p
      ),
      auditLogs: [...result.auditLogs, ...s.auditLogs],
    }));
  },

  // Purchase receiving: a single atomic Supabase RPC. The database validates
  // permission, shop scope and the PO status, then writes the PO status,
  // received quantities, inventory, movements and audit row in one transaction.
  receivePurchaseOrder: async ({ purchaseOrderId, receivedItems }) => {
    const { data, error } = await supabase.rpc("receive_purchase_order", {
      p_purchase_order_id: purchaseOrderId,
      p_received_items: receivedItems.map((r) => ({
        product_id: r.productId,
        received_qty: r.receivedQty,
      })),
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Receiving returned no data.");

    const result = data as ReceivePurchaseOrderResult;

    // Reconcile local state from the authoritative RPC result.
    set((s) => ({
      purchaseOrders: s.purchaseOrders.map((p) =>
        p.id === result.purchaseOrder.id ? result.purchaseOrder : p
      ),
      purchaseOrderItems: s.purchaseOrderItems.map(
        (i) => result.purchaseOrderItems.find((u) => u.id === i.id) ?? i
      ),
      inventory: mergeInventory(s.inventory, result.inventory),
      movements: [...result.movements, ...s.movements],
      auditLogs: [...result.auditLogs, ...s.auditLogs],
    }));
  },

  cancelPurchaseOrder: async ({ purchaseOrderId }) => {
    const { data, error } = await supabase.rpc("cancel_purchase_order", {
      p_purchase_order_id: purchaseOrderId,
      p_reason: null,
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Cancel purchase order returned no data.");
    const result = data as PurchaseOrderStatusResult;

    set((s) => ({
      purchaseOrders: s.purchaseOrders.map((p) =>
        p.id === result.purchaseOrder.id ? result.purchaseOrder : p
      ),
      auditLogs: [...result.auditLogs, ...s.auditLogs],
    }));
  },

  recordSupplierPayment: async ({ purchaseOrderId, amountMmk, paymentMethod, referenceNo, notes }) => {
    const { data, error } = await supabase.rpc("record_supplier_payment", {
      p_purchase_order_id: purchaseOrderId,
      p_amount_mmk: amountMmk,
      p_payment_method: paymentMethod,
      p_reference_no: referenceNo ?? null,
      p_notes: notes ?? null,
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Record supplier payment returned no data.");
    const result = data as RecordSupplierPaymentResult;

    set((s) => ({
      purchaseOrders: s.purchaseOrders.map((p) =>
        p.id === result.purchaseOrder.id ? result.purchaseOrder : p
      ),
      supplierPayments: [result.supplierPayment, ...s.supplierPayments],
      auditLogs: [...result.auditLogs, ...s.auditLogs],
    }));
  },
});

