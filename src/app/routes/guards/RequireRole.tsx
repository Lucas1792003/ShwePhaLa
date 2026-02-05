import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import type { Role } from "../../../types";
import { useAuthStore } from "../../../stores/authStore";
import { useDataStore } from "../../../stores/dataStore";
import { hasPermission, type Permission } from "../../../shared/utils/permissions";

interface RequireRoleProps {
  allowed?: Role[];
  permission?: Permission;
  children: ReactNode;
}

export const RequireRole = ({ allowed, permission, children }: RequireRoleProps) => {
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentUser = useDataStore((state) => state.users.find((user) => user.id === currentUserId));

  if (!currentUserId || !currentUser) return <Navigate to="/login" replace />;
  if (allowed && !allowed.includes(currentUser.role)) return <Navigate to="/app" replace />;
  if (permission && !hasPermission(currentUser.role, permission)) return <Navigate to="/app" replace />;
  return <>{children}</>;
};
