import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export interface BadgeProps {
  tone?: "green" | "amber" | "red" | "slate" | "gray" | "blue" | "purple";
  color?: "green" | "yellow" | "red" | "blue" | "gray" | "purple";
  children: ReactNode;
  className?: string;
}

const tones: Record<string, string> = {
  green: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  amber: "bg-amber-100 text-amber-700 border border-amber-200",
  red: "bg-rose-100 text-rose-700 border border-rose-200",
  slate: "bg-slate-100 text-slate-700 border border-slate-200",
  // Extended colors for new features
  yellow: "bg-amber-100 text-amber-700 border border-amber-200",
  blue: "bg-blue-100 text-blue-700 border border-blue-200",
  gray: "bg-slate-100 text-slate-700 border border-slate-200",
  purple: "bg-purple-100 text-purple-700 border border-purple-200",
};

// Map color prop to tone
const colorToTone = (color?: string): string => {
  if (!color) return "slate";
  const mapping: Record<string, string> = {
    green: "green",
    yellow: "yellow",
    amber: "amber",
    red: "red",
    blue: "blue",
    gray: "gray",
    slate: "slate",
    purple: "purple",
  };
  return mapping[color] ?? "slate";
};

export const Badge = ({ tone, color, children, className }: BadgeProps) => {
  const resolvedTone = tone ?? colorToTone(color);
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", tones[resolvedTone], className)}>
      {children}
    </span>
  );
};
