import { useEffect, useMemo, useRef, useState } from "react";
import type { Category, Product, ProductBarcode } from "../../types";
import { Badge } from "../ui/Badge";
import { cn, formatMmk } from "../../lib/utils";
import {
  filterProductPickerOptions,
  getProductPickerCategory,
  getProductPickerCategoryIcon,
  getSelectedProduct,
} from "./productPickerUtils";

interface ProductPickerProps {
  products: Product[];
  categories?: Category[];
  barcodes?: ProductBarcode[];
  value: string;
  onSelect: (productId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  shopStockByProductId?: Record<string, number>;
  showStock?: boolean;
}

const ProductThumb = ({
  product,
  categories,
  compact = false,
}: {
  product: Product;
  categories: Category[];
  compact?: boolean;
}) => {
  const icon = getProductPickerCategoryIcon(product, categories);

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50",
        compact ? "h-11 w-11" : "h-12 w-12",
      )}
    >
      {product.imageUrl ? (
        <img
          src={product.imageUrl}
          alt={product.name}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="material-symbols-rounded text-2xl text-slate-400">
          {icon.symbol}
        </span>
      )}
    </div>
  );
};

export const ProductPicker = ({
  products,
  categories = [],
  barcodes = [],
  value,
  onSelect,
  placeholder = "Select product...",
  disabled = false,
  error,
  shopStockByProductId,
  showStock = false,
}: ProductPickerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedProduct = getSelectedProduct(products, value);

  const results = useMemo(
    () => filterProductPickerOptions(products, query, categories, barcodes),
    [products, query, categories, barcodes],
  );

  useEffect(() => {
    if (!isOpen) return;
    const timeout = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(timeout);
  }, [isOpen]);

  useEffect(() => {
    if (disabled) setIsOpen(false);
  }, [disabled]);

  const selectProduct = (product: Product) => {
    onSelect(product.id);
    setQuery("");
    setIsOpen(false);
  };

  const renderProductMeta = (product: Product) => {
    const category = getProductPickerCategory(product, categories);
    const categoryIcon = getProductPickerCategoryIcon(product, categories);
    const stock = shopStockByProductId?.[product.id];

    return (
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="font-medium text-slate-600">
          SKU: {product.sku || "No SKU"}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
          <span className="material-symbols-rounded text-sm">
            {categoryIcon.symbol}
          </span>
          {category?.name ?? product.category}
        </span>
        <span className="font-semibold text-emerald-700">
          {formatMmk(product.priceMmk)}
        </span>
        {showStock && typeof stock === "number" && (
          <span className={cn("font-medium", stock > 0 ? "text-slate-500" : "text-rose-600")}>
            Stock: {stock}
          </span>
        )}
        {!product.isActive && <Badge tone="red">Inactive</Badge>}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className={cn(
          "flex min-h-[74px] w-full items-center gap-3 rounded-2xl border bg-white px-3 py-3 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2",
          error
            ? "border-rose-300 focus-visible:ring-rose-200"
            : "border-slate-200 hover:border-emerald-300 focus-visible:ring-emerald-200",
          disabled && "cursor-not-allowed bg-slate-50 opacity-80",
        )}
      >
        {selectedProduct ? (
          <>
            <ProductThumb product={selectedProduct} categories={categories} compact />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-slate-900">
                {selectedProduct.name}
              </div>
              {renderProductMeta(selectedProduct)}
            </div>
          </>
        ) : value ? (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
              <span className="material-symbols-rounded text-2xl">warning</span>
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-rose-700">
                Selected product is no longer available.
              </div>
              <div className="text-xs text-slate-500">Choose another active product.</div>
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3 text-slate-500">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100">
              <span className="material-symbols-rounded text-2xl text-slate-400">inventory_2</span>
            </div>
            <span className="text-sm font-medium">{placeholder}</span>
          </div>
        )}
        <span className="material-symbols-rounded shrink-0 text-slate-400">
          {isOpen ? "expand_less" : "expand_more"}
        </span>
      </button>

      {isOpen && !disabled && (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
          <div className="relative">
            <span className="material-symbols-rounded pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-slate-400">
              search
            </span>
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, SKU, barcode, category..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
            {results.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                No products found
              </div>
            ) : (
              results.map((product) => {
                const selected = product.id === value;
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => selectProduct(product)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition",
                      selected
                        ? "border-emerald-300 bg-emerald-50"
                        : "border-slate-100 bg-white hover:border-emerald-200 hover:bg-emerald-50/40",
                    )}
                  >
                    <ProductThumb product={product} categories={categories} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-slate-900">
                          {product.name}
                        </span>
                        {selected && (
                          <span className="material-symbols-rounded text-lg text-emerald-600">
                            check_circle
                          </span>
                        )}
                      </div>
                      {renderProductMeta(product)}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
};
