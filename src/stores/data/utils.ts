import { getDateKey } from "../../lib/utils";

export const makeId = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;

export const makeTransferNo = (seq: number) =>
  `TRF-${getDateKey()}-${String(seq).padStart(4, "0")}`;

export const makePurchaseOrderNo = (seq: number) =>
  `PO-${getDateKey()}-${String(seq).padStart(4, "0")}`;
