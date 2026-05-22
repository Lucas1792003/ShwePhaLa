import type { Product, Category } from "../../types";
import { Badge } from "../ui/Badge";
import { SearchInput } from "../forms/SearchInput";
import { formatMmk } from "../../lib/utils";
import { resolveCategoryIcon } from "../../features/categories/categoryIcons";

interface ProductFinderProps {
  products: Product[];
  /** Active categories — drives the icon-based filter buttons. */
  categories: Category[];
  search: string;
  category: string;
  onSearch: (value: string) => void;
  onCategory: (value: string) => void;
  inventoryById: Record<string, number>;
  onAdd: (product: Product, usePack: boolean) => void;
}

export const ProductFinder = ({
  products,
  categories,
  search,
  category,
  onSearch,
  onCategory,
  inventoryById,
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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((product) => {
            const qty = inventoryById[product.id] ?? 0;
            const outOfStock = qty <= 0;
            const lowStock = qty > 0 && qty <= product.lowStockThreshold;

            return (
              <div
                key={product.id}
                className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all hover:shadow-md ${
                  outOfStock ? "border-red-200 opacity-60" : "border-slate-200"
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
                  {lowStock && !outOfStock && (
                    <div className="absolute right-2 top-2">
                      <Badge tone="amber">Low</Badge>
                    </div>
                  )}

                  {/* Stock Count */}
                  <div className="absolute bottom-2 left-2">
                    <span className="rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
                      {qty} in stock
                    </span>
                  </div>
                </div>

                {/* Product Info */}
                <div className="flex flex-1 flex-col p-3">
                  <h3 className="line-clamp-2 text-sm font-semibold text-slate-800">{product.name}</h3>
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <span className="text-base font-bold text-emerald-600">{formatMmk(product.priceMmk)}</span>
                    <button
                      type="button"
                      onClick={() => onAdd(product, false)}
                      disabled={outOfStock}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white transition-colors hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
                    >
                      <span className="material-symbols-rounded text-lg">add</span>
                    </button>
                  </div>
                  {product.packSize && (
                    <button
                      type="button"
                      onClick={() => onAdd(product, true)}
                      disabled={outOfStock}
                      className="mt-2 w-full rounded-lg border border-emerald-200 bg-emerald-50 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed"
                    >
                      Add Pack ({product.packSize})
                    </button>
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
