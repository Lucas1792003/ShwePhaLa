import { cn } from "../../lib/utils";

interface TabItem {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
}

export const Tabs = ({ tabs, active, onChange }: TabsProps) => (
  <div className="max-w-full overflow-x-auto pb-1">
    <div className="inline-flex min-w-max rounded-full border border-slate-200 bg-white p-1 shadow-sm">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={cn(
            "min-h-10 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition",
            active === tab.id ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
          )}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  </div>
);
