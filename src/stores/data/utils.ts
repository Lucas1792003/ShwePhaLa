import { getDateKey } from "../../lib/utils";
import type { Permission, User } from "../../types";
import { hasPermission } from "../../types";

export const makeId = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;

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
 * Validates that a user has the required permission.
 * @param users - Array of users from store state
 * @param actorId - ID of the user attempting the action
 * @param permission - Required permission
 * @throws UnauthorizedActionError if user lacks permission or is not found/inactive
 */
export function requirePermission(
  users: User[],
  actorId: string,
  permission: Permission
): void {
  const user = users.find((u) => u.id === actorId);

  if (!user) {
    throw new UnauthorizedActionError(permission, actorId);
  }

  if (!user.isActive) {
    throw new UnauthorizedActionError(permission, actorId);
  }

  if (!hasPermission(user, permission)) {
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
