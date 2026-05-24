import type {
  AuditLog,
  Inventory,
  Permission,
  Product,
  PurchaseOrder,
  RefundVoidRequest,
  Sale,
  SaleItem,
  Shift,
  Shop,
  StockTransfer,
  Supplier,
  User,
} from "../../types";
import { hasPermission } from "../../lib/permissions";

// ============================================================
// Dashboard calculation helpers
//
// Single source of truth for every Dashboard card / chart / table.
// Keep these functions PURE — no hooks, no store reads — so the card
// labelled "Total Revenue" and the chart labelled "Sales Trend" never
// disagree because one inlines its own math.
//
// Reference for the rules below:
//   docs/04-features-workflows.md › Dashboard rules
//
// Money conventions
// -----------------
// `sale.totalMmk`           = final cash basis (after item discounts AND
//                             cart discount). Use for headline revenue.
// `sale.subtotalMmk`        = pre-cart-discount total.
// `sale_items.lineTotalMmk` = per-line, pre-cart-discount. Use for
//                             per-product / per-category ranking but NOT
//                             for headline totals (when cart discount > 0
//                             the lineTotal sum is > sale.totalMmk).
//
// Revenue
// -------
// Net revenue = sum(sale.totalMmk) - sum(approved PARTIAL refund amounts).
// VOID and REFUNDED sales are excluded by `scopeSales` upstream (see
// `complete_sale` / `approve_void_request` for the status transitions).
//
// Cost of goods
// -------------
// `sale_items` does NOT capture cost at sale time, so we approximate
// with the current `products.costMmk`. This drifts when costs change.
// Documented in `docs/04-features-workflows.md`. Migrating to a
// captured-cost column on `sale_items` is on the roadmap.
//
// Shop scope
// ----------
// All scoped functions accept `shopId: string | null`. `null` means
// "ADMIN viewing all shops" (no shop filter). The caller must NEVER pass
// `null` for a non-admin viewer — the page enforces that.
// ============================================================

// ------------------------------------------------------------
// Sale-level helpers
// ------------------------------------------------------------

/**
 * Return only the sales that belong on a dashboard:
 *   * status = NORMAL  (drop VOID and REFUNDED outright)
 *   * if `shopId` is a string, restrict to that shop
 *   * if `shopId` is null, no shop restriction (admin all-shops mode)
 */
export const scopeSales = (sales: Sale[], shopId: string | null): Sale[] =>
  sales.filter((s) => s.status === "NORMAL" && (shopId === null || s.shopId === shopId));

/** Sum of `sale.totalMmk` — the cash basis revenue, pre-refund adjustments. */
export const calculateGrossRevenue = (sales: Sale[]): number =>
  sales.reduce((sum, s) => sum + (Number.isFinite(s.totalMmk) ? s.totalMmk : 0), 0);

/**
 * Sum of approved PARTIAL refund amounts against the given sales.
 *
 * Only PARTIAL refunds matter for revenue here:
 *   * VOID -> the underlying sale status becomes VOID and is dropped
 *     by `scopeSales`, so we already excluded its revenue.
 *   * Full REFUND -> status becomes REFUNDED, same treatment.
 *   * PARTIAL APPROVED -> the sale stays NORMAL but a fraction of the
 *     revenue went back to the customer; subtract it here.
 */
export const calculateRefundDeductions = (
  sales: Sale[],
  refunds: RefundVoidRequest[]
): number => {
  const saleIds = new Set(sales.map((s) => s.id));
  return refunds
    .filter((r) => r.status === "APPROVED" && r.type === "PARTIAL" && saleIds.has(r.saleId))
    .reduce(
      (sum, r) =>
        sum + (r.items ?? []).reduce((line, item) => line + (item.amountMmk || 0), 0),
      0
    );
};

/**
 * Headline revenue: gross minus approved PARTIAL refund deductions.
 * Floored at 0 so a refund larger than the captured sale (data bug)
 * never produces a negative dashboard number.
 */
export const calculateNetRevenue = (
  sales: Sale[],
  refunds: RefundVoidRequest[]
): number => Math.max(calculateGrossRevenue(sales) - calculateRefundDeductions(sales, refunds), 0);

/** Number of valid orders. */
export const calculateSalesCount = (sales: Sale[]): number => sales.length;

