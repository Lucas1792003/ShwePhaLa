import type { ReactNode } from "react";
import { Breadcrumbs } from "./Breadcrumbs";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  crumbs?: { label: string; href?: string }[];
}

export const PageHeader = ({ title, subtitle, actions, crumbs }: PageHeaderProps) => (
  <div className="flex flex-col gap-4 border-b border-slate-200/70 pb-4 lg:flex-row lg:items-end lg:justify-between">
    <div className="min-w-0">
      {crumbs && <Breadcrumbs items={crumbs} />}
      <h1 className="break-words text-2xl font-semibold tracking-tight text-slate-900 lg:text-3xl">{title}</h1>
      {subtitle && <p className="mt-2 text-sm text-slate-500">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div>}
  </div>
);
