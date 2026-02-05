import type { StateCreator } from "zustand";
import type { DataState, TransferState, CreateTransferInput } from "../types";
import type { AuditLog, StockTransfer, StockTransferItem, TransferStatus, StockMovementType } from "../../../types";
import { makeId, makeTransferNo } from "../utils";
import { getDateKey } from "../../../lib/utils";

export const createTransferSlice: StateCreator<DataState, [], [], TransferState> = (set, get) => ({
  stockTransfers: [],
  stockTransferItems: [],

  createTransfer: ({ fromShopId, toShopId, items, notes, createdBy }: CreateTransferInput) => {
    const state = get();
    const seq = state.stockTransfers.filter((t) => t.transferNo.includes(getDateKey())).length + 1;
    const transferId = makeId("transfer");
    const transferNo = makeTransferNo(seq);
    const createdAt = new Date().toISOString();

    // Validate stock availability
    for (const item of items) {
      const availableQty = state.inventory.find(
        (inv) => inv.shopId === fromShopId && inv.productId === item.productId
      )?.qtyBaseUnits ?? 0;
      if (item.requestedQty > availableQty) {
        throw new Error(`Insufficient stock for product ${item.productId}. Available: ${availableQty}, Requested: ${item.requestedQty}`);
      }
    }

    const transfer: StockTransfer = {
      id: transferId,
      transferNo,
      fromShopId,
      toShopId,
      status: "PENDING",
      notes,
      createdBy,
      createdAt,
    };

    const transferItems: StockTransferItem[] = items.map((item) => ({
      id: makeId("titem"),
      transferId,
      productId: item.productId,
      requestedQty: item.requestedQty,
    }));

    const audit: AuditLog = {
      id: makeId("audit"),
      shopId: fromShopId,
      actorId: createdBy,
      actionType: "TRANSFER_CREATED",
      message: `Transfer ${transferNo} created: ${items.length} items to shop ${toShopId}`,
      entityType: "StockTransfer",
      entityId: transferId,
      createdAt,
    };

    set((s) => ({
      stockTransfers: [transfer, ...s.stockTransfers],
      stockTransferItems: [...transferItems, ...s.stockTransferItems],
      auditLogs: [audit, ...s.auditLogs],
    }));

    return transferId;
  },

  approveTransfer: ({ transferId, approverId, approvedItems }) =>
    set((state) => {
      const transfer = state.stockTransfers.find((t) => t.id === transferId);
      if (!transfer || transfer.status !== "PENDING") return state;

      const items = state.stockTransferItems.filter((i) => i.transferId === transferId);
      const approvedAt = new Date().toISOString();

      const updatedItems = items.map((item) => {
        const approved = approvedItems?.find((a) => a.productId === item.productId);
        return {
          ...item,
          approvedQty: approved?.approvedQty ?? item.requestedQty,
        };
      });

      const updatedTransfers = state.stockTransfers.map((t) =>
        t.id === transferId
          ? { ...t, status: "APPROVED" as TransferStatus, approvedBy: approverId, approvedAt }
          : t
      );

      const audit: AuditLog = {
        id: makeId("audit"),
        shopId: transfer.fromShopId,
        actorId: approverId,
        actionType: "TRANSFER_APPROVED",
        message: `Transfer ${transfer.transferNo} approved`,
        entityType: "StockTransfer",
        entityId: transferId,
        createdAt: approvedAt,
      };

      return {
        stockTransfers: updatedTransfers,
        stockTransferItems: state.stockTransferItems.map((i) => {
          const updated = updatedItems.find((u) => u.id === i.id);
          return updated ?? i;
        }),
        auditLogs: [audit, ...state.auditLogs],
      };
    }),

  rejectTransfer: ({ transferId, actorId, reason }) =>
    set((state) => {
      const transfer = state.stockTransfers.find((t) => t.id === transferId);
      if (!transfer || transfer.status !== "PENDING") return state;

      const canceledAt = new Date().toISOString();
      const updatedTransfers = state.stockTransfers.map((t) =>
        t.id === transferId
          ? { ...t, status: "REJECTED" as TransferStatus, canceledBy: actorId, canceledAt, cancelReason: reason }
          : t
      );

      const audit: AuditLog = {
        id: makeId("audit"),
        shopId: transfer.fromShopId,
        actorId,
        actionType: "TRANSFER_REJECTED",
        message: `Transfer ${transfer.transferNo} rejected: ${reason}`,
        entityType: "StockTransfer",
        entityId: transferId,
        createdAt: canceledAt,
      };

      return {
        stockTransfers: updatedTransfers,
        auditLogs: [audit, ...state.auditLogs],
      };
    }),

  completeTransfer: ({ transferId, actorId }) =>
    set((state) => {
      const transfer = state.stockTransfers.find((t) => t.id === transferId);
      if (!transfer || transfer.status !== "APPROVED") return state;

      const items = state.stockTransferItems.filter((i) => i.transferId === transferId);
      const completedAt = new Date().toISOString();
      const inventory = [...state.inventory];
      const movements = [...state.movements];

      items.forEach((item) => {
        const qty = item.approvedQty ?? item.requestedQty;

        // TRANSFER_OUT from source shop
        const sourceRecord = inventory.find(
          (inv) => inv.shopId === transfer.fromShopId && inv.productId === item.productId
        );
        const sourceQtyBefore = sourceRecord?.qtyBaseUnits ?? 0;
        const sourceQtyAfter = Math.max(0, sourceQtyBefore - qty);
        if (sourceRecord) {
          sourceRecord.qtyBaseUnits = sourceQtyAfter;
        }

        movements.unshift({
          id: makeId("move"),
          shopId: transfer.fromShopId,
          productId: item.productId,
          type: "TRANSFER_OUT" as StockMovementType,
          qtyChange: -qty,
          qtyBefore: sourceQtyBefore,
          qtyAfter: sourceQtyAfter,
          reason: `Transfer ${transfer.transferNo} to ${transfer.toShopId}`,
          referenceType: "transfer",
          referenceId: transferId,
          createdBy: actorId,
          createdAt: completedAt,
        });

        // TRANSFER_IN to destination shop
        const destRecord = inventory.find(
          (inv) => inv.shopId === transfer.toShopId && inv.productId === item.productId
        );
        const destQtyBefore = destRecord?.qtyBaseUnits ?? 0;
        const destQtyAfter = destQtyBefore + qty;
        if (destRecord) {
          destRecord.qtyBaseUnits = destQtyAfter;
        } else {
          inventory.push({
            shopId: transfer.toShopId,
            productId: item.productId,
            qtyBaseUnits: destQtyAfter,
          });
        }

        movements.unshift({
          id: makeId("move"),
          shopId: transfer.toShopId,
          productId: item.productId,
          type: "TRANSFER_IN" as StockMovementType,
          qtyChange: qty,
          qtyBefore: destQtyBefore,
          qtyAfter: destQtyAfter,
          reason: `Transfer ${transfer.transferNo} from ${transfer.fromShopId}`,
          referenceType: "transfer",
          referenceId: transferId,
          createdBy: actorId,
          createdAt: completedAt,
        });
      });

      const updatedTransferItems = state.stockTransferItems.map((i) => {
        if (i.transferId !== transferId) return i;
        return { ...i, transferredQty: i.approvedQty ?? i.requestedQty };
      });

      const updatedTransfers = state.stockTransfers.map((t) =>
        t.id === transferId
          ? { ...t, status: "COMPLETED" as TransferStatus, completedAt }
          : t
      );

      const audit: AuditLog = {
        id: makeId("audit"),
        shopId: transfer.fromShopId,
        actorId,
        actionType: "TRANSFER_COMPLETED",
        message: `Transfer ${transfer.transferNo} completed: ${items.length} items moved`,
        entityType: "StockTransfer",
        entityId: transferId,
        createdAt: completedAt,
      };

      return {
        stockTransfers: updatedTransfers,
        stockTransferItems: updatedTransferItems,
        inventory,
        movements,
        auditLogs: [audit, ...state.auditLogs],
      };
    }),

  cancelTransfer: ({ transferId, actorId, reason }) =>
    set((state) => {
      const transfer = state.stockTransfers.find((t) => t.id === transferId);
      if (!transfer || transfer.status === "COMPLETED" || transfer.status === "CANCELED") return state;

      const canceledAt = new Date().toISOString();
      const updatedTransfers = state.stockTransfers.map((t) =>
        t.id === transferId
          ? { ...t, status: "CANCELED" as TransferStatus, canceledBy: actorId, canceledAt, cancelReason: reason }
          : t
      );

      const audit: AuditLog = {
        id: makeId("audit"),
        shopId: transfer.fromShopId,
        actorId,
        actionType: "TRANSFER_CANCELED",
        message: `Transfer ${transfer.transferNo} canceled: ${reason}`,
        entityType: "StockTransfer",
        entityId: transferId,
        createdAt: canceledAt,
      };

      return {
        stockTransfers: updatedTransfers,
        auditLogs: [audit, ...state.auditLogs],
      };
    }),

  getTransfersByShop: (shopId: string) =>
    get().stockTransfers.filter((t) => t.fromShopId === shopId || t.toShopId === shopId),

  getPendingTransfersForApproval: (shopId: string) =>
    get().stockTransfers.filter((t) => t.fromShopId === shopId && t.status === "PENDING"),
});