/** Cost of goods sold — current-product-cost approximation; see header. */
export const calculateCostOfGoods = (
  sales: Sale[],
  saleItems: SaleItem[],
  products: Product[]
): number => {
  const saleIds = new Set(sales.map((s) => s.id));
  const productById = new Map(products.map((p) => [p.id, p]));
  return saleItems
    .filter((i) => saleIds.has(i.saleId))
    .reduce((sum, item) => {
      const product = productById.get(item.productId);
      const cost = product?.costMmk ?? 0;
      return sum + cost * item.qtyUnits;
    }, 0);
};

export const calculateProfit = (revenue: number, cost: number): number => revenue - cost;

export const calculateProfitMargin = (revenue: number, profit: number): number =>
  revenue > 0 ? (profit / revenue) * 100 : 0;

/**
 * Average order value. Returns 0 when count = 0 (no Infinity).
 * Rounded to the nearest whole MMK so the dashboard never shows a long
 * float like `MMK 3,333.3333…`. MMK has no sub-unit denomination.
 */
export const calculateAvgOrderValue = (revenue: number, count: number): number =>
  count > 0 ? Math.round(revenue / count) : 0;

// ------------------------------------------------------------
// Inventory helpers
// ------------------------------------------------------------

/**
 * Sum of (qty × current cost) for inventory in scope.
 *
 *   shopId = null   -> total across ALL shops (admin aggregate)
 *   shopId = "x"    -> just shop x's rows
 *
 * Inactive products are excluded — they don't represent realisable
 * investment. (If a future business rule wants them, parameterise.)
 */
export const calculateInventoryValue = (
  inventory: Inventory[],
  products: Product[],
  shopId: string | null
): number => {
  const productById = new Map(products.map((p) => [p.id, p]));
  const scoped = shopId === null ? inventory : inventory.filter((i) => i.shopId === shopId);
  return scoped.reduce((sum, inv) => {
    const product = productById.get(inv.productId);
    if (!product || !product.isActive) return sum;
    return sum + (product.costMmk || 0) * inv.qtyBaseUnits;
  }, 0);
};

export interface LowStockRow {
  product: Product;
  shopId: string;
  qty: number;
  threshold: number;
  /** "out" iff qty <= 0; "low" iff qty <= threshold AND qty > 0. */
  status: "low" | "out";
}

/**
 * Low / out-of-stock rows in scope.
 *
 *   shopId = "x"  -> one row per product for shop x where qty <= threshold
 *   shopId = null -> one row per (shop, product) pair across the inventory
 *                    table where qty <= threshold.
 *
 * **Never sum across shops.** Per the dashboard rules in
 * `docs/04-features-workflows.md`, summing would mask a shop being out
 * of stock when another shop has plenty. ADMIN viewing all shops sees a
 * row per affected (shop, product) pair.
 *
 * Inactive products excluded. Sorted by qty ascending (out-first).
 */
export const calculateLowStock = (
  products: Product[],
  inventory: Inventory[],
  shopId: string | null
): LowStockRow[] => {
  const productById = new Map(products.map((p) => [p.id, p]));
  const buildRow = (product: Product, sid: string, qty: number): LowStockRow => ({
    product,
    shopId: sid,
    qty,
    threshold: product.lowStockThreshold,
    status: qty <= 0 ? "out" : "low",
  });

  if (shopId === null) {
    const rows: LowStockRow[] = [];
    for (const inv of inventory) {
      const product = productById.get(inv.productId);
      if (!product || !product.isActive) continue;
      if (inv.qtyBaseUnits <= product.lowStockThreshold) {
        rows.push(buildRow(product, inv.shopId, inv.qtyBaseUnits));
      }
    }
    return rows.sort((a, b) => a.qty - b.qty);
  }

  const rows: LowStockRow[] = [];
  for (const product of products) {
    if (!product.isActive) continue;
    const inv = inventory.find((i) => i.shopId === shopId && i.productId === product.id);
    const qty = inv?.qtyBaseUnits ?? 0;
    if (qty <= product.lowStockThreshold) {
      rows.push(buildRow(product, shopId, qty));
    }
  }
  return rows.sort((a, b) => a.qty - b.qty);
};

// ------------------------------------------------------------
// Ranking helpers
// ------------------------------------------------------------

