import { useEffect, useMemo, useState } from "react";
import { useDataStore } from "../stores/dataStore";
import { useAuthStore } from "../stores/authStore";
import { PageHeader } from "../components/layout/PageHeader";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { hasPermission } from "../lib/permissions";
import { newId } from "../lib/id";
import {
  mapShopFormError,
  normalizeShopInput,
  normalizeShopKey,
  validateShopInput,
} from "../lib/shopValidation";
import {
  countShopReferences,
  formatShopReferenceSummary,
} from "../lib/shopDelete";
import { getErrorMessage } from "../lib/errors";

export const ShopsPage = () => {
  const shops = useDataStore((state) => state.shops);
  const users = useDataStore((state) => state.users);
  const inventory = useDataStore((state) => state.inventory);
  const shifts = useDataStore((state) => state.shifts);
  const sales = useDataStore((state) => state.sales);
  const purchaseOrders = useDataStore((state) => state.purchaseOrders);
  const supplierPayments = useDataStore((state) => state.supplierPayments);
  const stockTransfers = useDataStore((state) => state.stockTransfers);
  const priceTiers = useDataStore((state) => state.priceTiers);
  const refundVoidRequests = useDataStore((state) => state.refundVoidRequests);
  const auditLogs = useDataStore((state) => state.auditLogs);
  const addShop = useDataStore((state) => state.addShop);
  const updateShop = useDataStore((state) => state.updateShop);
  const deleteShop = useDataStore((state) => state.deleteShop);
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentUser = users.find((u) => u.id === currentUserId);
  const canDeleteShop = hasPermission(currentUser, "shop:delete");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refCountsByShop = useMemo(() => {
    const refSources = {
      users, inventory, shifts, sales, purchaseOrders, supplierPayments,
      stockTransfers, priceTiers, refundVoidRequests, auditLogs,
    };
    return new Map(shops.map((shop) => [shop.id, countShopReferences(shop.id, refSources)]));
  }, [shops, users, inventory, shifts, sales, purchaseOrders, supplierPayments, stockTransfers, priceTiers, refundVoidRequests, auditLogs]);

  // Derive a short, unique shop code from the name (used as the receipt prefix).
  const generateShopCode = (shopName: string): string => {
    const words = shopName.trim().split(/\s+/).filter(Boolean);
    let base =
      words.length >= 2
        ? words.map((w) => w[0]).join("").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 4)
        : shopName.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 3);
    if (base.length < 2) base = "SHP";
    const taken = new Set(shops.filter((s) => s.id !== editingId).map((s) => normalizeShopKey(s.code)));
    if (!taken.has(normalizeShopKey(base))) return base;
    let n = 2;
    while (taken.has(normalizeShopKey(`${base}${n}`))) n += 1;
    return `${base}${n}`;
  };

  // Auto-generate the code when the name changes (new shops only).
  useEffect(() => {
    if (!editingId && name.trim()) setCode(generateShopCode(name));
    if (!editingId && !name.trim()) setCode("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, editingId]);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setCode("");
    setAddress("");
    setPhone("");
    setFeedback(null);
  };

  const handleSubmit = async () => {
    const normalized = normalizeShopInput({ name, code, address, phone });
    const validationError = validateShopInput(normalized, shops, editingId);
    if (validationError) {
      setFeedback({ type: "error", message: validationError });
      return;
    }
    setIsSubmitting(true);
    setFeedback(null);
    try {
      if (editingId) {
        const existingShop = shops.find((s) => s.id === editingId);
        await updateShop({
          id: editingId,
          name: normalized.name,
          code: normalized.code,
          address: normalized.address,
          phone: normalized.phone,
          email: existingShop?.email,
          isActive: existingShop?.isActive ?? true,
          createdAt: existingShop?.createdAt ?? new Date().toISOString(),
        });
      } else {
        await addShop({
          id: newId("shop"),
          name: normalized.name,
          code: normalized.code,
          address: normalized.address,
          phone: normalized.phone,
          isActive: true,
          createdAt: new Date().toISOString(),
        });
      }
      resetForm();
    } catch (error) {
      setFeedback({ type: "error", message: mapShopFormError(error) });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (id: string) => {
    const shop = shops.find((item) => item.id === id);
    if (!shop) return;
    setEditingId(id);
    setName(shop.name);
    setCode(shop.code);
    setAddress(shop.address);
    setPhone(shop.phone ?? "");
    setFeedback(null);
  };

  const handleDelete = async (id: string) => {
    const shop = shops.find((item) => item.id === id);
    if (!shop) return;
    const counts = refCountsByShop.get(id);
    if (counts && counts.total > 0) {
      setFeedback({
        type: "error",
        message: `Cannot delete "${shop.name}": ${formatShopReferenceSummary(counts)} reference this shop. Reassign or remove that data first.`,
      });
      return;
    }
    if (!confirm(`Delete shop "${shop.name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    setFeedback(null);
    try {
      await deleteShop(id);
      if (editingId === id) resetForm();
      setFeedback({ type: "success", message: `Shop "${shop.name}" deleted.` });
    } catch (error) {
      setFeedback({ type: "error", message: getErrorMessage(error) });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card>
      <PageHeader title="Shops" subtitle="Create and edit shop profiles." />
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <Input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setFeedback(null);
            }}
            placeholder="Shop name"
          />
          <Input
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              setFeedback(null);
            }}
            placeholder="Shop code"
          />
          <Input
            value={address}
            onChange={(event) => {
              setAddress(event.target.value);
              setFeedback(null);
            }}
            placeholder="Address"
          />
          <Input
            type="tel"
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
              setFeedback(null);
            }}
            placeholder="Phone number"
          />
          {feedback && (
            <div
              className={
                feedback.type === "error"
                  ? "rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
                  : "rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
              }
            >
              {feedback.message}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : editingId ? "Update" : "Create"}
            </Button>
            {editingId && (
              <Button variant="secondary" onClick={resetForm} disabled={isSubmitting}>
                Cancel
              </Button>
            )}
          </div>
        </div>
        <div className="space-y-3">
          {shops.map((shop) => {
            const counts = refCountsByShop.get(shop.id);
            const refSummary = counts && counts.total > 0 ? formatShopReferenceSummary(counts) : null;
            const isDeleting = deletingId === shop.id;
            // Disable Delete when this shop is referenced by operational data, when
            // another row's delete is in flight, or when the user lacks shop:delete.
            const deleteDisabled = !canDeleteShop || (counts?.total ?? 0) > 0 || isDeleting;
            const deleteTitle = !canDeleteShop
              ? "You don't have permission to delete shops."
              : refSummary
                ? `Cannot delete: referenced by ${refSummary}.`
                : "Delete this shop";
            return (
              <div key={shop.id} className="rounded-2xl border border-slate-200/70 bg-slate-50/60 p-4">
                <div className="font-semibold">{shop.name}</div>
                <div className="text-xs text-slate-500">{shop.code} - {shop.address}</div>
                {shop.phone && (
                  <div className="mt-1 text-xs text-slate-500">Phone: {shop.phone}</div>
                )}
                {refSummary && (
                  <div className="mt-2 text-xs text-slate-400">In use by {refSummary}</div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => handleEdit(shop.id)}>
                    Edit
                  </Button>
                  {canDeleteShop && (
                    <Button
                      variant="danger"
                      onClick={() => handleDelete(shop.id)}
                      disabled={deleteDisabled}
                      title={deleteTitle}
                    >
                      {isDeleting ? "Deleting..." : "Delete"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
};
