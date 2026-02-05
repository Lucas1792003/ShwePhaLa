import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface CardProps {
  className?: string;
  children: ReactNode;
}

export const Card = ({ className, children }: CardProps) => (
  <div className={cn("rounded-3xl border border-slate-200/70 bg-white/95 p-6 shadow-card", className)}>{children}</div>
);