export interface TopProductRow {
  product: Product;
  qty: number;
  /** Sum of `sale_items.lineTotalMmk` — pre-cart-discount. Documented. */
  revenue: number;
  cost: number;
  profit: number;
}

/**
 * Top products by line-total revenue (descending). Ranking basis is
 * `lineTotalMmk` because that's the per-product number; cart discounts
 * are applied at the sale level, not the item level. The headline
 * revenue KPI uses `sale.totalMmk` — see header.
 */
export const calculateTopProducts = (
  sales: Sale[],
  saleItems: SaleItem[],
  products: Product[],
  limit = 5
): TopProductRow[] => {
  const saleIds = new Set(sales.map((s) => s.id));
  const productById = new Map(products.map((p) => [p.id, p]));
  const map = new Map<string, TopProductRow>();
  for (const item of saleItems) {
    if (!saleIds.has(item.saleId)) continue;
    const product = productById.get(item.productId);
    if (!product) continue;
    const cost = (product.costMmk || 0) * item.qtyUnits;
    const row = map.get(product.id) ?? {
      product,
      qty: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
    };
    row.qty += item.qtyUnits;
    row.revenue += item.lineTotalMmk;
    row.cost += cost;
    row.profit += item.lineTotalMmk - cost;
    map.set(product.id, row);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit);
};

/**
 * Category revenue split — uses `lineTotalMmk` (line basis). Suitable
 * for proportional pie chart; the sum will be ≥ headline net revenue
 * when cart discounts apply.
 */
export const calculateCategoryRevenue = (
  sales: Sale[],
  saleItems: SaleItem[],
  products: Product[]
): Array<{ name: string; value: number }> => {
  const saleIds = new Set(sales.map((s) => s.id));
  const productById = new Map(products.map((p) => [p.id, p]));
  const map = new Map<string, number>();
  for (const item of saleItems) {
    if (!saleIds.has(item.saleId)) continue;
    const product = productById.get(item.productId);
    if (!product) continue;
    map.set(product.category, (map.get(product.category) ?? 0) + item.lineTotalMmk);
  }
  return [...map.entries()].map(([name, value]) => ({ name, value }));
};

// ------------------------------------------------------------
// Per-shop name decoration (used by the all-shops low-stock card)
// ------------------------------------------------------------

export const decorateLowStockWithShopName = (
  rows: LowStockRow[],
  shops: Shop[]
): Array<LowStockRow & { shopName: string }> => {
  const shopById = new Map(shops.map((s) => [s.id, s]));
  return rows.map((row) => ({
    ...row,
    shopName: shopById.get(row.shopId)?.name ?? row.shopId,
  }));
};

// ------------------------------------------------------------
// Supplier debt helper (kept here for parity with future Dashboard
// supplier-debt card; not yet rendered, but tested)
// ------------------------------------------------------------

export interface SupplierDebtSummary {
  receivedTotal: number;
  paid: number;
  debt: number;
  openPoCount: number;
}

/**
 * Supplier debt rule (mirrors `04-features-workflows.md` › Purchase Orders):
 *   * Debt only counts RECEIVED POs. DRAFT / SUBMITTED / APPROVED /
 *     CANCELED never contribute.
 *   * Debt = sum(totalMmk) - sum(paidMmk), floored at 0.
 *   * Optional shop scope (null = all shops admin aggregate).
 */
export const calculateSupplierDebt = (
  purchaseOrders: PurchaseOrder[],
  shopId: string | null
): SupplierDebtSummary => {
  const received = purchaseOrders.filter(
    (po) => po.status === "RECEIVED" && (shopId === null || po.shopId === shopId)
  );
  const receivedTotal = received.reduce((sum, po) => sum + (po.totalMmk || 0), 0);
  const paid = received.reduce((sum, po) => sum + (po.paidMmk ?? 0), 0);
  const debt = Math.max(receivedTotal - paid, 0);
  const openPoCount = received.filter((po) => (po.paidMmk ?? 0) < po.totalMmk).length;
  return { receivedTotal, paid, debt, openPoCount };
};

// ============================================================
// Date-range helpers — used by the Today / Week / Month KPI strip.
//
// `today`   = local midnight today → now
// `week`    = rolling 7 days       → now - 7d → now
// `month`   = start of local month → now
// ============================================================

