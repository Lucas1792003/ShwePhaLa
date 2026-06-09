import type { ReactNode } from "react";
import { Card } from "../../components/ui/Card";
import { cn, formatMmk } from "../../lib/utils";
import { rangeLabel, useDashboardCopy } from "./dashboardCopy";
import type { DateRange } from "./dashboardMetrics";

const toneClasses = {
  emerald: {
    card: "border-emerald-200 bg-emerald-50/70",
    icon: "bg-emerald-100 text-emerald-700",
    value: "text-emerald-700",
  },
  blue: {
    card: "border-blue-200 bg-blue-50/70",
    icon: "bg-blue-100 text-blue-700",
    value: "text-blue-700",
  },
  amber: {
    card: "border-amber-200 bg-amber-50/70",
    icon: "bg-amber-100 text-amber-700",
    value: "text-amber-700",
  },
  rose: {
    card: "border-rose-200 bg-rose-50/70",
    icon: "bg-rose-100 text-rose-700",
    value: "text-rose-700",
  },
  slate: {
    card: "border-slate-200 bg-white",
    icon: "bg-slate-100 text-slate-700",
    value: "text-slate-800",
  },
  violet: {
    card: "border-violet-200 bg-violet-50/70",
    icon: "bg-violet-100 text-violet-700",
    value: "text-violet-700",
  },
} as const;

type Tone = keyof typeof toneClasses;

export const DateRangeSelector = ({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (value: DateRange) => void;
}) => {
  const copy = useDashboardCopy();
  return (
    <div className="max-w-full overflow-x-auto pb-1">
      <div className="inline-flex min-w-max rounded-lg border border-slate-200 bg-white p-1">
        {(["today", "week", "month"] as DateRange[]).map((range) => (
          <button
            key={range}
            type="button"
            onClick={() => onChange(range)}
            className={cn(
              "min-h-10 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold transition",
              value === range
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            )}
          >
            {rangeLabel(copy, range)}
          </button>
        ))}
      </div>
    </div>
  );
};

export const KpiCard = ({
  label,
  value,
  detail,
  icon,
  tone = "slate",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon: string;
  tone?: Tone;
}) => {
  const classes = toneClasses[tone];
  return (
    <Card className={cn("rounded-lg p-4 shadow-sm", classes.card)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold uppercase text-slate-500">
            {label}
          </div>
          <div className={cn("mt-2 truncate text-xl font-bold leading-7", classes.value)}>
            {value}
          </div>
          {detail && <div className="mt-1 truncate text-xs text-slate-500">{detail}</div>}
        </div>
        <span
          className={cn(
            "material-symbols-rounded flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xl",
            classes.icon
          )}
        >
          {icon}
        </span>
      </div>
    </Card>
  );
};

export const SectionCard = ({
  title,
  icon,
  action,
  children,
  className,
}: {
  title: string;
  icon?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <Card className={cn("rounded-lg p-4 shadow-sm", className)}>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        {icon && (
          <span className="material-symbols-rounded text-xl text-emerald-700">{icon}</span>
        )}
        <h2 className="truncate text-sm font-semibold text-slate-800">{title}</h2>
      </div>
      {action && <div className="min-w-0">{action}</div>}
    </div>
    {children}
  </Card>
);

export const EmptyState = ({ message, icon = "inbox" }: { message: string; icon?: string }) => (
  <div className="flex min-h-24 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-center">
    <span className="material-symbols-rounded text-3xl text-slate-300">{icon}</span>
    <p className="mt-2 text-sm text-slate-500">{message}</p>
  </div>
);

export const MiniMoney = ({ value }: { value: number }) => (
  <span className="font-semibold tabular-nums text-emerald-700">{formatMmk(value)}</span>
);
