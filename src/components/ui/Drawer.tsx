import { useEffect } from "react";
import type { ReactNode } from "react";

interface DrawerProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
}

export const Drawer = ({ open, title, onClose, children, header, footer }: DrawerProps) => {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-sm">
      <div className="flex h-full w-full flex-col border-l border-slate-200/70 bg-white shadow-2xl sm:max-w-lg">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200/70 bg-white px-6 py-4">
          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold text-slate-900">{title}</div>
            {header}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <span className="material-symbols-rounded text-xl">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200/70 bg-white px-6 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