export type DateRange = "today" | "week" | "month";

export const dateRangeStart = (range: DateRange, now: Date = new Date()): Date => {
  switch (range) {
    case "today": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "month":
    default:
      return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  }
};

/** Keep sales whose `createdAt` falls within `[dateRangeStart(range), now]`. */
export const filterSalesByRange = (
  sales: Sale[],
  range: DateRange,
  now: Date = new Date()
): Sale[] => {
  const startMs = dateRangeStart(range, now).getTime();
  const endMs = now.getTime();
  return sales.filter((s) => {
    const t = Date.parse(s.createdAt);
    return Number.isFinite(t) && t >= startMs && t <= endMs;
  });
};

// ============================================================
// Dashboard scope + permission helpers.
//
// These helpers keep the role-sensitive page branch logic testable:
//   * ADMIN can aggregate all shops or select one shop.
//   * MANAGER / CASHIER / BUYER are locked to their assigned shop.
//   * Sensitive cards are rendered only when their granular permission
//     is present. ADMIN gets these through role defaults.
// ============================================================

export type DashboardSelectedShopId = string | "all";

export interface DashboardScope {
  selectedShopId: DashboardSelectedShopId;
  metricShopId: string | null;
  showAllShops: boolean;
  isBlocked: boolean;
}

export const resolveDashboardScope = (
  user: User | null | undefined,
  selectedShopId: DashboardSelectedShopId,
  assignedShopId: string
): DashboardScope => {
  if (!user) {
    return { selectedShopId: "", metricShopId: null, showAllShops: false, isBlocked: true };
  }

  if (user.role === "ADMIN") {
    if (selectedShopId === "all") {
      return { selectedShopId, metricShopId: null, showAllShops: true, isBlocked: false };
    }
    return {
      selectedShopId,
      metricShopId: selectedShopId || null,
      showAllShops: false,
      isBlocked: !selectedShopId,
    };
  }

  const lockedShopId = user.shopId || assignedShopId;
  return {
    selectedShopId: lockedShopId,
    metricShopId: lockedShopId || null,
    showAllShops: false,
    isBlocked: !lockedShopId,
  };
};

export interface DashboardVisibility {
  canViewShopSales: boolean;
  canViewOwnShift: boolean;
  canViewInventory: boolean;
  canViewProfit: boolean;
  canViewSupplierDebt: boolean;
  canViewApprovals: boolean;
  canViewPurchases: boolean;
  canViewTransfers: boolean;
  canViewAllShifts: boolean;
  canViewAudit: boolean;
  canViewGlobal: boolean;
}

const can = (user: User | null | undefined, permission: Permission): boolean =>
  hasPermission(user, permission);

export const getDashboardVisibility = (
  user: User | null | undefined
): DashboardVisibility => ({
  canViewShopSales: can(user, "report:shop_sales"),
  canViewOwnShift: can(user, "report:own_shift"),
  canViewInventory: can(user, "report:shop_inventory"),
  canViewProfit: can(user, "report:shop_profit"),
  canViewSupplierDebt: can(user, "supplier:debt_view"),
  canViewApprovals: can(user, "approval:view"),
  canViewPurchases: can(user, "purchase:view"),
  canViewTransfers: can(user, "transfer:view"),
  canViewAllShifts: can(user, "shift:manage_all"),
  canViewAudit: can(user, "audit:view_global"),
  canViewGlobal: can(user, "report:global"),
});

// ============================================================
// Action-Needed summary (Manager dashboard headline tile)
// ============================================================

export interface ActionNeededSummary {
  lowStockCount: number;
  outOfStockCount: number;
  pendingApprovals: number;
  pendingReceipts: number;
  pendingTransfers: number;
  total: number;
}

/**
 * Count of operational items needing attention for `shopId`.
 *   * lowStock / outOfStock — uses `calculateLowStock` so the rule is
 *     identical to the Low Stock card.
 *   * pendingApprovals — `refund_void_requests.status = 'REQUESTED'`.
 *   * pendingReceipts  — `purchase_orders.status = 'APPROVED'` (next
 *     step is receiving). DRAFT / SUBMITTED / RECEIVED / CANCELED don't
 *     need a receipt action.
 *   * pendingTransfers — `stock_transfers.status = 'PENDING'` where the
 *     shop is the SOURCE or DESTINATION.
 *
 * `null` shopId aggregates across all shops (admin view).
 */
