import type { Role } from "../../types";

export const canAccess = (role: Role, allowed: Role[]) => allowed.includes(role);
