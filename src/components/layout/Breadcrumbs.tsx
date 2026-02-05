interface BreadcrumbsProps {
  items: { label: string; href?: string }[];
}

export const Breadcrumbs = ({ items }: BreadcrumbsProps) => (
  <div className="text-xs uppercase tracking-[0.16em] text-slate-400">
    {items.map((item, index) => (
      <span key={`${item.label}-${index}`}>
        {item.label}
        {index < items.length - 1 && " / "}
      </span>
    ))}
  </div>
);
