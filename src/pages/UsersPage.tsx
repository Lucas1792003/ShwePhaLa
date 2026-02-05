import { useState } from "react";
import { useDataStore } from "../stores/dataStore";
import type { Role } from "../types";
import { PageHeader } from "../components/layout/PageHeader";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Button } from "../components/ui/Button";

export const UsersPage = () => {
  const users = useDataStore((state) => state.users);
  const shops = useDataStore((state) => state.shops);
  const addUser = useDataStore((state) => state.addUser);
  const updateUser = useDataStore((state) => state.updateUser);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("CASHIER");
  const [shopId, setShopId] = useState<string | undefined>(undefined);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setRole("CASHIER");
    setShopId(undefined);
  };

  const handleSubmit = () => {
    if (!name) return;
    const existingUser = editingId ? users.find((u) => u.id === editingId) : null;
    const payload = {
      id: editingId ?? `user-${Date.now()}`,
      name,
      role,
      shopId: role === "ADMIN" || role === "BUYER" ? undefined : shopId,
      isActive: existingUser?.isActive ?? true,
      createdAt: existingUser?.createdAt ?? new Date().toISOString(),
    };
    if (editingId) updateUser(payload);
    else addUser(payload);
    resetForm();
  };

  const handleEdit = (id: string) => {
    const user = users.find((item) => item.id === id);
    if (!user) return;
    setEditingId(id);
    setName(user.name);
    setRole(user.role);
    setShopId(user.shopId);
  };

  return (
    <Card>
      <PageHeader title="Users" subtitle="Create mock users and assign roles." />
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="User name" />
          <Select value={role} onChange={(event) => setRole(event.target.value as Role)}>
            <option value="ADMIN">Admin</option>
            <option value="MANAGER">Manager</option>
            <option value="CASHIER">Cashier</option>
            <option value="BUYER">Buyer</option>
          </Select>
          <Select value={shopId ?? ""} onChange={(event) => setShopId(event.target.value || undefined)}>
            <option value="">No shop</option>
            {shops.map((shop) => (
              <option key={shop.id} value={shop.id}>{shop.name}</option>
            ))}
          </Select>
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
          {users.map((user) => (
            <div key={user.id} className="rounded-2xl border border-slate-200/70 bg-slate-50/60 p-4">
              <div className="font-semibold">{user.name}</div>
              <div className="text-xs text-slate-500">{user.role} {user.shopId ? `- ${shops.find((shop) => shop.id === user.shopId)?.name}` : ""}</div>
              <Button variant="secondary" className="mt-3" onClick={() => handleEdit(user.id)}>Edit</Button>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
};
