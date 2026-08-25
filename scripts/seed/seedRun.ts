import type { SupabaseClient } from "@supabase/supabase-js";
import {
  seedShops,
  seedUsers,
  seedCategories,
  seedProducts,
  seedProductUnits,
  seedBarcodes,
  seedPriceTiers,
  seedInventory,
  seedMovements,
  seedSuppliers,
  seedPurchaseOrders,
  seedPurchaseOrderItems,
  seedStockTransfers,
  seedStockTransferItems,
  seedShifts,
  seedSales,
  seedSaleItems,
  seedAuditLogs,
} from "./seedData";

// Shared insert sequence, parameterized on the client so both the guarded
// browser variant (anon key, RLS-gated, dev-only opt-in) and the
// service-role variant (Node, bypasses RLS) can reuse it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runSeed(supabase: SupabaseClient<any>) {
  const { error: shopsError } = await supabase.from("shops").insert(
    seedShops.map((s) => ({
      id: s.id, code: s.code, name: s.name, address: s.address,
      phone: s.phone, email: s.email, is_active: s.isActive, created_at: s.createdAt,
    }))
  );
  if (shopsError) { console.error("seed shops:", shopsError.message); return; }

  await supabase.from("users").insert(
    seedUsers.map((u) => ({
      id: u.id, name: u.name, email: u.email, role: u.role,
      shop_id: u.shopId, permissions: u.permissions, is_active: u.isActive, created_at: u.createdAt,
    }))
  );

  await supabase.from("categories").insert(
    seedCategories.map((c) => ({
      id: c.id, name: c.name, color: c.color, is_active: c.isActive, created_at: c.createdAt,
    }))
  );

  await supabase.from("products").insert(
    seedProducts.map((p) => ({
      id: p.id, sku: p.sku, name: p.name, category: p.category, unit_type: p.unitType,
      price_mmk: p.priceMmk, cost_mmk: p.costMmk, pack_size: p.packSize,
      low_stock_threshold: p.lowStockThreshold, expiry_date: p.expiryDate,
      image_url: p.imageUrl, is_active: p.isActive, created_at: p.createdAt,
    }))
  );

  await supabase.from("product_units").insert(
    seedProductUnits.map((u) => ({
      id: u.id,
      product_id: u.productId,
      name: u.name,
      base_quantity: u.baseQuantity,
      sale_price_mmk: u.salePriceMmk,
      purchase_price_mmk: u.purchasePriceMmk ?? null,
      is_default: u.isDefault,
      is_active: u.isActive,
      sort_order: u.sortOrder,
      created_at: u.createdAt,
      updated_at: u.updatedAt,
    }))
  );

  await supabase.from("product_barcodes").insert(
    seedBarcodes.map((b) => ({
      id: b.id,
      product_id: b.productId,
      product_unit_id: b.productUnitId ?? null,
      value: b.value,
      type: b.type,
    }))
  );

  await supabase.from("price_tiers").insert(
    seedPriceTiers.map((t) => ({
      id: t.id, product_id: t.productId, shop_id: t.shopId, min_qty: t.minQty,
      max_qty: t.maxQty, price_mmk: t.priceMmk, is_active: t.isActive,
      created_at: t.createdAt, created_by: t.createdBy,
    }))
  );

  await supabase.from("inventory").insert(
    seedInventory.map((i) => ({
      shop_id: i.shopId, product_id: i.productId, qty_base_units: i.qtyBaseUnits,
    }))
  );

  await supabase.from("inventory_movements").insert(
    seedMovements.map((m) => ({
      id: m.id, shop_id: m.shopId, product_id: m.productId, type: m.type,
      qty_change: m.qtyChange, qty_before: m.qtyBefore, qty_after: m.qtyAfter,
      reason: m.reason, reference_type: m.referenceType, reference_id: m.referenceId,
      created_by: m.createdBy, created_at: m.createdAt,
    }))
  );

  await supabase.from("suppliers").insert(
    seedSuppliers.map((s) => ({
      id: s.id, code: s.code, name: s.name, contact_person: s.contactPerson,
      phone: s.phone, email: s.email, address: s.address, notes: s.notes,
      is_active: s.isActive, created_at: s.createdAt,
    }))
  );

  await supabase.from("purchase_orders").insert(
    seedPurchaseOrders.map((o) => ({
      id: o.id, order_no: o.orderNo, shop_id: o.shopId, supplier_id: o.supplierId,
      status: o.status, subtotal_mmk: o.subtotalMmk, tax_mmk: o.taxMmk,
      total_mmk: o.totalMmk, paid_mmk: o.paidMmk, payment_status: o.paymentStatus,
      supplier_invoice_no: o.supplierInvoiceNo, delivery_note_no: o.deliveryNoteNo,
      notes: o.notes, created_by: o.createdBy,
      created_at: o.createdAt, approved_by: o.approvedBy, approved_at: o.approvedAt,
      received_by: o.receivedBy, received_at: o.receivedAt,
    }))
  );

  await supabase.from("purchase_order_items").insert(
    seedPurchaseOrderItems.map((i) => ({
      id: i.id, purchase_order_id: i.purchaseOrderId, product_id: i.productId,
      ordered_qty: i.orderedQty, received_qty: i.receivedQty,
      unit_cost_mmk: i.unitCostMmk, line_total_mmk: i.lineTotalMmk,
    }))
  );

  await supabase.from("stock_transfers").insert(
    seedStockTransfers.map((t) => ({
      id: t.id, transfer_no: t.transferNo, from_shop_id: t.fromShopId,
      to_shop_id: t.toShopId, status: t.status, notes: t.notes,
      created_by: t.createdBy, created_at: t.createdAt,
    }))
  );

  await supabase.from("stock_transfer_items").insert(
    seedStockTransferItems.map((i) => ({
      id: i.id, transfer_id: i.transferId, product_id: i.productId,
      requested_qty: i.requestedQty,
    }))
  );

  await supabase.from("shifts").insert(
    seedShifts.map((s) => ({
      id: s.id, shop_id: s.shopId, cashier_id: s.cashierId,
      started_at: s.startedAt, ended_at: s.endedAt,
      opening_cash_mmk: s.openingCashMmk, closing_cash_mmk: s.closingCashMmk,
      expected_cash_mmk: s.expectedCashMmk, variance_mmk: s.varianceMmk,
    }))
  );

  await supabase.from("sales").insert(
    seedSales.map((s) => ({
      id: s.id, shop_id: s.shopId, shift_id: s.shiftId, receipt_no: s.receiptNo,
      cashier_id: s.cashierId, status: s.status, subtotal_mmk: s.subtotalMmk,
      discount_mmk: s.discountMmk, cart_discount_pct: s.cartDiscountPct,
      total_mmk: s.totalMmk, payment_method: s.paymentMethod,
      paid_mmk: s.paidMmk, change_mmk: s.changeMmk, created_at: s.createdAt,
    }))
  );

  await supabase.from("sale_items").insert(
    seedSaleItems.map((i, index) => ({
      id: i.id ?? `item-seed-${index}`,
      sale_id: i.saleId, product_id: i.productId, product_unit_id: i.productUnitId ?? null,
      qty_units: i.qtyUnits,
      unit_price_mmk: i.unitPriceMmk, item_discount_pct: i.itemDiscountPct,
      line_total_mmk: i.lineTotalMmk, price_overridden_by: i.priceOverriddenBy,
      unit_label: i.unitLabel, units_per_item: i.unitsPerItem,
      unit_name_snapshot: i.unitNameSnapshot ?? i.unitLabel,
      unit_base_quantity_snapshot: i.unitBaseQuantitySnapshot ?? i.unitsPerItem ?? 1,
      unit_price_mmk_snapshot: i.unitPriceMmkSnapshot ?? i.unitPriceMmk,
      base_quantity_sold: i.baseQuantitySold ?? i.qtyUnits,
      stock_override_by: i.stockOverrideBy,
    }))
  );

  await supabase.from("audit_logs").insert(
    seedAuditLogs.map((a) => ({
      id: a.id, shop_id: a.shopId, actor_id: a.actorId, action_type: a.actionType,
      message: a.message, entity_type: a.entityType, entity_id: a.entityId,
      created_at: a.createdAt,
    }))
  );
}
