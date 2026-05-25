import { useState } from "react";
import { useDataStore } from "../stores/dataStore";
import { Card } from "../components/ui/Card";
import { SearchInput } from "../components/forms/SearchInput";
import { PageHeader } from "../components/layout/PageHeader";
import { CategoryFilter } from "../features/categories/CategoryFilter";
import { getActiveProductUnits } from "../features/catalog/productUnits";
import { formatMmk } from "../lib/utils";

export const ProductsPage = () => {
  const products = useDataStore((state) => state.products);
  const productUnits = useDataStore((state) => state.productUnits);
  const categories = useDataStore((state) => state.categories);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const filtered = products.filter((product) => {
    const matchesSearch = product.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === "all" || product.category === category;
    return matchesSearch && matchesCategory;
  });

  return (
    <Card>
      <PageHeader title="Products" subtitle="Read-only catalog with barcodes and base stock units." />
      <div className="mt-6 space-y-3">
        <SearchInput value={search} onChange={setSearch} />
        <CategoryFilter
          categories={categories}
          selectedCategory={category}
          onChange={setCategory}
        />
      </div>
      <div className="mt-6 space-y-3">
        {filtered.map((product) => {
          const units = getActiveProductUnits(product.id, productUnits);
          return (
          <div key={product.id} className="rounded-2xl border border-slate-200/70 bg-slate-50/60 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">{product.name}</div>
                <div className="text-xs text-slate-500">{product.category}</div>
              </div>
              <div className="text-sm font-semibold">{formatMmk(product.priceMmk)}</div>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Unit: {product.unitType} - Low stock alert at {product.lowStockThreshold}
            </div>
            {units.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {units.map((unit) => (
                  <span key={unit.id} className="rounded-full bg-white px-2 py-1 text-xs text-slate-600">
                    {unit.name}: {unit.baseQuantity} {product.unitType} - {formatMmk(unit.salePriceMmk)}
                  </span>
                ))}
              </div>
            )}
          </div>
        );})}
      </div>
    </Card>
  );
};
