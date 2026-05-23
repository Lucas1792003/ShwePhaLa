import type { PurchaseOrder, User } from "../../types";
import {
  canApprovePurchaseOrder,
  canReceivePurchaseOrder,
  canRecordSupplierPayment,
  hasShopPermission,
} from "../../lib/permissions";
import { getComputedPaymentStatus, getPurchaseOrderBalanceMmk } from "./debt";

// What the user *should* be guided toward for this PO right now.
// Mirrors the supplier workflow: Draft → Approve → Receive → Pay → Paid.
export type PurchaseOrderNextAction =
  | "approve"
  | "receive"
  | "pay"
  | "view"
  | "none";

export interface PurchaseOrderActionState {
  // The next step in the workflow, regardless of whether this user is allowed
  // to perform it. UI uses this to decide which CTA / hint to render.
  nextAction: PurchaseOrderNextAction;
  // Whether the current user can perform `nextAction` (permission + shop scope).
  // Helps render "Approve" vs. "Needs approval" without duplicating the matrix.
  canActor: boolean;
  // Short helper text shown when the user cannot perform the next step.
  hint?: string;
  // Whether *anything* below "view" is safe to offer for this PO. CANCELED /
  // RECEIVED+PAID are terminal.
  isTerminal: boolean;
  // Whether the user is allowed to cancel this PO right now.
  canCancel: boolean;
}

// Pure function — no React, no Supabase. Lets us unit-test the whole role
// matrix (ADMIN / MANAGER / BUYER / CASHIER) deterministically.
export function getPurchaseOrderActionState(
  po: PurchaseOrder,
  user: User | null | undefined
): PurchaseOrderActionState {
  if (po.status === "CANCELED") {
    return { nextAction: "view", canActor: false, isTerminal: true, canCancel: false };
  }

  if (po.status === "DRAFT" || po.status === "SUBMITTED") {
    const canApprove = canApprovePurchaseOrder(user, po);
    return {
      nextAction: "approve",
      canActor: canApprove,
      hint: canApprove ? undefined : "Needs approval",
      isTerminal: false,
      // Anyone with purchase:create for this shop can withdraw their request.
      // RPC re-checks; UI just decides when to render the button at all.
      canCancel: hasShopPermission(user, "purchase:create", po.shopId),
    };
  }

  if (po.status === "APPROVED") {
    const canReceive = canReceivePurchaseOrder(user, po);
    return {
      nextAction: "receive",
      canActor: canReceive,
      hint: canReceive ? undefined : "Needs receiving",
      isTerminal: false,
      canCancel: hasShopPermission(user, "purchase:create", po.shopId),
    };
  }

  // RECEIVED — payment flow.
  const balance = getPurchaseOrderBalanceMmk(po);
  const paymentStatus = getComputedPaymentStatus(po);

  if (paymentStatus === "PAID" || balance <= 0) {
    return { nextAction: "none", canActor: false, isTerminal: true, canCancel: false };
  }

  const canPay = canRecordSupplierPayment(user, po);
  return {
    nextAction: "pay",
    canActor: canPay,
    hint: canPay ? undefined : "Needs payment",
    isTerminal: false,
    // Once received, a PO must not be canceled — debt and stock have been
    // committed. RPC enforces this too.
    canCancel: false,
  };
}
