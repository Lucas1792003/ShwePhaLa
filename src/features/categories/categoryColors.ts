/**
 * Central category colour → Tailwind class maps.
 *
 * Shared by the Products admin (category cards + swatch picker) and the POS
 * category filter so a category looks identical everywhere.
 *
 * The values are FULL literal class strings on purpose — Tailwind's JIT only
 * generates classes it can see as complete literals in source. Never build
 * these dynamically (e.g. `bg-${color}-500`) or the classes won't exist.
 */
import type { Category } from "../../types";

export type CategoryColor = Category["color"];

/** Soft accent for an icon tile / inactive chip. */
export const CATEGORY_ACCENT: Record<CategoryColor, string> = {
  amber: "bg-amber-100 text-amber-600",
  orange: "bg-orange-100 text-orange-600",
  yellow: "bg-yellow-100 text-yellow-700",
  lime: "bg-lime-100 text-lime-600",
  green: "bg-green-100 text-green-600",
  emerald: "bg-emerald-100 text-emerald-600",
  teal: "bg-teal-100 text-teal-600",
  cyan: "bg-cyan-100 text-cyan-600",
  sky: "bg-sky-100 text-sky-600",
  blue: "bg-blue-100 text-blue-600",
  indigo: "bg-indigo-100 text-indigo-600",
  violet: "bg-violet-100 text-violet-600",
  purple: "bg-purple-100 text-purple-600",
  fuchsia: "bg-fuchsia-100 text-fuchsia-600",
  pink: "bg-pink-100 text-pink-600",
  rose: "bg-rose-100 text-rose-600",
  red: "bg-red-100 text-red-600",
  slate: "bg-slate-100 text-slate-600",
};

/** Solid fill for the active / selected state. */
export const CATEGORY_SOLID: Record<CategoryColor, string> = {
  amber: "bg-amber-600 text-white",
  orange: "bg-orange-600 text-white",
  yellow: "bg-yellow-500 text-white",
  lime: "bg-lime-600 text-white",
  green: "bg-green-600 text-white",
  emerald: "bg-emerald-600 text-white",
  teal: "bg-teal-600 text-white",
  cyan: "bg-cyan-600 text-white",
  sky: "bg-sky-600 text-white",
  blue: "bg-blue-600 text-white",
  indigo: "bg-indigo-600 text-white",
  violet: "bg-violet-600 text-white",
  purple: "bg-purple-600 text-white",
  fuchsia: "bg-fuchsia-600 text-white",
  pink: "bg-pink-600 text-white",
  rose: "bg-rose-600 text-white",
  red: "bg-red-600 text-white",
  slate: "bg-slate-600 text-white",
};

/** Plain swatch dot (colour picker). */
export const CATEGORY_SWATCH: Record<CategoryColor, string> = {
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  yellow: "bg-yellow-400",
  lime: "bg-lime-500",
  green: "bg-green-500",
  emerald: "bg-emerald-500",
  teal: "bg-teal-500",
  cyan: "bg-cyan-500",
  sky: "bg-sky-500",
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  violet: "bg-violet-500",
  purple: "bg-purple-500",
  fuchsia: "bg-fuchsia-500",
  pink: "bg-pink-500",
  rose: "bg-rose-500",
  red: "bg-red-500",
  slate: "bg-slate-500",
};
