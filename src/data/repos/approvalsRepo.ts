import type { RefundVoidRequest } from "../../types";
import { readDb, writeDb } from "../db";

export const listRefundVoidRequests = () => readDb().refundVoidRequests;

export const addRefundVoidRequest = (request: RefundVoidRequest) => {
  const db = readDb();
  writeDb({ ...db, refundVoidRequests: [request, ...db.refundVoidRequests] });
};

export const updateRefundVoidRequest = (request: RefundVoidRequest) => {
  const db = readDb();
  writeDb({
    ...db,
    refundVoidRequests: db.refundVoidRequests.map((item) => (item.id === request.id ? request : item)),
  });
};
