import { useState } from "react";
import { useDataStore } from "../stores/dataStore";
import { PageHeader } from "../components/layout/PageHeader";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";

export const ShopsPage = () => {
  const shops = useDataStore((state) => state.shops);
  const addShop = useDataStore((state) => state.addShop);
  const updateShop = useDataStore((state) => state.updateShop);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setCode("");
    setAddress("");
  };

  const handleSubmit = () => {
    if (!name || !code) return;
    if (editingId) {
      const existingShop = shops.find((s) => s.id === editingId);
      updateShop({
        id: editingId,
        name,
        code,
        address,
        isActive: existingShop?.isActive ?? true,
        createdAt: existingShop?.createdAt ?? new Date().toISOString()
      });
    } else {
      addShop({ id: `shop-${Date.now()}`, name, code, address, isActive: true, createdAt: new Date().toISOString() });
    }
    resetForm();
  };

  const handleEdit = (id: string) => {
    const shop = shops.find((item) => item.id === id);
    if (!shop) return;
    setEditingId(id);
    setName(shop.name);
    setCode(shop.code);
    setAddress(shop.address);
  };

  return (
    <Card>
      <PageHeader title="Shops" subtitle="Create and edit shop profiles." />
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Shop name" />
          <Input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Shop code" />
          <Input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Address" />
          <div className="flex gap-2">
            <Button onClick={handleSubmit}>{editingId ? "Update" : "Create"}</Button>
            {editingId && (
              <Button variant="secondary" onClick={resetForm}>
                Cancel
              </Button>
            )}
          </div>
        </div>
        <div className="space-y-3">
          {shops.map((shop) => (
            <div key={shop.id} className="rounded-2xl border border-slate-200/70 bg-slate-50/60 p-4">
              <div className="font-semibold">{shop.name}</div>
              <div className="text-xs text-slate-500">{shop.code} - {shop.address}</div>
              <Button variant="secondary" className="mt-3" onClick={() => handleEdit(shop.id)}>
                Edit
              </Button>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
};
