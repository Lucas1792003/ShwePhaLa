import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";
import { useToast } from "../ui/Toast";
import { getErrorMessage } from "../../lib/errors";
import { useDataStore } from "../../stores/dataStore";
import type { Product, Supplier } from "../../types";

interface PurchaseOrderCreateModalProps {
  open: boolean;
  onClose: () => void;
  // Shop the PO will be raised against. Caller (page) already picked the
  // effective shop from getEffectiveShopId; this component just submits it.
  shopId: string;
  // The ID of the current user — required by the RPC. Falsy disables submit.
  currentUserId: string | null | undefined;
  // Pre-selected supplier. When set, the supplier picker is collapsed to a
  // read-only label so the user can't accidentally raise a PO against a
  // different supplier when starting from the supplier workspace.
  defaultSupplierId?: string;
  // Active suppliers to choose from when defaultSupplierId is not set.
  suppliers: Supplier[];
  // Active products to add as PO lines.
  products: Product[];
  // Called after the RPC resolves successfully. Useful for the supplier
  // workspace to re-focus the newly-created PO.
  onCreated?: (purchaseOrderId: string) => void;
}

interface DraftItem {
  productId: string;
  orderedQty: number;
  unitCostMmk: number;
}

export const PurchaseOrderCreateModal = ({
  open,
  onClose,
  shopId,
  currentUserId,
  defaultSupplierId,
  suppliers,
  products,
  onCreated,
}: PurchaseOrderCreateModalProps) => {
  const createPurchaseOrder = useDataStore((state) => state.createPurchaseOrder);
  const toast = useToast();

  const [supplierId, setSupplierId] = useState(defaultSupplierId ?? "");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset form whenever the modal is (re-)opened or the pre-selected supplier
  // changes; keeps state clean across reopens without leaking previous draft.
  useEffect(() => {
    if (!open) return;
    setSupplierId(defaultSupplierId ?? "");
    setItems([]);
    setNotes("");
    setSubmitting(false);
  }, [open, defaultSupplierId]);

  const addItem = (productId: string) => {
    if (!productId || items.some((item) => item.productId === productId)) return;
    const product = products.find((p) => p.id === productId);
    setItems((prev) => [...prev, { productId, orderedQty: 1, unitCostMmk: product?.costMmk ?? 0 }]);
  };

  const updateItem = (productId: string, field: "orderedQty" | "unitCostMmk", value: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.productId === productId
          ? { ...item, [field]: Math.max(field === "orderedQty" ? 1 : 0, value) }
          : item
      )
    );
  };

  const removeItem = (productId: string) => {
    setItems((prev) => prev.filter((item) => item.productId !== productId));
  };

  const total = items.reduce((sum, item) => sum + item.orderedQty * item.unitCostMmk, 0);
  const lockedSupplier = defaultSupplierId
    ? suppliers.find((supplier) => supplier.id === defaultSupplierId) ?? null
    : null;
  const canSubmit =
    Boolean(currentUserId) && Boolean(supplierId) && items.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !currentUserId) return;
    setSubmitting(true);
    try {
      const id = await createPurchaseOrder({
        shopId,
        supplierId,
        items,
        notes,
        createdBy: currentUserId,
      });
      toast({ title: "Purchase order created", variant: "success" });
      onCreated?.(id);
      onClose();
    } catch (error) {
      toast({
        title: "Could not create purchase order",
        description: getErrorMessage(error, "Please try again."),
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const eligibleProducts = products.filter(
    (p) => p.isActive && !items.some((item) => item.productId === p.id)
  );

  return (
    <Modal open={open} onClose={() => (submitting ? undefined : onClose())} title="Create Purchase Order" size="lg">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Supplier</label>
          {lockedSupplier ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
              {lockedSupplier.name}{" "}
              <span className="ml-1 font-mono text-xs text-slate-500">{lockedSupplier.code}</span>
            </div>
          ) : (
            <Select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
              <option value="">Select supplier…</option>
              {suppliers
                .filter((supplier) => supplier.isActive)
                .map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
            </Select>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Add products</label>
          <Select
            value=""
            onChange={(event) => {
              if (event.target.value) addItem(event.target.value);
              event.target.value = "";
            }}
          >
            <option value="">Select product to add…</option>
            {eligibleProducts.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} (Cost: MMK {product.costMmk?.toLocaleString() ?? 0})
              </option>
            ))}
          </Select>
        </div>

        {items.length > 0 && (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">Product</th>
                  <th className="px-3 py-2 text-left">Qty</th>
                  <th className="px-3 py-2 text-left">Unit Cost</th>
                  <th className="px-3 py-2 text-right">Line Total</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const product = products.find((p) => p.id === item.productId);
                  return (
                    <tr key={item.productId} className="border-t">
                      <td className="px-3 py-2">{product?.name ?? item.productId}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={1}
                          value={item.orderedQty}
                          onChange={(event) =>
                            updateItem(item.productId, "orderedQty", parseInt(event.target.value, 10) || 1)
                          }
                          className="w-20 rounded border px-2 py-1"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          value={item.unitCostMmk}
                          onChange={(event) =>
                            updateItem(item.productId, "unitCostMmk", parseInt(event.target.value, 10) || 0)
                          }
                          className="w-24 rounded border px-2 py-1"
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-medium">
                        MMK {(item.orderedQty * item.unitCostMmk).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <Button size="sm" variant="ghost" onClick={() => removeItem(item.productId)}>
                          Remove
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t bg-slate-50">
                  <td colSpan={3} className="px-3 py-2 text-right font-medium">
                    Total:
                  </td>
                  <td className="px-3 py-2 text-right font-bold">MMK {total.toLocaleString()}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            rows={2}
            placeholder="Additional notes…"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? "Creating…" : "Create order"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