export const calculateActionNeeded = (
  shopId: string | null,
  inventory: Inventory[],
  products: Product[],
  refunds: RefundVoidRequest[],
  purchaseOrders: PurchaseOrder[],
  stockTransfers: StockTransfer[]
): ActionNeededSummary => {
  const lowRows = calculateLowStock(products, inventory, shopId);
  const outOfStockCount = lowRows.filter((r) => r.status === "out").length;
  const lowStockCount = lowRows.filter((r) => r.status === "low").length;

  const inShop = (id: string | undefined): boolean => shopId === null || id === shopId;

  const pendingApprovals = refunds.filter(
    (r) => r.status === "REQUESTED" && inShop(r.shopId)
  ).length;
  const pendingReceipts = purchaseOrders.filter(
    (po) => po.status === "APPROVED" && inShop(po.shopId)
  ).length;
  const pendingTransfers = stockTransfers.filter(
    (t) => t.status === "PENDING" && (inShop(t.fromShopId) || inShop(t.toShopId))
  ).length;

  return {
    lowStockCount,
    outOfStockCount,
    pendingApprovals,
    pendingReceipts,
    pendingTransfers,
    total: lowStockCount + outOfStockCount + pendingApprovals + pendingReceipts + pendingTransfers,
  };
};

// ============================================================
// Cash vs Other payment split (operational sanity tile)
// ============================================================

export interface PaymentSplit {
  cashCount: number;
  cashRevenue: number;
  otherCount: number;
  otherRevenue: number;
}

export const calculateCashVsOther = (sales: Sale[]): PaymentSplit => {
  let cashCount = 0;
  let cashRevenue = 0;
  let otherCount = 0;
  let otherRevenue = 0;
  for (const s of sales) {
    if (s.paymentMethod === "CASH") {
      cashCount += 1;
      cashRevenue += s.totalMmk;
    } else {
      otherCount += 1;
      otherRevenue += s.totalMmk;
    }
  }
  return { cashCount, cashRevenue, otherCount, otherRevenue };
};

// ============================================================
// Active shifts + expected cash (Manager + Admin operational tiles)
// ============================================================

export const filterActiveShifts = (shifts: Shift[], shopId: string | null): Shift[] =>
  shifts.filter((s) => !s.endedAt && (shopId === null || s.shopId === shopId));

/**
 * Sum of `opening_cash + cash sales - approved partial cash refunds` for
 * every currently-open shift in scope. Mirrors the formula `close_shift`
 * uses to recompute `expected_cash_mmk` at close time (migration 009).
 */
export const calculateExpectedCashForActiveShifts = (
  shifts: Shift[],
  sales: Sale[],
  refunds: RefundVoidRequest[],
  shopId: string | null
): number => {
  const activeShifts = filterActiveShifts(shifts, shopId);
  let total = 0;
  for (const shift of activeShifts) {
    const shiftSales = sales.filter((s) => s.shiftId === shift.id);
    const cashSales = shiftSales.filter((s) => s.paymentMethod === "CASH" && s.status !== "VOID");
    const cashTotal = cashSales.reduce((acc, s) => acc + s.totalMmk, 0);
    const cashSaleIds = new Set(cashSales.map((s) => s.id));
    const approvedRefunds = refunds
      .filter((r) => r.status === "APPROVED" && r.type === "PARTIAL" && cashSaleIds.has(r.saleId))
      .reduce(
        (acc, r) =>
          acc + (r.items ?? []).reduce((b, item) => b + (item.amountMmk || 0), 0),
        0
      );
    total += shift.openingCashMmk + cashTotal - approvedRefunds;
  }
  return Math.max(total, 0);
};

export interface ActiveShiftRow {
  shift: Shift;
  user: User | undefined;
  shop: Shop | undefined;
}

export const listActiveShiftRows = (
  shifts: Shift[],
  users: User[],
  shops: Shop[],
  shopId: string | null
): ActiveShiftRow[] => {
  return filterActiveShifts(shifts, shopId).map((shift) => ({
    shift,
    user: users.find((u) => u.id === shift.cashierId),
    shop: shops.find((s) => s.id === shift.shopId),
  }));
};

