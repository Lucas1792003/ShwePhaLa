import { useEffect, useMemo, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { SearchInput } from "../forms/SearchInput";
import { useToast } from "../ui/Toast";
import { getErrorMessage } from "../../lib/errors";
import { useDataStore } from "../../stores/dataStore";
import type { Product } from "../../types";

interface LinkProductsModalProps {
  open: boolean;
  onClose: () => void;
  supplierId: string;
  supplierName: string;
  products: Product[];
  /** Product ids already linked to this supplier — excluded from the picker. */
  linkedProductIds: Set<string>;
}

/**
 * Supplier-side "Add products" picker. Multi-select checkbox list of active,
 * not-yet-linked products with a search box. Writes via `addSupplierProducts`
 * (same supplier_products table + RLS as the product form).
 */
export const LinkProductsModal = ({
  open,
  onClose,
  supplierId,
  supplierName,
  products,
  linkedProductIds,
}: LinkProductsModalProps) => {
  const addSupplierProducts = useDataStore((state) => state.addSupplierProducts);
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Reset whenever the modal (re-)opens so it never carries a stale selection.
  useEffect(() => {
    if (!open) return;
    setSearch("");
    setSelected([]);
    setSaving(false);
  }, [open]);

  const eligible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products
      .filter((product) => product.isActive && !linkedProductIds.has(product.id))
      .filter(
        (product) =>
          !query ||
          product.name.toLowerCase().includes(query) ||
          (product.sku ?? "").toLowerCase().includes(query)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, linkedProductIds, search]);

  const toggle = (productId: string) => {
    setSelected((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  const handleAdd = async () => {
    if (selected.length === 0 || saving) return;
    setSaving(true);
    try {
      await addSupplierProducts(supplierId, selected);
      toast({
        variant: "success",
        title: "Products linked",
        description: `${selected.length} product${selected.length === 1 ? "" : "s"} linked to ${supplierName}.`,
      });
      onClose();
    } catch (error) {
      toast({
        variant: "error",
        title: "Could not link products",
        description: getErrorMessage(error, "Please try again."),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => (saving ? undefined : onClose())}
      title="Add products"
      description={`Link products to ${supplierName}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={saving || selected.length === 0}>
            {saving ? "Linking…" : `Add ${selected.length || ""}`.trim()}
          </Button>
        </>
      }
    >
      <SearchInput value={search} onChange={setSearch} placeholder="Search products by name or SKU…" />

      {eligible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-6 text-center text-sm text-slate-500">
          {products.some((p) => p.isActive && !linkedProductIds.has(p.id))
            ? "No products match your search."
            : "Every active product is already linked to this supplier."}
        </div>
      ) : (
        <div className="max-h-80 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
          {eligible.map((product) => (
            <label
              key={product.id}
              className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                checked={selected.includes(product.id)}
                onChange={() => toggle(product.id)}
              />
              <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                {product.name}
                {product.sku ? <span className="ml-1 font-mono text-xs text-slate-400">{product.sku}</span> : null}
              </span>
              <span className="shrink-0 text-xs text-slate-400">{product.category}</span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
};
