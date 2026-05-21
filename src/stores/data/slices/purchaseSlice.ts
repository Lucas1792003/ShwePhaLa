import type { StateCreator } from "zustand";
import type { DataState, PurchaseState, CreatePurchaseOrderInput } from "../types";
import type { AuditLog, PurchaseOrder, PurchaseOrderItem, PurchaseOrderStatus, Supplier, StockMovementType } from "../../../types";
import { makeId, makePurchaseOrderNo, requirePermission } from "../utils";
import { getDateKey } from "../../../lib/utils";

export const createPurchaseSlice: StateCreator<DataState, [], [], PurchaseState> = (set, get) => ({
  suppliers: [],
  purchaseOrders: [],
  purchaseOrderItems: [],

  addSupplier: (supplier: Supplier) =>
    set((state) => ({ suppliers: [...state.suppliers, supplier] })),

  updateSupplier: (supplier: Supplier) =>
    set((state) => ({
      suppliers: state.suppliers.map((s) => (s.id === supplier.id ? supplier : s)),
    })),

  createPurchaseOrder: ({ shopId, supplierId, items, notes, createdBy }: CreatePurchaseOrderInput) => {
    const state = get();

    // Permission check: creator must have purchase:create
    requirePermission(state.users, createdBy, "purchase:create");

    const seq = state.purchaseOrders.filter((po) => po.orderNo.includes(getDateKey())).length + 1;
    const purchaseOrderId = makeId("po");
    const orderNo = makePurchaseOrderNo(seq);
    const createdAt = new Date().toISOString();

    const poItems: PurchaseOrderItem[] = items.map((item) => ({
      id: makeId("poitem"),
      purchaseOrderId,
      productId: item.productId,
      orderedQty: item.orderedQty,
      unitCostMmk: item.unitCostMmk,
      lineTotalMmk: item.orderedQty * item.unitCostMmk,
    }));

    const subtotal = poItems.reduce((sum, item) => sum + item.lineTotalMmk, 0);

    const purchaseOrder: PurchaseOrder = {
      id: purchaseOrderId,
      orderNo,
      shopId,
      supplierId,
      status: "DRAFT",
      subtotalMmk: subtotal,
      totalMmk: subtotal,
      notes,
      createdBy,
      createdAt,
    };

    const audit: AuditLog = {
      id: makeId("audit"),
      shopId,
      actorId: createdBy,
      actionType: "PO_CREATED",
      message: `Purchase order ${orderNo} created: ${items.length} items`,
      entityType: "PurchaseOrder",
      entityId: purchaseOrderId,
      createdAt,
    };

    set((s) => ({
      purchaseOrders: [purchaseOrder, ...s.purchaseOrders],
      purchaseOrderItems: [...poItems, ...s.purchaseOrderItems],
      auditLogs: [audit, ...s.auditLogs],
    }));

    return purchaseOrderId;
  },

  approvePurchaseOrder: ({ purchaseOrderId, approverId }) =>
    set((state) => {
      // Permission check: approver must have purchase:approve
      requirePermission(state.users, approverId, "purchase:approve");

      const po = state.purchaseOrders.find((p) => p.id === purchaseOrderId);
      if (!po || (po.status !== "DRAFT" && po.status !== "SUBMITTED")) return state;

      const approvedAt = new Date().toISOString();
      const updatedPOs = state.purchaseOrders.map((p) =>
        p.id === purchaseOrderId
          ? { ...p, status: "APPROVED" as PurchaseOrderStatus, approvedBy: approverId, approvedAt }
          : p
      );

      const audit: AuditLog = {
        id: makeId("audit"),
        shopId: po.shopId,
        actorId: approverId,
        actionType: "PO_APPROVED",
        message: `Purchase order ${po.orderNo} approved`,
        entityType: "PurchaseOrder",
        entityId: purchaseOrderId,
        createdAt: approvedAt,
      };

      return {
        purchaseOrders: updatedPOs,
        auditLogs: [audit, ...state.auditLogs],
      };
    }),

  receivePurchaseOrder: ({ purchaseOrderId, receiverId, receivedItems }) =>
    set((state) => {
      // Permission check: receiver must have purchase:receive
      requirePermission(state.users, receiverId, "purchase:receive");

      const po = state.purchaseOrders.find((p) => p.id === purchaseOrderId);
      if (!po || po.status !== "APPROVED") return state;

      const receivedAt = new Date().toISOString();
      const inventory = [...state.inventory];
      const movements = [...state.movements];

      const updatedPOItems = state.purchaseOrderItems.map((item) => {
        if (item.purchaseOrderId !== purchaseOrderId) return item;
        const received = receivedItems.find((r) => r.productId === item.productId);
        const receivedQty = received?.receivedQty ?? item.orderedQty;

        const invRecord = inventory.find(
          (inv) => inv.shopId === po.shopId && inv.productId === item.productId
        );
        const qtyBefore = invRecord?.qtyBaseUnits ?? 0;
        const qtyAfter = qtyBefore + receivedQty;

        if (invRecord) {
          invRecord.qtyBaseUnits = qtyAfter;
        } else {
          inventory.push({
            shopId: po.shopId,
            productId: item.productId,
            qtyBaseUnits: qtyAfter,
          });
        }

        movements.unshift({
          id: makeId("move"),
          shopId: po.shopId,
          productId: item.productId,
          type: "PURCHASE_IN" as StockMovementType,
          qtyChange: receivedQty,
          qtyBefore,
          qtyAfter,
          reason: `Purchase order ${po.orderNo} received`,
          referenceType: "purchase",
          referenceId: purchaseOrderId,
          createdBy: receiverId,
          createdAt: receivedAt,
        });

        return { ...item, receivedQty };
      });

      const updatedPOs = state.purchaseOrders.map((p) =>
        p.id === purchaseOrderId
          ? { ...p, status: "RECEIVED" as PurchaseOrderStatus, receivedBy: receiverId, receivedAt }
          : p
      );

      const audit: AuditLog = {
        id: makeId("audit"),
        shopId: po.shopId,
        actorId: receiverId,
        actionType: "PO_RECEIVED",
        message: `Purchase order ${po.orderNo} received: ${receivedItems.length} items`,
        entityType: "PurchaseOrder",
        entityId: purchaseOrderId,
        createdAt: receivedAt,
      };

      return {
        purchaseOrders: updatedPOs,
        purchaseOrderItems: updatedPOItems,
        inventory,
        movements,
        auditLogs: [audit, ...state.auditLogs],
      };
    }),

  cancelPurchaseOrder: ({ purchaseOrderId, actorId }) =>
    set((state) => {
      // Permission check: actor must have purchase:create to cancel
      requirePermission(state.users, actorId, "purchase:create");

      const po = state.purchaseOrders.find((p) => p.id === purchaseOrderId);
      if (!po || po.status === "RECEIVED" || po.status === "CANCELED") return state;

      const updatedPOs = state.purchaseOrders.map((p) =>
        p.id === purchaseOrderId ? { ...p, status: "CANCELED" as PurchaseOrderStatus } : p
      );

      const audit: AuditLog = {
        id: makeId("audit"),
        shopId: po.shopId,
        actorId,
        actionType: "PO_CANCELED",
        message: `Purchase order ${po.orderNo} canceled`,
        entityType: "PurchaseOrder",
        entityId: purchaseOrderId,
        createdAt: new Date().toISOString(),
      };

      return {
        purchaseOrders: updatedPOs,
        auditLogs: [audit, ...state.auditLogs],
      };
    }),
});
