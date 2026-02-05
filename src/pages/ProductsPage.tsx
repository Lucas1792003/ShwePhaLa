import { useState } from "react";
import { useDataStore } from "../stores/dataStore";
import { Card } from "../components/ui/Card";
import { Select } from "../components/ui/Select";
import { SearchInput } from "../components/forms/SearchInput";
import { PageHeader } from "../components/layout/PageHeader";
import { formatMmk } from "../lib/utils";

export const ProductsPage = () => {
  const products = useDataStore((state) => state.products);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const filtered = products.filter((product) => {
    const matchesSearch = product.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === "all" || product.category === category;
    return matchesSearch && matchesCategory;
  });

  return (
    <Card>
      <PageHeader title="Products" subtitle="Read-only catalog with barcodes and pack sizes." />
      <div className="mt-6 flex flex-wrap gap-3">
        <SearchInput value={search} onChange={setSearch} />
        <Select value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="all">All</option>
          <option value="beer">Beer</option>
          <option value="alcohol">Alcohol</option>
          <option value="juice">Juice</option>
        </Select>
      </div>
      <div className="mt-6 space-y-3">
        {filtered.map((product) => (
          <div key={product.id} className="rounded-2xl border border-slate-200/70 bg-slate-50/60 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">{product.name}</div>
                <div className="text-xs text-slate-500">{product.category}</div>
              </div>
              <div className="text-sm font-semibold">{formatMmk(product.priceMmk)}</div>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Pack size: {product.packSize ? product.packSize : "-"} - Low stock alert at {product.lowStockThreshold}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};
