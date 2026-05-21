import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../../../stores/authStore";

interface RequireAuthProps {
  children: ReactNode;
}

export const RequireAuth = ({ children }: RequireAuthProps) => {
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const isAuthLoading = useAuthStore((state) => state.isAuthLoading);

  if (isAuthLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-slate-400 text-sm">Checking session…</div>
      </div>
    );
  }

  if (!currentUserId) return <Navigate to="/login" replace />;
  return <>{children}</>;
};
