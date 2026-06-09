import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface CardProps {
  className?: string;
  children: ReactNode;
}

export const Card = ({ className, children }: CardProps) => (
  <div className={cn("min-w-0 rounded-2xl border border-slate-200/70 bg-white/95 p-4 shadow-card md:p-5 xl:p-6", className)}>{children}</div>
);
