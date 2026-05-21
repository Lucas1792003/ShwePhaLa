import type { StateCreator } from "zustand";
import type { DataState, SaleState, CreateSaleInput } from "../types";
import type { AuditLog, InventoryMovement, Refund, Sale, SaleItem, StockMovementType } from "../../../types";
import { makeId, requirePermission } from "../utils";
import { buildReceiptNo, getDateKey } from "../../../lib/utils";
import { supabase } from "../../../lib/supabase";

export const createSaleSlice: StateCreator<DataState, [], [], SaleState> = (set, get) => ({
  sales: [],
  saleItems: [],
  refunds: [],
  refundVoidRequests: [],

  createSale: ({ shopId, cashierId, shiftId, cartItems, cartDiscountPct, paymentMethod, paidMmk }: CreateSaleInput) => {
    const state = get();
    requirePermission(state.users, cashierId, "pos:create_sale");

    const shop = state.shops.find((item) => item.id === shopId);
    const dateKey = getDateKey();
    const seq = state.sales.filter((sale) => sale.shopId === shopId && sale.receiptNo.includes(dateKey)).length + 1;
    const receiptNo = buildReceiptNo(shop?.code || "SHOP", dateKey, seq);

    const saleId = makeId("sale");
    const createdAt = new Date().toISOString();

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
      id: saleId, shopId, shiftId, receiptNo, cashierId, status: "NORMAL",
      subtotalMmk: subtotal, discountMmk, cartDiscountPct, totalMmk,
      paymentMethod, paidMmk, changeMmk: Math.max(0, paidMmk - totalMmk), createdAt,
    };

    const inventory = [...state.inventory];
    const movements: InventoryMovement[] = [];
    saleItems.forEach((item) => {
      const record = inventory.find((inv) => inv.shopId === shopId && inv.productId === item.productId);
      const qtyBefore = record?.qtyBaseUnits ?? 0;
      const qtyAfter = qtyBefore - item.qtyUnits;
      if (record) record.qtyBaseUnits = qtyAfter;
      movements.unshift({
        id: makeId("move"), shopId, productId: item.productId,
        type: "SALE_OUT" as StockMovementType, qtyChange: -item.qtyUnits,
        qtyBefore, qtyAfter, reason: `Sale ${receiptNo}`,
        referenceType: "sale", referenceId: saleId, createdBy: cashierId, createdAt,
      });
    });

    const auditLogs: AuditLog[] = [];
    saleItems.forEach((item) => {
      if (item.priceOverriddenBy) {
        auditLogs.unshift({
          id: makeId("audit"), shopId, actorId: item.priceOverriddenBy,
          actionType: "PRICE_OVERRIDE",
          message: `Price override for ${item.productId} at MMK ${item.unitPriceMmk}.`,
          entityType: "Sale", entityId: saleId, createdAt: sale.createdAt,
        });
      }
      if (item.stockOverrideBy) {
        auditLogs.unshift({
          id: makeId("audit"), shopId, actorId: item.stockOverrideBy,
          actionType: "STOCK_OVERRIDE",
          message: `Sold out-of-stock item ${item.productId}.`,
          entityType: "Sale", entityId: saleId, createdAt: sale.createdAt,
        });
      }
    });

    set(() => ({
      sales: [sale, ...state.sales],
      saleItems: [...saleItems, ...state.saleItems],
      inventory,
      movements: [...movements, ...state.movements],
      auditLogs: [...auditLogs, ...state.auditLogs],
    }));

    // Supabase writes (fire and forget)
    void supabase.from("sales").insert({
      id: sale.id, shop_id: sale.shopId, shift_id: sale.shiftId, receipt_no: sale.receiptNo,
      cashier_id: sale.cashierId, status: sale.status, subtotal_mmk: sale.subtotalMmk,
      discount_mmk: sale.discountMmk, cart_discount_pct: sale.cartDiscountPct,
      total_mmk: sale.totalMmk, payment_method: sale.paymentMethod,
      paid_mmk: sale.paidMmk, change_mmk: sale.changeMmk, created_at: sale.createdAt,
    });
    void supabase.from("sale_items").insert(
      saleItems.map((i) => ({
        sale_id: i.saleId, product_id: i.productId, qty_units: i.qtyUnits,
        unit_price_mmk: i.unitPriceMmk, item_discount_pct: i.itemDiscountPct,
        line_total_mmk: i.lineTotalMmk, price_overridden_by: i.priceOverriddenBy,
        unit_label: i.unitLabel, units_per_item: i.unitsPerItem,
        stock_override_by: i.stockOverrideBy,
      }))
    );
    void supabase.from("inventory").upsert(
      movements.map((m) => ({ shop_id: m.shopId, product_id: m.productId, qty_base_units: m.qtyAfter }))
    );
    void supabase.from("inventory_movements").insert(
      movements.map((m) => ({
        id: m.id, shop_id: m.shopId, product_id: m.productId, type: m.type,
        qty_change: m.qtyChange, qty_before: m.qtyBefore, qty_after: m.qtyAfter,
        reason: m.reason, reference_type: m.referenceType, reference_id: m.referenceId,
        created_by: m.createdBy, created_at: m.createdAt,
      }))
    );
    if (auditLogs.length > 0) {
      void supabase.from("audit_logs").insert(
        auditLogs.map((a) => ({
          id: a.id, shop_id: a.shopId, actor_id: a.actorId, action_type: a.actionType,
          message: a.message, entity_type: a.entityType, entity_id: a.entityId, created_at: a.createdAt,
        }))
      );
    }

    return saleId;
  },

  voidSale: ({ saleId, reason, actorId }) =>
    set((state) => {
      requirePermission(state.users, actorId, "pos:void_sale");

      const sale = state.sales.find((item) => item.id === saleId);
      if (!sale || sale.status !== "NORMAL") return state;

      const saleItems = state.saleItems.filter((item) => item.saleId === saleId);
      const inventory = [...state.inventory];
      const movements: InventoryMovement[] = [];
      const createdAt = new Date().toISOString();

      saleItems.forEach((item) => {
        const record = inventory.find((inv) => inv.shopId === sale.shopId && inv.productId === item.productId);
        const qtyBefore = record?.qtyBaseUnits ?? 0;
        const qtyAfter = qtyBefore + item.qtyUnits;
        if (record) {
          record.qtyBaseUnits = qtyAfter;
        } else {
          inventory.push({ shopId: sale.shopId, productId: item.productId, qtyBaseUnits: qtyAfter });
        }
        const movement: InventoryMovement = {
          id: makeId("move"), shopId: sale.shopId, productId: item.productId,
          type: "RETURN_IN" as StockMovementType, qtyChange: item.qtyUnits,
          qtyBefore, qtyAfter, reason: `Void sale ${sale.receiptNo}: ${reason}`,
          referenceType: "sale", referenceId: saleId, createdBy: actorId, createdAt,
        };
        movements.unshift(movement);
      });

      const updatedSales = state.sales.map((item) =>
        item.id === saleId ? { ...item, status: "VOID" as const } : item
      );

      const refund: Refund = {
        id: makeId("refund"), saleId, shopId: sale.shopId,
        type: "VOID", reason, createdBy: actorId, createdAt, status: "APPROVED",
      };

      const audit: AuditLog = {
        id: makeId("audit"), shopId: sale.shopId, actorId,
        actionType: "VOID_SALE", message: `Void sale ${sale.receiptNo}. Reason: ${reason}`,
        entityType: "Sale", entityId: saleId, createdAt,
      };

      void supabase.from("sales").update({ status: "VOID" }).eq("id", saleId);
      void supabase.from("refund_void_requests").insert({
        id: refund.id, sale_id: refund.saleId, shop_id: refund.shopId, type: refund.type,
        reason: refund.reason, created_by: refund.createdBy, created_at: refund.createdAt,
        status: refund.status,
      });
      void supabase.from("inventory").upsert(
        movements.map((m) => ({ shop_id: m.shopId, product_id: m.productId, qty_base_units: m.qtyAfter }))
      );
      void supabase.from("inventory_movements").insert(
        movements.map((m) => ({
          id: m.id, shop_id: m.shopId, product_id: m.productId, type: m.type,
          qty_change: m.qtyChange, qty_before: m.qtyBefore, qty_after: m.qtyAfter,
          reason: m.reason, reference_type: m.referenceType, reference_id: m.referenceId,
          created_by: m.createdBy, created_at: m.createdAt,
        }))
      );
      void supabase.from("audit_logs").insert({
        id: audit.id, shop_id: audit.shopId, actor_id: audit.actorId,
        action_type: audit.actionType, message: audit.message,
        entity_type: audit.entityType, entity_id: audit.entityId, created_at: audit.createdAt,
      });

      return {
        sales: updatedSales,
        refunds: [refund, ...state.refunds],
        refundVoidRequests: [refund, ...state.refundVoidRequests],
        inventory,
        movements: [...movements, ...state.movements],
        auditLogs: [audit, ...state.auditLogs],
      };
    }),

  requestVoid: ({ saleId, reason, actorId }) =>
    set((state) => {
      const sale = state.sales.find((item) => item.id === saleId);
      if (!sale || sale.status !== "NORMAL") return state;

      const refund: Refund = {
        id: makeId("refund"), saleId, shopId: sale.shopId,
        type: "VOID", reason, createdBy: actorId,
        createdAt: new Date().toISOString(), status: "REQUESTED",
      };

      void supabase.from("refund_void_requests").insert({
        id: refund.id, sale_id: refund.saleId, shop_id: refund.shopId, type: refund.type,
        reason: refund.reason, created_by: refund.createdBy, created_at: refund.createdAt,
        status: refund.status,
      });

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
        id: makeId("refund"), saleId, shopId: sale.shopId,
        type: "PARTIAL", reason, createdBy: actorId,
        createdAt: new Date().toISOString(), items, status: "REQUESTED",
      };

      void supabase.from("refund_void_requests").insert({
        id: refund.id, sale_id: refund.saleId, shop_id: refund.shopId, type: refund.type,
        reason: refund.reason, created_by: refund.createdBy, created_at: refund.createdAt,
        items: refund.items, status: refund.status,
      });

      return {
        refunds: [refund, ...state.refunds],
        refundVoidRequests: [refund, ...state.refundVoidRequests],
      };
    }),

  approveRefund: ({ refundId, approverId }) =>
    set((state) => {
      requirePermission(state.users, approverId, "pos:refund");

      const refund = state.refundVoidRequests.find((item) => item.id === refundId) ?? state.refunds.find((item) => item.id === refundId);
      if (!refund || refund.status === "APPROVED") return state;

      const sale = state.sales.find((item) => item.id === refund.saleId);
      if (!sale) return state;

      const inventory = [...state.inventory];
      const movements: InventoryMovement[] = [];
      const createdAt = new Date().toISOString();

      const createReturnMovement = (productId: string, qtyUnits: number) => {
        const record = inventory.find((inv) => inv.shopId === sale.shopId && inv.productId === productId);
        const qtyBefore = record?.qtyBaseUnits ?? 0;
        const qtyAfter = qtyBefore + qtyUnits;
        if (record) {
          record.qtyBaseUnits = qtyAfter;
        } else {
          inventory.push({ shopId: sale.shopId, productId, qtyBaseUnits: qtyAfter });
        }
        movements.unshift({
          id: makeId("move"), shopId: sale.shopId, productId,
          type: "RETURN_IN" as StockMovementType, qtyChange: qtyUnits,
          qtyBefore, qtyAfter,
          reason: `${refund.type === "VOID" ? "Void" : "Refund"} approved for ${sale.receiptNo}`,
          referenceType: "sale", referenceId: refund.saleId, createdBy: approverId, createdAt,
        });
      };

      if (refund.type === "VOID") {
        state.saleItems.filter((item) => item.saleId === sale.id).forEach((item) => createReturnMovement(item.productId, item.qtyUnits));
      } else if (refund.items) {
        refund.items.forEach((item) => createReturnMovement(item.productId, item.qtyUnits));
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
        id: makeId("audit"), shopId: sale.shopId, actorId: approverId,
        actionType: refund.type === "VOID" ? "VOID_SALE" : "REFUND",
        message: `${refund.type === "VOID" ? "Void" : "Refund"} approved for ${sale.receiptNo}.`,
        entityType: "Refund", entityId: refundId, createdAt,
      };

      void supabase.from("sales").update({ status: newStatus }).eq("id", sale.id);
      void supabase.from("refund_void_requests").update({ status: "APPROVED" }).eq("id", refundId);
      void supabase.from("inventory").upsert(
        movements.map((m) => ({ shop_id: m.shopId, product_id: m.productId, qty_base_units: m.qtyAfter }))
      );
      void supabase.from("inventory_movements").insert(
        movements.map((m) => ({
          id: m.id, shop_id: m.shopId, product_id: m.productId, type: m.type,
          qty_change: m.qtyChange, qty_before: m.qtyBefore, qty_after: m.qtyAfter,
          reason: m.reason, reference_type: m.referenceType, reference_id: m.referenceId,
          created_by: m.createdBy, created_at: m.createdAt,
        }))
      );
      void supabase.from("audit_logs").insert({
        id: audit.id, shop_id: audit.shopId, actor_id: audit.actorId,
        action_type: audit.actionType, message: audit.message,
        entity_type: audit.entityType, entity_id: audit.entityId, created_at: audit.createdAt,
      });

      return {
        refunds: updatedRefunds, refundVoidRequests: updatedRequests,
        sales: updatedSales, inventory,
        movements: [...movements, ...state.movements],
        auditLogs: [audit, ...state.auditLogs],
      };
    }),
});
