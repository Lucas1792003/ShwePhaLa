import type { StateCreator } from "zustand";
import type { DataState, AuditState } from "../types";
import type { AuditLog } from "../../../types";
import { makeId } from "../utils";

export const createAuditSlice: StateCreator<DataState, [], [], AuditState> = (set) => ({
  auditLogs: [],
  reprintLogs: [],

  addAuditLog: (log: AuditLog) =>
    set((state) => ({ auditLogs: [log, ...state.auditLogs] })),

  addReprintLog: ({ saleId, actorId }) =>
    set((state) => {
      const sale = state.sales.find((item) => item.id === saleId);
      const printedAt = new Date().toISOString();

      const audit: AuditLog = {
        id: makeId("audit"),
        shopId: sale?.shopId,
        actorId,
        actionType: "REPRINT_RECEIPT",
        message: sale ? `Reprinted receipt ${sale.receiptNo}.` : "Reprinted receipt.",
        entityType: "Sale",
        entityId: saleId,
        createdAt: printedAt,
      };

      return {
        reprintLogs: [
          {
            id: makeId("reprint"),
            saleId,
            printedBy: actorId,
            printedAt,
          },
          ...state.reprintLogs,
        ],
        auditLogs: [audit, ...state.auditLogs],
      };
    }),
});
