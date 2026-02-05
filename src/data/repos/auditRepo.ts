import type { AuditLog } from "../../types";
import { readDb, writeDb } from "../db";

export const listAuditLogs = () => readDb().auditLogs;

export const appendAuditLog = (log: AuditLog) => {
  const db = readDb();
  writeDb({ ...db, auditLogs: [log, ...db.auditLogs] });
};
