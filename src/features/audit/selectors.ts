import type { AuditLog } from "../../types";

export const filterAuditByShop = (logs: AuditLog[], shopId?: string) =>
  shopId ? logs.filter((log) => log.shopId === shopId) : logs;
