import type { Category } from "../../types";
import { resolveCategoryIconSymbol } from "./categoryIcons";

export type CategoryFilterVariant = "chips" | "tiles" | "compact";

interface CategoryFilterProps {
  /** Categories from the shared store — inactive ones are skipped. */
  categories: Category[];
  /** Currently selected value: the all-value, or a category name. */
  selectedCategory: string;
  /** Called with the all-value or a category name. */
  onChange: (value: string) => void;
  /** Show the leading "All" chip. Default true. */
  includeAll?: boolean;
  /** Label for the "All" chip. Default "All Categories". */
  allLabel?: string;
  /** Value emitted by the "All" chip. Default "all". */
  allValue?: string;
  /** Visual size: inline pill, POS-style tile, or small pill. Default "chips". */
  variant?: CategoryFilterVariant;
  className?: string;
}

interface FilterOption {
  value: string;
  label: string;
  symbol: string;
}

const VARIANT_BUTTON: Record<CategoryFilterVariant, string> = {
  chips: "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm",
  tiles: "flex flex-col items-center gap-1 rounded-xl px-4 py-2 text-xs",
  compact: "flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs",
};

const VARIANT_ICON: Record<CategoryFilterVariant, string> = {
  chips: "text-base",
  tiles: "text-xl",
  compact: "text-sm",
};

/**
 * Shared icon-chip category filter — replaces native `<select>` category
 * dropdowns. Renders the "All" chip plus one chip per active category, each
 * with its icon from the central category icon registry. New categories in
 * the store appear automatically; no category name is hardcoded.
 */
export const CategoryFilter = ({
  categories,
  selectedCategory,
  onChange,
  includeAll = true,
  allLabel = "All Categories",
  allValue = "all",
  variant = "chips",
  className = "",
}: CategoryFilterProps) => {
  const options: FilterOption[] = [
    ...(includeAll ? [{ value: allValue, label: allLabel, symbol: "apps" }] : []),
    ...categories
      .filter((category) => category.isActive)
      .map((category) => ({
        value: category.name,
        label: category.name,
        symbol: resolveCategoryIconSymbol(category.iconKey, category.name),
      })),
  ];

  return (
    <div
      role="group"
      aria-label="Filter by category"
      className={`flex flex-wrap gap-2 ${className}`.trim()}
    >
      {options.map((option) => {
        const selected = selectedCategory === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`${VARIANT_BUTTON[variant]} font-medium capitalize transition-all ${
              selected
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <span className={`material-symbols-rounded ${VARIANT_ICON[variant]}`}>
              {option.symbol}
            </span>
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
};
