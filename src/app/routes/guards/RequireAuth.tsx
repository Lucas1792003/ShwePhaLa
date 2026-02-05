import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../../../stores/authStore";

interface RequireAuthProps {
  children: ReactNode;
}

export const RequireAuth = ({ children }: RequireAuthProps) => {
  const currentUserId = useAuthStore((state) => state.currentUserId);
  if (!currentUserId) return <Navigate to="/login" replace />;
  return <>{children}</>;
};
