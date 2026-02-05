import type { ReactNode } from "react";
import { Breadcrumbs } from "./Breadcrumbs";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  crumbs?: { label: string; href?: string }[];
}

export const PageHeader = ({ title, subtitle, actions, crumbs }: PageHeaderProps) => (
  <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200/70 pb-4">
    <div>
      {crumbs && <Breadcrumbs items={crumbs} />}
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
      {subtitle && <p className="mt-2 text-sm text-slate-500">{subtitle}</p>}
    </div>
    {actions}
  </div>
);
