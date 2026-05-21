import { getDateKey } from "../../lib/utils";
import type { AuditLog, InventoryMovement, Permission, User } from "../../types";
import { hasPermission, canAccessShop } from "../../lib/permissions";

export const makeId = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;

// ============================================================
// DB row mappers (camelCase domain object -> snake_case columns)
// ============================================================

export const auditRow = (a: AuditLog) => ({
  id: a.id,
  shop_id: a.shopId ?? null,
  actor_id: a.actorId,
  action_type: a.actionType,
  message: a.message,
  entity_type: a.entityType,
  entity_id: a.entityId,
  created_at: a.createdAt,
});

export const movementRow = (m: InventoryMovement) => ({
  id: m.id,
  shop_id: m.shopId,
  product_id: m.productId,
  type: m.type,
  qty_change: m.qtyChange,
  qty_before: m.qtyBefore,
  qty_after: m.qtyAfter,
  reason: m.reason,
  reference_type: m.referenceType ?? null,
  reference_id: m.referenceId ?? null,
  created_by: m.createdBy,
  created_at: m.createdAt,
});

export const makeTransferNo = (seq: number) =>
  `TRF-${getDateKey()}-${String(seq).padStart(4, "0")}`;

export const makePurchaseOrderNo = (seq: number) =>
  `PO-${getDateKey()}-${String(seq).padStart(4, "0")}`;

/**
 * Error thrown when a user attempts an action without required permission.
 */
export class UnauthorizedActionError extends Error {
  public readonly permission: Permission;
  public readonly userId?: string;

  constructor(permission: Permission, userId?: string) {
    super(`Unauthorized: User ${userId || "unknown"} lacks permission "${permission}"`);
    this.name = "UnauthorizedActionError";
    this.permission = permission;
    this.userId = userId;
  }
}

/**
 * Validates that a user has the required permission, and — when `shopId` is
 * supplied — that the user is allowed to act within that shop.
 *
 * @param users - Array of users from store state
 * @param actorId - ID of the user attempting the action
 * @param permission - Required permission
 * @param shopId - Optional shop scope; the action must target this shop
 * @throws UnauthorizedActionError if the user lacks permission, is inactive,
 *         not found, or cannot access the target shop
 */
export function requirePermission(
  users: User[],
  actorId: string,
  permission: Permission,
  shopId?: string
): void {
  const user = users.find((u) => u.id === actorId);

  if (!user || !user.isActive) {
    throw new UnauthorizedActionError(permission, actorId);
  }

  if (!hasPermission(user, permission)) {
    throw new UnauthorizedActionError(permission, actorId);
  }

  if (shopId !== undefined && !canAccessShop(user, shopId)) {
    throw new UnauthorizedActionError(permission, actorId);
  }
}

/**
 * Validates that a user has ANY of the required permissions.
 * @param users - Array of users from store state
 * @param actorId - ID of the user attempting the action
 * @param permissions - Array of permissions (user needs at least one)
 * @throws UnauthorizedActionError if user lacks all permissions
 */
export function requireAnyPermission(
  users: User[],
  actorId: string,
  permissions: Permission[]
): void {
  const user = users.find((u) => u.id === actorId);

  if (!user || !user.isActive) {
    throw new UnauthorizedActionError(permissions[0], actorId);
  }

  const hasAny = permissions.some((p) => hasPermission(user, p));
  if (!hasAny) {
    throw new UnauthorizedActionError(permissions[0], actorId);
  }
}
