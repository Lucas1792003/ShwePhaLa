import type { StateCreator } from "zustand";
import type { DataState, SaleState, CreateSaleInput } from "../types";
import type { AuditLog, Refund, Sale, SaleItem, StockMovementType } from "../../../types";
import { makeId } from "../utils";
import { buildReceiptNo, getDateKey } from "../../../lib/utils";

export const createSaleSlice: StateCreator<DataState, [], [], SaleState> = (set, get) => ({
  sales: [],
  saleItems: [],
  refunds: [],
  refundVoidRequests: [],

  createSale: ({ shopId, cashierId, shiftId, cartItems, cartDiscountPct, paymentMethod, paidMmk }: CreateSaleInput) => {
    const state = get();
    const shop = state.shops.find((item) => item.id === shopId);
    const dateKey = getDateKey();
    const seq = state.sales.filter((sale) => sale.shopId === shopId && sale.receiptNo.includes(dateKey)).length + 1;
    const receiptNo = buildReceiptNo(shop?.code || "SHOP", dateKey, seq);

    const saleId = makeId("sale");
    const createdAt = new Date().toISOString();

    // Use tier-based pricing if available
    const saleItems: SaleItem[] = cartItems.map((item) => {
      const qtyUnits = item.qty * item.unitsPerItem;
      const tieredPrice = item.priceOverriddenBy
        ? item.unitPriceMmk
        : get().getProductPrice(item.productId, shopId, qtyUnits);
      const unitPrice = tieredPrice || item.unitPriceMmk;
      const itemDiscountPct = item.itemDiscountPct || 0;
      const lineTotal = Math.round(qtyUnits * unitPrice * (1 - itemDiscountPct / 100));
      return {
        saleId,
        productId: item.productId,
        qtyUnits,
        unitPriceMmk: unitPrice,
        itemDiscountPct: itemDiscountPct || undefined,
        lineTotalMmk: lineTotal,
        priceOverriddenBy: item.priceOverriddenBy,
        unitLabel: item.unitLabel,
        unitsPerItem: item.unitsPerItem,
        stockOverrideBy: item.stockOverrideBy,
      };
    });

    const subtotal = saleItems.reduce((sum, item) => sum + item.unitPriceMmk * item.qtyUnits, 0);
    const afterItemDiscount = saleItems.reduce((sum, item) => sum + item.lineTotalMmk, 0);
    const cartDiscountMmk = Math.round(afterItemDiscount * (cartDiscountPct / 100));
    const totalMmk = Math.max(0, afterItemDiscount - cartDiscountMmk);
    const discountMmk = subtotal - totalMmk;

    const sale: Sale = {
      id: saleId,
      shopId,
      shiftId,
      receiptNo,
      cashierId,
      status: "NORMAL",
      subtotalMmk: subtotal,
      discountMmk,
      cartDiscountPct,
      totalMmk,
      paymentMethod,
      paidMmk,
      changeMmk: Math.max(0, paidMmk - totalMmk),
      createdAt,
    };

    // Create SALE_OUT movements for each item
    const inventory = [...state.inventory];
    const movements = [...state.movements];
    saleItems.forEach((item) => {
      const record = inventory.find((inv) => inv.shopId === shopId && inv.productId === item.productId);
      const qtyBefore = record?.qtyBaseUnits ?? 0;
      const qtyAfter = Math.max(0, qtyBefore - item.qtyUnits);

      if (record) {
        record.qtyBaseUnits = qtyAfter;
      }

      movements.unshift({
        id: makeId("move"),
        shopId,
        productId: item.productId,
        type: "SALE_OUT" as StockMovementType,
        qtyChange: -item.qtyUnits,
        qtyBefore,
        qtyAfter,
        reason: `Sale ${receiptNo}`,
        referenceType: "sale",
        referenceId: saleId,
        createdBy: cashierId,
        createdAt,
      });
    });

    const auditLogs = [...state.auditLogs];
    saleItems.forEach((item) => {
      if (item.priceOverriddenBy) {
        auditLogs.unshift({
          id: makeId("audit"),
          shopId,
          actorId: item.priceOverriddenBy,
          actionType: "PRICE_OVERRIDE",
          message: `Price override for ${item.productId} at MMK ${item.unitPriceMmk}.`,
          entityType: "Sale",
          entityId: saleId,
          createdAt: sale.createdAt,
        });
      }
      if (item.stockOverrideBy) {
        auditLogs.unshift({
          id: makeId("audit"),
          shopId,
          actorId: item.stockOverrideBy,
          actionType: "STOCK_OVERRIDE",
          message: `Sold out-of-stock item ${item.productId}.`,
          entityType: "Sale",
          entityId: saleId,
          createdAt: sale.createdAt,
        });
      }
    });

    set(() => ({
      sales: [sale, ...state.sales],
      saleItems: [...saleItems, ...state.saleItems],
      inventory,
      movements,
      auditLogs,
    }));

    return saleId;
  },

  voidSale: ({ saleId, reason, actorId }) =>
    set((state) => {
      const sale = state.sales.find((item) => item.id === saleId);
      if (!sale || sale.status !== "NORMAL") return state;

      const saleItems = state.saleItems.filter((item) => item.saleId === saleId);
      const inventory = [...state.inventory];
      saleItems.forEach((item) => {
        const record = inventory.find((inv) => inv.shopId === sale.shopId && inv.productId === item.productId);
        if (record) record.qtyBaseUnits += item.qtyUnits;
      });

      const updatedSales = state.sales.map((item) =>
        item.id === saleId ? { ...item, status: "VOID" as const } : item
      );

      const refund: Refund = {
        id: makeId("refund"),
        saleId,
        shopId: sale.shopId,
        type: "VOID",
        reason,
        createdBy: actorId,
        createdAt: new Date().toISOString(),
        status: "APPROVED",
      };

      const audit: AuditLog = {
        id: makeId("audit"),
        shopId: sale.shopId,
        actorId,
        actionType: "VOID_SALE",
        message: `Void sale ${sale.receiptNo}. Reason: ${reason}`,
        entityType: "Sale",
        entityId: saleId,
        createdAt: refund.createdAt,
      };

      return {
        sales: updatedSales,
        refunds: [refund, ...state.refunds],
        refundVoidRequests: [refund, ...state.refundVoidRequests],
        inventory,
        auditLogs: [audit, ...state.auditLogs],
      };
    }),

  requestVoid: ({ saleId, reason, actorId }) =>
    set((state) => {
      const sale = state.sales.find((item) => item.id === saleId);
      if (!sale || sale.status !== "NORMAL") return state;

      const refund: Refund = {
        id: makeId("refund"),
        saleId,
        shopId: sale.shopId,
        type: "VOID",
        reason,
        createdBy: actorId,
        createdAt: new Date().toISOString(),
        status: "REQUESTED",
      };

      return {
        refunds: [refund, ...state.refunds],
        refundVoidRequests: [refund, ...state.refundVoidRequests],
      };
    }),

  requestRefund: ({ saleId, items, reason, actorId }) =>
    set((state) => {
      const sale = state.sales.find((item) => item.id === saleId);
      if (!sale) return state;

      const refund: Refund = {
        id: makeId("refund"),
        saleId,
        shopId: sale.shopId,
        type: "PARTIAL",
        reason,
        createdBy: actorId,
        createdAt: new Date().toISOString(),
        items,
        status: "REQUESTED",
      };

      return {
        refunds: [refund, ...state.refunds],
        refundVoidRequests: [refund, ...state.refundVoidRequests],
      };
    }),

  approveRefund: ({ refundId, approverId }) =>
    set((state) => {
      const refund = state.refundVoidRequests.find((item) => item.id === refundId) ?? state.refunds.find((item) => item.id === refundId);
      if (!refund || refund.status === "APPROVED") return state;

      const sale = state.sales.find((item) => item.id === refund.saleId);
      if (!sale) return state;

      const inventory = [...state.inventory];
      if (refund.type === "VOID") {
        const saleItems = state.saleItems.filter((item) => item.saleId === sale.id);
        saleItems.forEach((item) => {
          const record = inventory.find((inv) => inv.shopId === sale.shopId && inv.productId === item.productId);
          if (record) record.qtyBaseUnits += item.qtyUnits;
        });
      } else if (refund.items) {
        refund.items.forEach((item) => {
          const record = inventory.find((inv) => inv.shopId === sale.shopId && inv.productId === item.productId);
          if (record) record.qtyBaseUnits += item.qtyUnits;
        });
      }

      const newStatus = refund.type === "VOID" ? ("VOID" as const) : ("REFUNDED" as const);
      const updatedSales = state.sales.map((item) =>
        item.id === sale.id ? { ...item, status: newStatus } : item
      );

      const updatedRefunds = state.refunds.map((item) =>
        item.id === refundId ? { ...item, status: "APPROVED" as const } : item
      );
      const updatedRequests = state.refundVoidRequests.map((item) =>
        item.id === refundId ? { ...item, status: "APPROVED" as const } : item
      );

      const audit: AuditLog = {
        id: makeId("audit"),
        shopId: sale.shopId,
        actorId: approverId,
        actionType: refund.type === "VOID" ? "VOID_SALE" : "REFUND",
        message: `${refund.type === "VOID" ? "Void" : "Refund"} approved for ${sale.receiptNo}.`,
        entityType: "Refund",
        entityId: refundId,
        createdAt: new Date().toISOString(),
      };

      return {
        refunds: updatedRefunds,
        refundVoidRequests: updatedRequests,
        sales: updatedSales,
        inventory,
        auditLogs: [audit, ...state.auditLogs],
      };
    }),
});
