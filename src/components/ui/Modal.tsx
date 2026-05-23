import { useEffect } from "react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizes: Record<string, string> = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-2xl",
  xl: "max-w-5xl",
};

export const Modal = ({ open, title, description, onClose, children, footer, size = "md" }: ModalProps) => {
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"
      onClick={(e) => {
        // Close when clicking the backdrop
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "flex max-h-[90vh] w-full flex-col rounded-3xl border border-slate-200/70 bg-white shadow-2xl",
          sizes[size]
        )}
      >
        {/* Fixed Header */}
        <div className="flex flex-shrink-0 items-start justify-between border-b border-slate-100 p-6 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <span className="material-symbols-rounded text-xl">close</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 pt-4">
          <div className="space-y-4">{children}</div>
        </div>

        {/* Fixed Footer */}
        {footer && (
          <div className="flex flex-shrink-0 items-center justify-end gap-3 border-t border-slate-100 p-6 pt-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
