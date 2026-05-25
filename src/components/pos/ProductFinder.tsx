import type { Product, Category, ProductUnit } from "../../types";
import { Badge } from "../ui/Badge";
import { SearchInput } from "../forms/SearchInput";
import { formatMmk } from "../../lib/utils";
import { resolveCategoryIcon } from "../../features/categories/categoryIcons";
import { getActiveProductUnits, getDefaultProductUnit } from "../../features/catalog/productUnits";

interface ProductFinderProps {
  products: Product[];
  /** Active categories — drives the icon-based filter buttons. */
  categories: Category[];
  search: string;
  category: string;
  onSearch: (value: string) => void;
  onCategory: (value: string) => void;
  inventoryById: Record<string, number>;
  cartUnitsByProductId?: Record<string, number>;
  productUnits?: ProductUnit[];
  onAdd: (product: Product, unit: ProductUnit) => void;
}

export const ProductFinder = ({
  products,
  categories,
  search,
  category,
  onSearch,
  onCategory,
  inventoryById,
  cartUnitsByProductId = {},
  productUnits = [],
  onAdd,
}: ProductFinderProps) => {
  // "All" keeps its own grid icon; every category resolves its icon through
  // the shared central registry (iconKey, else category name, else default).
  const categoryButtons = [
    { key: "all", label: "All", symbol: "apps" },
    ...categories.map((cat) => ({
      key: cat.name,
      label: cat.name,
      symbol: resolveCategoryIcon(cat.iconKey, cat.name).symbol,
    })),
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Fixed Header - Search & Categories */}
      <div className="sticky top-0 z-10 space-y-4 bg-white pb-4">
        {/* Search Bar */}
        <SearchInput value={search} onChange={onSearch} placeholder="Search items here..." />

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2">
          {categoryButtons.map((cat) => (
            <button
              key={cat.key}
              type="button"
              onClick={() => onCategory(cat.key)}
              className={`flex flex-col items-center gap-1 rounded-xl px-4 py-2 text-xs font-medium capitalize transition-all ${
                category === cat.key
                  ? "bg-emerald-600 text-white shadow-md"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <span className="material-symbols-rounded text-xl">{cat.symbol}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Products Grid - Scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-4">
          {products.map((product) => {
            const qty = inventoryById[product.id] ?? 0;
            const requestedUnits = cartUnitsByProductId[product.id] ?? 0;
            const remainingUnits = Math.max(0, qty - requestedUnits);
            const units = getActiveProductUnits(product.id, productUnits);
            const defaultUnit = getDefaultProductUnit(product, productUnits);
            const visibleUnits = units.length > 0 ? units : [defaultUnit];
            const outOfStock = qty <= 0;
            const fullyReserved = !outOfStock && remainingUnits <= 0;
            const lowStock = qty > 0 && qty <= product.lowStockThreshold;
            const unitAddDisabled = outOfStock || remainingUnits < defaultUnit.baseQuantity;

            return (
              <div
                key={product.id}
                role="button"
                tabIndex={unitAddDisabled ? -1 : 0}
                aria-label={`Add ${product.name}`}
                aria-disabled={unitAddDisabled}
                onClick={() => {
                  if (!unitAddDisabled) onAdd(product, defaultUnit);
                }}
                onKeyDown={(event) => {
                  if (event.currentTarget !== event.target || unitAddDisabled) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onAdd(product, defaultUnit);
                  }
                }}
                className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                  unitAddDisabled ? "cursor-not-allowed border-red-200 opacity-70" : "cursor-pointer border-slate-200"
                }`}
              >
                {/* Product Image */}
                <div className="relative h-32 w-full bg-gradient-to-br from-slate-100 to-slate-50">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <span className="material-symbols-rounded text-5xl text-slate-300">
                        {resolveCategoryIcon(undefined, product.category).symbol}
                      </span>
                    </div>
                  )}

                  {/* Stock Badge */}
                  {outOfStock && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <Badge tone="red">Out of stock</Badge>
                    </div>
                  )}
                  {fullyReserved && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <Badge tone="amber">All in cart</Badge>
                    </div>
                  )}
                  {lowStock && !outOfStock && (
                    <div className="absolute right-2 top-2">
                      <Badge tone="amber">Low</Badge>
                    </div>
                  )}

                  {/* Stock Count */}
                  <div className="absolute bottom-2 left-2">
                    <span className="rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
                      {requestedUnits > 0 ? `${remainingUnits} of ${qty} left` : `${qty} in stock`}
                    </span>
                  </div>
                </div>

                {/* Product Info */}
                <div className="flex flex-1 flex-col p-3">
                  <h3 className="line-clamp-2 text-sm font-semibold text-slate-800">{product.name}</h3>
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <span className="text-base font-bold text-emerald-600">{formatMmk(defaultUnit.salePriceMmk)}</span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!unitAddDisabled) onAdd(product, defaultUnit);
                      }}
                      disabled={unitAddDisabled}
                      title={unitAddDisabled ? `Only ${qty} in stock for this shop.` : `Add ${product.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white transition-colors hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
                    >
                      <span className="material-symbols-rounded text-lg">add</span>
                    </button>
                  </div>
                  {visibleUnits.length > 1 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {visibleUnits.map((unit) => {
                        const disabled = remainingUnits < unit.baseQuantity;
                        return (
                          <button
                            key={unit.id}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (!disabled) onAdd(product, unit);
                            }}
                            disabled={disabled}
                            className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                            title={`${unit.name} deducts ${unit.baseQuantity} ${product.unitType}`}
                          >
                            {unit.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {products.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
            No products found.
          </div>
        )}
      </div>
    </div>
  );
};
