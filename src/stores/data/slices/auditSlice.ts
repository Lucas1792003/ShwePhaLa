import type { StateCreator } from "zustand";
import type { DataState, AuditState } from "../types";
import type { AuditLog } from "../../../types";
import { makeId } from "../utils";
import { supabase } from "../../../lib/supabase";

export const createAuditSlice: StateCreator<DataState, [], [], AuditState> = (set) => ({
  auditLogs: [],
  reprintLogs: [],

  addAuditLog: (log: AuditLog) => {
    set((state) => ({ auditLogs: [log, ...state.auditLogs] }));
    void supabase.from("audit_logs").insert({
      id: log.id, shop_id: log.shopId, actor_id: log.actorId, action_type: log.actionType,
      message: log.message, entity_type: log.entityType, entity_id: log.entityId,
      created_at: log.createdAt,
    });
  },

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

      const reprintId = makeId("reprint");
      void supabase.from("reprint_logs").insert({
        id: reprintId, sale_id: saleId, printed_by: actorId, printed_at: printedAt,
      });
      void supabase.from("audit_logs").insert({
        id: audit.id, shop_id: audit.shopId, actor_id: audit.actorId,
        action_type: audit.actionType, message: audit.message,
        entity_type: audit.entityType, entity_id: audit.entityId, created_at: audit.createdAt,
      });

      return {
        reprintLogs: [
          { id: reprintId, saleId, printedBy: actorId, printedAt },
          ...state.reprintLogs,
        ],
        auditLogs: [audit, ...state.auditLogs],
      };
    }),
});
