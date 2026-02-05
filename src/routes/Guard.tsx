import type { ReactNode } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { useDataStore } from "../stores/dataStore";
import type { Role } from "../types";

export const RequireAuth = ({ children }: { children?: ReactNode }) => {
  const currentUserId = useAuthStore((state) => state.currentUserId);
  if (!currentUserId) return <Navigate to="/login" replace />;
  return children ? <>{children}</> : <Outlet />;
};

export const RequireRole = ({ roles }: { roles: Role[] }) => {
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentUser = useDataStore((state) => state.users.find((user) => user.id === currentUserId));
  if (!currentUser || !roles.includes(currentUser.role)) return <Navigate to="/pos" replace />;
  return <Outlet />;
};
