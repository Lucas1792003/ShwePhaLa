import type { PurchaseOrder, SupplierPayment } from "../../types";

export interface SupplierFinancialSummary {
  totalReceivedPurchasesMmk: number;
  totalPaidMmk: number;
  outstandingDebtMmk: number;
  unpaidPoCount: number;
  partialPoCount: number;
  pendingPoCount: number;
  orderCount: number;
}

export const getPurchaseOrderPaidMmk = (po: Pick<PurchaseOrder, "paidMmk">): number =>
  Math.max(0, po.paidMmk ?? 0);

export const getPurchaseOrderBalanceMmk = (
  po: Pick<PurchaseOrder, "status" | "totalMmk" | "paidMmk">
): number => {
  if (po.status !== "RECEIVED") return 0;
  return Math.max(0, po.totalMmk - getPurchaseOrderPaidMmk(po));
};

export const getComputedPaymentStatus = (
  po: Pick<PurchaseOrder, "status" | "totalMmk" | "paidMmk" | "paymentStatus">
) => {
  if (po.status !== "RECEIVED") return po.paymentStatus ?? "UNPAID";
  const paid = getPurchaseOrderPaidMmk(po);
  if (paid <= 0) return "UNPAID";
  if (paid >= po.totalMmk) return "PAID";
  return "PARTIAL";
};

export const getSupplierPurchaseOrders = (
  supplierId: string,
  purchaseOrders: PurchaseOrder[],
  shopId?: string
): PurchaseOrder[] =>
  purchaseOrders.filter((po) => po.supplierId === supplierId && (!shopId || po.shopId === shopId));

export const getSupplierPayments = (
  supplierId: string,
  supplierPayments: SupplierPayment[],
  shopId?: string
): SupplierPayment[] =>
  supplierPayments
    .filter((payment) => payment.supplierId === supplierId && (!shopId || payment.shopId === shopId))
    .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());

export const buildSupplierFinancialSummary = (
  supplierId: string,
  purchaseOrders: PurchaseOrder[],
  shopId?: string
): SupplierFinancialSummary => {
  const supplierOrders = getSupplierPurchaseOrders(supplierId, purchaseOrders, shopId);
  const receivedOrders = supplierOrders.filter((po) => po.status === "RECEIVED");
  const totalReceivedPurchasesMmk = receivedOrders.reduce((sum, po) => sum + po.totalMmk, 0);
  const totalPaidMmk = receivedOrders.reduce((sum, po) => sum + getPurchaseOrderPaidMmk(po), 0);
  const outstandingDebtMmk = receivedOrders.reduce((sum, po) => sum + getPurchaseOrderBalanceMmk(po), 0);

  return {
    totalReceivedPurchasesMmk,
    totalPaidMmk,
    outstandingDebtMmk,
    unpaidPoCount: receivedOrders.filter((po) => getComputedPaymentStatus(po) === "UNPAID").length,
    partialPoCount: receivedOrders.filter((po) => getComputedPaymentStatus(po) === "PARTIAL").length,
    pendingPoCount: supplierOrders.filter((po) => po.status !== "RECEIVED" && po.status !== "CANCELED").length,
    orderCount: supplierOrders.length,
  };
};
