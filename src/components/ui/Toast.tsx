import { useEffect } from "react";
import { cn } from "../../lib/utils";
import { useToastStore } from "../../stores/toastStore";

export const useToast = () => {
  const addToast = useToastStore((state) => state.addToast);
  return addToast;
};

export const ToastViewport = () => {
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((toast) => setTimeout(() => removeToast(toast.id), 3200));
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, [toasts, removeToast]);

  return (
    <div className="fixed right-6 top-6 z-50 space-y-3 print-hidden">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "w-80 rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-2xl",
            toast.variant === "success" && "border-emerald-200",
            toast.variant === "error" && "border-rose-200"
          )}
        >
          <div className="font-semibold text-slate-900">{toast.title}</div>
          {toast.description && <div className="mt-1 text-slate-500">{toast.description}</div>}
        </div>
      ))}
    </div>
  );
};
