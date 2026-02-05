import { useMemo, useState } from "react";
import { useAuthStore } from "../stores/authStore";
import { useAppStore } from "../stores/appStore";
import { useDataStore } from "../stores/dataStore";
import { PageHeader } from "../components/layout/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { Select } from "../components/ui/Select";
import { SearchInput } from "../components/forms/SearchInput";
import { getEffectiveShopId } from "../lib/utils";
import type { PriceTier } from "../types";

export const PricingPage = () => {
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentUser = useDataStore((state) => state.users.find((u) => u.id === currentUserId));
  const { currentShopId } = useAppStore();
  const shops = useDataStore((state) => state.shops);
  const products = useDataStore((state) => state.products);
  const priceTiers = useDataStore((state) => state.priceTiers);

  const addPriceTier = useDataStore((state) => state.addPriceTier);
  const updatePriceTier = useDataStore((state) => state.updatePriceTier);
  const deletePriceTier = useDataStore((state) => state.deletePriceTier);

  const [search, setSearch] = useState("");
  const [productFilter, setProductFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [editingTier, setEditingTier] = useState<PriceTier | null>(null);
  const [form, setForm] = useState({
    productId: "",
    shopId: "",
    minQty: 1,
    maxQty: "",
    priceMmk: 0,
  });

  const shopId = getEffectiveShopId(currentUser, currentShopId, shops);
  const isAdmin = currentUser?.role === "ADMIN";

  // Group tiers by product
  const tiersByProduct = useMemo(() => {
    const grouped = new Map<string, PriceTier[]>();
    priceTiers
      .filter((t) => !t.shopId || t.shopId === shopId || isAdmin)
      .forEach((tier) => {
        const existing = grouped.get(tier.productId) ?? [];
        grouped.set(tier.productId, [...existing, tier]);
      });
    return grouped;
  }, [priceTiers, shopId, isAdmin]);

  // Filter products
  const filteredProducts = products.filter((p) => {
    const hasSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const hasTiers = productFilter === "all" || (productFilter === "with_tiers" && tiersByProduct.has(p.id));
    return hasSearch && (productFilter === "all" || hasTiers);
  });

  const openCreateModal = (productId?: string) => {
    setEditingTier(null);
    const product = productId ? products.find((p) => p.id === productId) : null;
    setForm({
      productId: productId ?? "",
      shopId: "",
      minQty: 1,
      maxQty: "",
      priceMmk: product?.priceMmk ?? 0,
    });
    setShowModal(true);
  };

  const openEditModal = (tier: PriceTier) => {
    setEditingTier(tier);
    setForm({
      productId: tier.productId,
      shopId: tier.shopId ?? "",
      minQty: tier.minQty,
      maxQty: tier.maxQty?.toString() ?? "",
      priceMmk: tier.priceMmk,
    });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.productId || form.minQty < 1 || form.priceMmk < 0) {
      alert("Please fill all required fields");
      return;
    }
    if (!currentUserId) return;

    const tierData: PriceTier = {
      id: editingTier?.id ?? `tier-${Date.now()}`,
      productId: form.productId,
      shopId: form.shopId || undefined,
      minQty: form.minQty,
      maxQty: form.maxQty ? parseInt(form.maxQty) : undefined,
      priceMmk: form.priceMmk,
      isActive: editingTier?.isActive ?? true,
      createdAt: editingTier?.createdAt ?? new Date().toISOString(),
      createdBy: editingTier?.createdBy ?? currentUserId,
    };

    if (editingTier) {
      updatePriceTier(tierData);
    } else {
      addPriceTier(tierData);
    }
    setShowModal(false);
  };

  const handleDelete = (tierId: string) => {
    if (confirm("Are you sure you want to delete this price tier?")) {
      deletePriceTier(tierId);
    }
  };

  const toggleActive = (tier: PriceTier) => {
    updatePriceTier({ ...tier, isActive: !tier.isActive });
  };

  return (
    <Card>
      <PageHeader
        title="Tier-Based Pricing"
        subtitle="Configure quantity-based price breaks for products"
        actions={
          isAdmin && (
            <Button onClick={() => openCreateModal()}>Add Price Tier</Button>
          )
        }
      />

      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="font-medium text-blue-800 mb-2">How Tier Pricing Works</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>- Price tiers are automatically applied in POS based on quantity</li>
          <li>- Higher quantities = lower per-unit price (bulk discounts)</li>
          <li>- Shop-specific tiers override global tiers for that shop</li>
          <li>- Example: 1-9 units = $10, 10-49 units = $9, 50+ units = $8</li>
        </ul>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search products..." />
        <Select value={productFilter} onChange={(e) => setProductFilter(e.target.value)}>
          <option value="all">All Products</option>
          <option value="with_tiers">Products with Tiers</option>
        </Select>
      </div>

      <div className="mt-5 space-y-6">
        {filteredProducts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300/70 bg-slate-50/60 p-6 text-center text-sm text-slate-500">
            No products found.
          </div>
        ) : (
          filteredProducts.map((product) => {
            const tiers = (tiersByProduct.get(product.id) ?? []).sort((a, b) => a.minQty - b.minQty);
            return (
              <div key={product.id} className="border rounded-lg overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 flex justify-between items-center">
                  <div>
                    <h4 className="font-medium">{product.name}</h4>
                    <p className="text-sm text-slate-500">
                      Base Price: MMK {product.priceMmk.toLocaleString()} | Cost: MMK {(product.costMmk ?? 0).toLocaleString()}
                    </p>
                  </div>
                  {isAdmin && (
                    <Button size="sm" variant="secondary" onClick={() => openCreateModal(product.id)}>
                      Add Tier
                    </Button>
                  )}
                </div>

                {tiers.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-slate-500">
                        <th className="px-4 py-2 font-medium">Quantity Range</th>
                        <th className="px-4 py-2 font-medium">Price per Unit</th>
                        <th className="px-4 py-2 font-medium">Shop</th>
                        <th className="px-4 py-2 font-medium">Status</th>
                        <th className="px-4 py-2 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tiers.map((tier) => {
                        const shop = tier.shopId ? shops.find((s) => s.id === tier.shopId) : null;
                        const discount = ((product.priceMmk - tier.priceMmk) / product.priceMmk * 100).toFixed(1);
                        return (
                          <tr key={tier.id} className="border-b last:border-0">
                            <td className="px-4 py-2">
                              {tier.minQty} - {tier.maxQty ?? "unlimited"}
                            </td>
                            <td className="px-4 py-2">
                              <span className="font-medium">MMK {tier.priceMmk.toLocaleString()}</span>
                              {tier.priceMmk < product.priceMmk && (
                                <span className="ml-2 text-green-600 text-xs">(-{discount}%)</span>
                              )}
                            </td>
                            <td className="px-4 py-2">
                              {shop ? (
                                <Badge color="blue">{shop.name}</Badge>
                              ) : (
                                <Badge color="gray">All Shops</Badge>
                              )}
                            </td>
                            <td className="px-4 py-2">
                              <Badge color={tier.isActive ? "green" : "gray"}>
                                {tier.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex gap-2">
                                <Button size="sm" variant="ghost" onClick={() => openEditModal(tier)}>
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => toggleActive(tier)}
                                >
                                  {tier.isActive ? "Disable" : "Enable"}
                                </Button>
                                {isAdmin && (
                                  <Button size="sm" variant="danger" onClick={() => handleDelete(tier.id)}>
                                    Delete
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="px-4 py-3 text-sm text-slate-500">
                    No price tiers configured. Using base price for all quantities.
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Add/Edit Price Tier Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingTier ? "Edit Price Tier" : "Add Price Tier"}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Product <span className="text-red-500">*</span>
            </label>
            <Select
              value={form.productId}
              onChange={(e) => {
                const product = products.find((p) => p.id === e.target.value);
                setForm({ ...form, productId: e.target.value, priceMmk: product?.priceMmk ?? 0 });
              }}
              disabled={!!editingTier}
            >
              <option value="">Select product...</option>
              {products.filter((p) => p.isActive).map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} (Base: MMK {product.priceMmk.toLocaleString()})
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Shop (optional)</label>
            <Select
              value={form.shopId}
              onChange={(e) => setForm({ ...form, shopId: e.target.value })}
            >
              <option value="">All Shops (Global)</option>
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>{shop.name}</option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-slate-500">Leave empty to apply to all shops</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Min Quantity <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                value={form.minQty}
                onChange={(e) => setForm({ ...form, minQty: parseInt(e.target.value) || 1 })}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Max Quantity</label>
              <input
                type="number"
                min={form.minQty}
                value={form.maxQty}
                onChange={(e) => setForm({ ...form, maxQty: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="Unlimited"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Price per Unit (MMK) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="0"
              value={form.priceMmk}
              onChange={(e) => setForm({ ...form, priceMmk: parseInt(e.target.value) || 0 })}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
            {form.productId && (
              <p className="mt-1 text-xs text-slate-500">
                Base price: MMK {products.find((p) => p.id === form.productId)?.priceMmk.toLocaleString()}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editingTier ? "Update" : "Create"}</Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
};