// ============================================================
// Per-shop business overview (Admin Shop Performance table)
// ============================================================

export interface PerShopMetrics {
  shop: Shop;
  orders: number;
  revenue: number; // net
  cost: number;
  profit: number;
  margin: number;
  activeShifts: number;
  debt: number;
}

export const calculatePerShopMetrics = (
  sales: Sale[],
  saleItems: SaleItem[],
  products: Product[],
  shops: Shop[],
  refunds: RefundVoidRequest[],
  shifts: Shift[],
  purchaseOrders: PurchaseOrder[]
): PerShopMetrics[] => {
  return shops.map((shop) => {
    const scoped = scopeSales(sales, shop.id);
    const revenue = calculateNetRevenue(scoped, refunds);
    const cost = calculateCostOfGoods(scoped, saleItems, products);
    const profit = calculateProfit(revenue, cost);
    return {
      shop,
      orders: scoped.length,
      revenue,
      cost,
      profit,
      margin: calculateProfitMargin(revenue, profit),
      activeShifts: filterActiveShifts(shifts, shop.id).length,
      debt: calculateSupplierDebt(purchaseOrders, shop.id).debt,
    };
  });
};

// ============================================================
// Supplier debt grouped by shop / supplier (Admin debt cards)
// ============================================================

export interface DebtGroup {
  id: string;
  name: string;
  debt: number;
  openPoCount: number;
}

export const groupSupplierDebtByShop = (
  purchaseOrders: PurchaseOrder[],
  shops: Shop[]
): DebtGroup[] =>
  shops
    .map((shop) => {
      const r = calculateSupplierDebt(purchaseOrders, shop.id);
      return { id: shop.id, name: shop.name, debt: r.debt, openPoCount: r.openPoCount };
    })
    .filter((row) => row.debt > 0)
    .sort((a, b) => b.debt - a.debt);

export const groupSupplierDebtBySupplier = (
  purchaseOrders: PurchaseOrder[],
  suppliers: Supplier[],
  shopId: string | null
): DebtGroup[] => {
  const received = purchaseOrders.filter(
    (po) => po.status === "RECEIVED" && (shopId === null || po.shopId === shopId)
  );
  type Agg = { receivedTotal: number; paid: number; openPoCount: number };
  const map = new Map<string, Agg>();
  for (const po of received) {
    const row = map.get(po.supplierId) ?? { receivedTotal: 0, paid: 0, openPoCount: 0 };
    row.receivedTotal += po.totalMmk;
    row.paid += po.paidMmk ?? 0;
    if ((po.paidMmk ?? 0) < po.totalMmk) row.openPoCount += 1;
    map.set(po.supplierId, row);
  }
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));
  const rows: DebtGroup[] = [];
  for (const [supplierId, agg] of map.entries()) {
    const debt = Math.max(agg.receivedTotal - agg.paid, 0);
    if (debt <= 0) continue;
    rows.push({
      id: supplierId,
      name: supplierById.get(supplierId)?.name ?? supplierId,
      debt,
      openPoCount: agg.openPoCount,
    });
  }
  return rows.sort((a, b) => b.debt - a.debt);
};

// ============================================================
// Pending lists (drilldowns for the Manager Action cards)
// ============================================================

export const filterPendingApprovals = (
  refunds: RefundVoidRequest[],
  shopId: string | null
): RefundVoidRequest[] =>
  refunds.filter((r) => r.status === "REQUESTED" && (shopId === null || r.shopId === shopId));

export const filterPendingReceipts = (
  purchaseOrders: PurchaseOrder[],
  shopId: string | null
): PurchaseOrder[] =>
  purchaseOrders.filter(
    (po) => po.status === "APPROVED" && (shopId === null || po.shopId === shopId)
  );

export const filterPendingTransfers = (
  stockTransfers: StockTransfer[],
  shopId: string | null
): StockTransfer[] =>
  stockTransfers.filter(
    (t) =>
      t.status === "PENDING" &&
      (shopId === null || t.fromShopId === shopId || t.toShopId === shopId)
  );

// ============================================================
// Recent audit (Admin dashboard, requires audit:view_global RLS-side)
// ============================================================

export const recentAuditLogs = (
  auditLogs: AuditLog[],
  limit = 10
): AuditLog[] =>
  [...auditLogs]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
