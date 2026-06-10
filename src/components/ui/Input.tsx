import { forwardRef } from "react";
import { cn } from "../../lib/utils";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  /** Renders the invalid/error state (red border + ring) and sets aria-invalid. */
  error?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, error, onFocus, ...props }, ref) => (
  <input
    ref={ref}
    aria-invalid={error || undefined}
    className={cn(
      "min-h-11 w-full rounded-xl border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2",
      error
        ? "border-rose-400 focus:border-rose-400 focus:ring-rose-200"
        : "border-slate-200 focus:border-emerald-400 focus:ring-emerald-200",
      className
    )}
    onFocus={(e) => {
      e.target.select();
      onFocus?.(e);
    }}
    {...props}
  />
));

Input.displayName = "Input";
