import type {
  AuditLog,
  Inventory,
  PriceTier,
  PurchaseOrder,
  Refund,
  Sale,
  Shift,
  StockTransfer,
  Supplier,
  SupplierPayment,
  User,
} from "../types";
import { getErrorMessage } from "./errors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyError = any;

export const SHOP_DELETE_MESSAGES = {
  referenced: "This shop has operational data and cannot be deleted.",
  fkViolation:
    "This shop is still referenced by operational data. Reassign or remove that data before deleting.",
} as const;

export interface ShopRefSources {
  users: Pick<User, "shopId">[];
  inventory: Pick<Inventory, "shopId">[];
  shifts: Pick<Shift, "shopId">[];
  sales: Pick<Sale, "shopId">[];
  purchaseOrders: Pick<PurchaseOrder, "shopId">[];
  supplierPayments: Pick<SupplierPayment, "shopId">[];
  stockTransfers: Pick<StockTransfer, "fromShopId" | "toShopId">[];
  priceTiers: Pick<PriceTier, "shopId">[];
  refundVoidRequests: Pick<Refund, "shopId">[];
  auditLogs: Pick<AuditLog, "shopId">[];
  suppliers?: Pick<Supplier, "id">[];
}

export interface ShopRefCounts {
  users: number;
  inventory: number;
  shifts: number;
  sales: number;
  purchaseOrders: number;
  supplierPayments: number;
  stockTransfers: number;
  priceTiers: number;
  refundVoidRequests: number;
  auditLogs: number;
  total: number;
}

export const countShopReferences = (shopId: string, src: ShopRefSources): ShopRefCounts => {
  const counts = {
    users: src.users.filter((u) => u.shopId === shopId).length,
    inventory: src.inventory.filter((i) => i.shopId === shopId).length,
    shifts: src.shifts.filter((s) => s.shopId === shopId).length,
    sales: src.sales.filter((s) => s.shopId === shopId).length,
    purchaseOrders: src.purchaseOrders.filter((p) => p.shopId === shopId).length,
    supplierPayments: src.supplierPayments.filter((p) => p.shopId === shopId).length,
    stockTransfers: src.stockTransfers.filter(
      (t) => t.fromShopId === shopId || t.toShopId === shopId
    ).length,
    priceTiers: src.priceTiers.filter((t) => t.shopId === shopId).length,
    refundVoidRequests: src.refundVoidRequests.filter((r) => r.shopId === shopId).length,
    auditLogs: src.auditLogs.filter((a) => a.shopId === shopId).length,
  };
  const total =
    counts.users +
    counts.inventory +
    counts.shifts +
    counts.sales +
    counts.purchaseOrders +
    counts.supplierPayments +
    counts.stockTransfers +
    counts.priceTiers +
    counts.refundVoidRequests +
    counts.auditLogs;
  return { ...counts, total };
};

const LABELS: Record<keyof Omit<ShopRefCounts, "total">, string> = {
  users: "users",
  inventory: "inventory rows",
  shifts: "shifts",
  sales: "sales",
  purchaseOrders: "purchase orders",
  supplierPayments: "supplier payments",
  stockTransfers: "stock transfers",
  priceTiers: "price tiers",
  refundVoidRequests: "refund/void requests",
  auditLogs: "audit logs",
};

export const formatShopReferenceSummary = (counts: ShopRefCounts): string => {
  const parts = (Object.keys(LABELS) as (keyof typeof LABELS)[])
    .filter((key) => counts[key] > 0)
    .map((key) => `${counts[key]} ${LABELS[key]}`);
  return parts.join(", ");
};

const errorBlob = (error: AnyError): string => {
  if (!error) return "";
  const parts: string[] = [];
  if (typeof error === "string") parts.push(error);
  if (typeof error?.message === "string") parts.push(error.message);
  if (typeof error?.details === "string") parts.push(error.details);
  if (typeof error?.hint === "string") parts.push(error.hint);
  if (typeof error?.code === "string") parts.push(error.code);
  if (typeof error?.cause?.message === "string") parts.push(error.cause.message);
  return parts.join(" | ").toLowerCase();
};

// 23503 = foreign_key_violation. Any leftover FK reference (users, inventory,
// supplier_payments, price_tiers) trips this even if the local pre-check
// thought the shop was clean.
export const mapShopDeleteError = (error: AnyError): string => {
  const text = errorBlob(error);
  if (text.includes("23503") || text.includes("foreign key") || text.includes("violates foreign")) {
    return SHOP_DELETE_MESSAGES.fkViolation;
  }
  return getErrorMessage(error);
};
