import type { Refund } from "../../types";

export const pendingRefunds = (refunds: Refund[]) => refunds.filter((refund) => refund.status === "REQUESTED");
