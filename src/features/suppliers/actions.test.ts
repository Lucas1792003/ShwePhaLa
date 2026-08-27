import { describe, expect, it } from "vitest";
import type { PurchaseOrder, User } from "../../types";
import { getPurchaseOrderActionState } from "./actions";

const po = (overrides: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
  id: overrides.id ?? "po-1",
  orderNo: overrides.orderNo ?? "PO-1",
  shopId: overrides.shopId ?? "shop-a",
  supplierId: overrides.supplierId ?? "supplier-1",
  status: overrides.status ?? "DRAFT",
  subtotalMmk: overrides.subtotalMmk ?? overrides.totalMmk ?? 0,
  totalMmk: overrides.totalMmk ?? 100000,
  createdBy: overrides.createdBy ?? "user-1",
  createdAt: overrides.createdAt ?? "2026-01-01T00:00:00Z",
  ...overrides,
});

const user = (role: User["role"], shopId: string | undefined = "shop-a"): User => ({
  id: `user-${role.toLowerCase()}`,
  name: role,
  role,
  shopId,
  isActive: true,
  createdAt: "2026-01-01T00:00:00Z",
});

describe("getPurchaseOrderActionState", () => {
  it("DRAFT: ADMIN sees Approve as next and can act", () => {
    const state = getPurchaseOrderActionState(po(), user("ADMIN"));
    expect(state.nextAction).toBe("approve");
    expect(state.canActor).toBe(true);
    expect(state.canCancel).toBe(true);
    expect(state.isTerminal).toBe(false);
  });

  it("DRAFT: MANAGER can approve (migration 057) — no hint", () => {
    // getPurchaseOrderActionState has no createdBy awareness (it only
    // calls canApprovePurchaseOrder, a pure permission+shop check) — the
    // self-approval guard migration 057 added lives only in the
    // approve_purchase_order RPC itself. So this stays true regardless of
    // whether `po()`'s default createdBy ("user-1") happens to match this
    // manager's id ("user-manager") — it doesn't here, but the frontend
    // can't tell the difference either way; a real self-approval attempt
    // still gets rejected server-side, surfaced as a toast, not a hint.
    const state = getPurchaseOrderActionState(po(), user("MANAGER"));
    expect(state.nextAction).toBe("approve");
    expect(state.canActor).toBe(true);
    expect(state.hint).toBeUndefined();
    expect(state.canCancel).toBe(true);
  });

  it("DRAFT: BUYER cannot approve — sees hint, can withdraw via cancel", () => {
    const state = getPurchaseOrderActionState(po(), user("BUYER"));
    expect(state.nextAction).toBe("approve");
    expect(state.canActor).toBe(false);
    expect(state.canCancel).toBe(true);
  });

  it("DRAFT: CASHIER has no purchase permissions at all", () => {
    const state = getPurchaseOrderActionState(po(), user("CASHIER"));
    expect(state.canActor).toBe(false);
    expect(state.canCancel).toBe(false);
  });

  it("APPROVED: MANAGER for the right shop can receive", () => {
    const state = getPurchaseOrderActionState(po({ status: "APPROVED" }), user("MANAGER", "shop-a"));
    expect(state.nextAction).toBe("receive");
    expect(state.canActor).toBe(true);
  });

  it("APPROVED: MANAGER on the wrong shop cannot receive", () => {
    const state = getPurchaseOrderActionState(po({ status: "APPROVED" }), user("MANAGER", "shop-b"));
    expect(state.nextAction).toBe("receive");
    expect(state.canActor).toBe(false);
    expect(state.hint).toBe("Needs receiving");
  });

  it("APPROVED: BUYER cannot receive", () => {
    const state = getPurchaseOrderActionState(po({ status: "APPROVED" }), user("BUYER"));
    expect(state.canActor).toBe(false);
  });

  it("RECEIVED unpaid: pay is next action when balance > 0", () => {
    const state = getPurchaseOrderActionState(
      po({ status: "RECEIVED", totalMmk: 100000, paidMmk: 0 }),
      user("MANAGER")
    );
    expect(state.nextAction).toBe("pay");
    expect(state.canActor).toBe(true);
    expect(state.canCancel).toBe(false);
  });

  it("RECEIVED partial: pay still applies for remaining balance", () => {
    const state = getPurchaseOrderActionState(
      po({ status: "RECEIVED", totalMmk: 100000, paidMmk: 40000 }),
      user("ADMIN")
    );
    expect(state.nextAction).toBe("pay");
    expect(state.canActor).toBe(true);
  });

  it("RECEIVED paid: terminal, no more actions", () => {
    const state = getPurchaseOrderActionState(
      po({ status: "RECEIVED", totalMmk: 100000, paidMmk: 100000 }),
      user("ADMIN")
    );
    expect(state.nextAction).toBe("none");
    expect(state.isTerminal).toBe(true);
    expect(state.canCancel).toBe(false);
  });

  it("CANCELED: terminal, no actions", () => {
    const state = getPurchaseOrderActionState(po({ status: "CANCELED" }), user("ADMIN"));
    expect(state.nextAction).toBe("view");
    expect(state.isTerminal).toBe(true);
    expect(state.canActor).toBe(false);
    expect(state.canCancel).toBe(false);
  });

  it("BUYER cannot record payment even on a received unpaid PO", () => {
    const state = getPurchaseOrderActionState(
      po({ status: "RECEIVED", totalMmk: 100000, paidMmk: 0 }),
      user("BUYER")
    );
    expect(state.nextAction).toBe("pay");
    expect(state.canActor).toBe(false);
    expect(state.hint).toBe("Needs payment");
  });

  it("missing user produces a safe locked state", () => {
    const state = getPurchaseOrderActionState(po(), null);
    expect(state.canActor).toBe(false);
    expect(state.canCancel).toBe(false);
  });
});
