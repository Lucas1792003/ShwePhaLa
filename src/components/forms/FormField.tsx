import type { ReactNode } from "react";

interface FormFieldProps {
  label: string;
  description?: string;
  error?: string;
  children: ReactNode;
}

export const FormField = ({ label, description, error, children }: FormFieldProps) => (
  <div className="space-y-1.5">
    <div className="text-sm font-semibold text-slate-700">{label}</div>
    {description && <div className="text-xs text-slate-500">{description}</div>}
    {children}
    {error && <div className="text-xs text-red-500">{error}</div>}
  </div>
);
