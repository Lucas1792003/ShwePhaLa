import type { ReactNode } from "react";
import { formatMmk } from "../../lib/utils";

// Small UI primitives shared by the Suppliers list and the Supplier Detail
// page. Kept in features/suppliers (not components/ui) because they encode
// supplier-workspace conventions rather than being generic kit.
//
// Non-component helpers (palettes, payment-method labels, etc.) live in
// `./uiConstants` so React Fast Refresh can hot-reload these components.

export interface DetailMetaProps {
  label: string;
  value: ReactNode;
}

export const DetailMeta = ({ label, value }: DetailMetaProps) => (
  <div className="min-w-0 rounded-xl bg-slate-50 px-3 py-2">
    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
    <div className="mt-1 min-w-0 break-words text-sm font-semibold text-slate-900">{value || "-"}</div>
  </div>
);

export interface SummaryCardProps {
  label: string;
  value: ReactNode;
  tone?: "slate" | "green" | "red" | "amber";
  badge?: ReactNode;
}

export const SummaryCard = ({ label, value, tone = "slate", badge }: SummaryCardProps) => {
  const toneClasses = {
    slate: "border-slate-200/70 bg-white text-slate-900",
    green: "border-emerald-200 bg-emerald-50/80 text-emerald-800",
    red: "border-rose-200 bg-rose-50/80 text-rose-800",
    amber: "border-amber-200 bg-amber-50/80 text-amber-800",
  };
  return (
    <div className={`rounded-2xl border p-4 ${toneClasses[tone]}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
        {badge}
      </div>
      <div className="mt-2 text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
};

export interface MoneyLineProps {
  label: string;
  value: number;
  tone?: "slate" | "green" | "red";
}

export const MoneyLine = ({ label, value, tone = "slate" }: MoneyLineProps) => {
  const color = tone === "green" ? "text-emerald-700" : tone === "red" ? "text-rose-700" : "text-slate-900";
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-right text-sm font-bold tabular-nums ${color}`}>{formatMmk(value)}</div>
    </div>
  );
};
