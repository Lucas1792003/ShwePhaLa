import type { ReactNode } from "react";
import { Navigate, Outlet } from "react-router-dom";
import type { Role } from "../../types";
import { useAuthStore } from "../../stores/authStore";
import { useDataStore } from "../../stores/dataStore";

interface RoleGuardProps {
  roles?: Role[];
  requireAuth?: boolean;
  children?: ReactNode;
}

export const RoleGuard = ({ roles, requireAuth = true, children }: RoleGuardProps) => {
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentUser = useDataStore((state) => state.users.find((user) => user.id === currentUserId));
  if (requireAuth && !currentUserId) return <Navigate to="/login" replace />;
  if (roles && (!currentUser || !roles.includes(currentUser.role))) return <Navigate to="/pos" replace />;
  return children ? <>{children}</> : <Outlet />;
};
