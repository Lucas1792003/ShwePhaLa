import { cn } from "../../lib/utils";

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = ({ className, ...props }: SelectProps) => (
  <select
    className={cn(
      "min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200",
      className
    )}
    {...props}
  />
);
