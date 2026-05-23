import type { PurchaseOrder, PurchasePaymentStatus, SupplierPaymentMethod } from "../../types";

// Non-component exports for the suppliers workspace UI. Kept separate from
// ui.tsx so React Fast Refresh can hot-reload the components without losing
// state (the linter flags mixed-export files).

export const supplierPaymentMethods: Array<{ value: SupplierPaymentMethod; label: string }> = [
  { value: "CASH", label: "Cash" },
  { value: "BANK", label: "Bank" },
  { value: "MOBILE", label: "Mobile" },
  { value: "OTHER", label: "Other" },
];

export const getSupplierPaymentMethodLabel = (method: SupplierPaymentMethod): string =>
  supplierPaymentMethods.find((item) => item.value === method)?.label ?? method;

export const poStatusColors: Record<
  PurchaseOrder["status"],
  "gray" | "yellow" | "green" | "blue" | "red"
> = {
  DRAFT: "gray",
  SUBMITTED: "yellow",
  APPROVED: "blue",
  RECEIVED: "green",
  CANCELED: "red",
};

export const paymentStatusColors: Record<PurchasePaymentStatus, "gray" | "yellow" | "green"> = {
  UNPAID: "gray",
  PARTIAL: "yellow",
  PAID: "green",
};

export const getDebtStatus = (outstandingDebtMmk: number) =>
  outstandingDebtMmk <= 0
    ? ({ label: "No Debt", color: "green" } as const)
    : ({ label: "Unpaid", color: "red" } as const);
