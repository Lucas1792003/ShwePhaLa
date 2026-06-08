import { useMemo, useRef } from "react";
import type { Brand, Product, Category, ProductUnit } from "../../types";
import { Badge } from "../ui/Badge";
import { SearchInput } from "../forms/SearchInput";
import { formatMmk } from "../../lib/utils";
import { resolveCategoryIcon } from "../../features/categories/categoryIcons";
import { getActiveProductUnits, getDefaultProductUnit } from "../../features/catalog/productUnits";

interface ProductFinderProps {
  products: Product[];
  /** Active categories — drives the icon-based filter buttons. */
  categories: Category[];
  /** Active brands — used to render the per-category brand dropdown. */
  brands?: Brand[];
  search: string;
  category: string;
  /** Selected brand id; "" means "all brands in the selected category". */
  brandId?: string;
  onSearch: (value: string) => void;
  onCategory: (value: string) => void;
  onBrand?: (value: string) => void;
  inventoryById: Record<string, number>;
  cartUnitsByProductId?: Record<string, number>;
  productUnits?: ProductUnit[];
  onAdd: (product: Product, unit: ProductUnit) => void;
}

export const ProductFinder = ({
  products,
  categories,
  brands = [],
  search,
  category,
  brandId = "",
  onSearch,
  onCategory,
  onBrand,
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

  // Brands that belong to the currently selected category. Empty when "All"
  // is active (we hide the bar entirely) or when the category has no brands
  // configured yet — also hide in that case to avoid a useless dropdown.
  const brandsForCategory = useMemo(() => {
    if (category === "all") return [];
    const cat = categories.find((c) => c.name === category);
    if (!cat) return [];
    return brands
      .filter((b) => b.isActive && b.categoryId === cat.id)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }, [brands, categories, category]);

  const showBrandBar = brandsForCategory.length > 0 && Boolean(onBrand);

  // Click-and-drag horizontal scroll for the category row. Tracks the
  // pointer-down x + scrollLeft so onPointerMove can translate cursor
  // travel into scroll offset. The `dragMovedRef` flag is checked by
  // each tile's onClick — if the cursor moved more than 5 px during the
  // drag we treat the gesture as a scroll, not a select.
  const dragRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{ startX: number; startScroll: number; pointerId: number } | null>(null);
  const dragMovedRef = useRef(false);
  const beginDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    // Ignore right-click / middle-click drags so context menu still works.
    if (event.button !== 0) return;
    const el = dragRef.current;
    if (!el) return;
    dragStateRef.current = {
      startX: event.clientX,
      startScroll: el.scrollLeft,
      pointerId: event.pointerId,
    };
    dragMovedRef.current = false;
    el.setPointerCapture(event.pointerId);
  };
  const updateDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    const el = dragRef.current;
    if (!state || !el) return;
    const dx = event.clientX - state.startX;
    if (Math.abs(dx) > 5) dragMovedRef.current = true;
    el.scrollLeft = state.startScroll - dx;
  };
  const endDrag = () => {
    const state = dragStateRef.current;
    if (!state) return;
    const el = dragRef.current;
    if (el?.hasPointerCapture(state.pointerId)) {
      el.releasePointerCapture(state.pointerId);
    }
    dragStateRef.current = null;
    // Leave dragMovedRef true for one tick so the upcoming click event
    // can read it; clear right after via microtask.
    queueMicrotask(() => { dragMovedRef.current = false; });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Fixed Header - Search & Categories */}
      <div className="sticky top-0 z-10 space-y-4 bg-white pb-4">
        {/* Search Bar */}
        <SearchInput value={search} onChange={onSearch} placeholder="Search items here..." />

        {/* Category Tabs — horizontal scroll instead of wrap. Supports:
            * Mouse wheel → translates vertical scroll to horizontal
            * Click-and-drag → grab anywhere on the row and slide
            * Native trackpad horizontal swipe (unmodified, works free)
            Each tile checks `dragMovedRef` in onClick so a drag that
            crosses a tile doesn't accidentally select it. */}
        <div
          ref={dragRef}
          // Hide the native scrollbar — the row is drag/wheel-scrollable
          // and the visible bar was just noise. Cross-browser combo:
          // `scrollbar-width:none` (Firefox) + `::-webkit-scrollbar`
          // override (Chromium/Safari).
          className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 cursor-grab select-none active:cursor-grabbing [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onWheel={(event) => {
            if (event.deltaY === 0) return;
            event.currentTarget.scrollLeft += event.deltaY;
          }}
          onPointerDown={beginDrag}
          onPointerMove={updateDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {categoryButtons.map((cat) => (
            <button
              key={cat.key}
              type="button"
              onClick={() => {
                if (dragMovedRef.current) return;
                onCategory(cat.key);
              }}
              className={`flex flex-shrink-0 flex-col items-center gap-1 rounded-xl px-4 py-2 text-xs font-medium capitalize transition-all ${
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

        {/* Brand sub-filter — only shown when a specific category with at
            least one brand is selected. "All Categories" intentionally
            hides it (per spec) and so does a category with no brands. */}
        {showBrandBar && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Brand
            </span>
            <button
              type="button"
              onClick={() => onBrand?.("")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                brandId === ""
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              All
            </button>
            <select
              value={brandId}
              onChange={(event) => onBrand?.(event.target.value)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">Select a brand…</option>
              {brandsForCategory.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
            {brandId && (
              <Badge tone="green">
                {brandsForCategory.find((b) => b.id === brandId)?.name ?? "Brand"}
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Products Grid - Scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-4">
          {products.map((product) => {
            const isNonStock = Boolean(product.isNonStock);
            const qty = inventoryById[product.id] ?? 0;
            const requestedUnits = cartUnitsByProductId[product.id] ?? 0;
            const remainingUnits = isNonStock ? Number.POSITIVE_INFINITY : Math.max(0, qty - requestedUnits);
            const units = getActiveProductUnits(product.id, productUnits);
            const defaultUnit = getDefaultProductUnit(product, productUnits);
            const visibleUnits = units.length > 0 ? units : [defaultUnit];
            const canAddUnit = (unit: ProductUnit) =>
              isNonStock || remainingUnits >= unit.baseQuantity;
            const outOfStock = !isNonStock && qty <= 0;
            const fullyReserved = !outOfStock && remainingUnits <= 0;
            const lowStock = !isNonStock && qty > 0 && qty <= product.lowStockThreshold;
            const defaultAddDisabled = !canAddUnit(defaultUnit);
            const allUnitsDisabled = !visibleUnits.some(canAddUnit);

            return (
              <div
                key={product.id}
                role="button"
                tabIndex={defaultAddDisabled ? -1 : 0}
                aria-label={`Add ${product.name}`}
                aria-disabled={allUnitsDisabled}
                onClick={() => {
                  if (!defaultAddDisabled) onAdd(product, defaultUnit);
                }}
                onKeyDown={(event) => {
                  if (event.currentTarget !== event.target || defaultAddDisabled) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onAdd(product, defaultUnit);
                  }
                }}
                className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                  allUnitsDisabled
                    ? "cursor-not-allowed border-red-200 opacity-70"
                    : defaultAddDisabled
                      ? "cursor-default border-amber-200"
                      : "cursor-pointer border-slate-200"
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
                      {isNonStock
                        ? "Non stock"
                        : requestedUnits > 0
                          ? `${remainingUnits} of ${qty} left`
                          : `${qty} in stock`}
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
                        if (!defaultAddDisabled) onAdd(product, defaultUnit);
                      }}
                      disabled={defaultAddDisabled}
                      title={
                        defaultAddDisabled && !allUnitsDisabled
                          ? `Only ${remainingUnits} ${product.unitType} left. Choose a smaller unit.`
                          : defaultAddDisabled
                            ? `Only ${qty} in stock for this shop.`
                            : `Add ${product.name}`
                      }
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white transition-colors hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
                    >
                      <span className="material-symbols-rounded text-lg">add</span>
                    </button>
                  </div>
                  {visibleUnits.length > 1 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {visibleUnits.map((unit) => {
                        const disabled = !canAddUnit(unit);
                        return (
                          <button
                            key={unit.id}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (!disabled) onAdd(product, unit);
                            }}
                            disabled={disabled}
                            className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-rose-300 disabled:bg-white disabled:text-rose-600 disabled:hover:border-rose-300 disabled:hover:bg-white"
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
