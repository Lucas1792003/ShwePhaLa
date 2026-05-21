import { useState } from "react";
import { useAuthStore } from "../stores/authStore";
import { useDataStore } from "../stores/dataStore";
import { PageHeader } from "../components/layout/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { SearchInput } from "../components/forms/SearchInput";
import type { Supplier } from "../types";

export const SuppliersPage = () => {
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentUser = useDataStore((state) => state.users.find((u) => u.id === currentUserId));
  const suppliers = useDataStore((state) => state.suppliers);
  const purchaseOrders = useDataStore((state) => state.purchaseOrders);
  const addSupplier = useDataStore((state) => state.addSupplier);
  const updateSupplier = useDataStore((state) => state.updateSupplier);

  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [form, setForm] = useState({
    code: "",
    name: "",
    contactPerson: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });

  const isAdmin = currentUser?.role === "ADMIN";

  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase())
  );

  const openCreateModal = () => {
    setEditingSupplier(null);
    setForm({
      code: `SUP-${String(suppliers.length + 1).padStart(3, "0")}`,
      name: "",
      contactPerson: "",
      phone: "",
      email: "",
      address: "",
      notes: "",
    });
    setShowModal(true);
  };

  const openEditModal = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setForm({
      code: supplier.code,
      name: supplier.name,
      contactPerson: supplier.contactPerson ?? "",
      phone: supplier.phone ?? "",
      email: supplier.email ?? "",
      address: supplier.address ?? "",
      notes: supplier.notes ?? "",
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.code.trim()) {
      alert("Code and Name are required");
      return;
    }

    try {
      if (editingSupplier) {
        await updateSupplier({
          ...editingSupplier,
          ...form,
        });
      } else {
        await addSupplier({
          id: `supplier-${Date.now()}`,
          code: form.code,
          name: form.name,
          contactPerson: form.contactPerson || undefined,
          phone: form.phone || undefined,
          email: form.email || undefined,
          address: form.address || undefined,
          notes: form.notes || undefined,
          isActive: true,
          createdAt: new Date().toISOString(),
        });
      }
      setShowModal(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to save supplier");
    }
  };

  const toggleActive = async (supplier: Supplier) => {
    try {
      await updateSupplier({ ...supplier, isActive: !supplier.isActive });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to update supplier");
    }
  };

  const getOrderCount = (supplierId: string) => {
    return purchaseOrders.filter((po) => po.supplierId === supplierId).length;
  };

  const getTotalPurchases = (supplierId: string) => {
    return purchaseOrders
      .filter((po) => po.supplierId === supplierId && po.status === "RECEIVED")
      .reduce((sum, po) => sum + po.totalMmk, 0);
  };

  return (
    <Card>
      <PageHeader
        title="Suppliers"
        subtitle="Manage your product suppliers"
        actions={
          isAdmin && (
            <Button onClick={openCreateModal}>Add Supplier</Button>
          )
        }
      />

      <div className="mt-5">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search suppliers..."
        />
      </div>

      <div className="mt-5">
        {filteredSuppliers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300/70 bg-slate-50/60 p-6 text-center text-sm text-slate-500">
            No suppliers found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="pb-3 font-medium">Code</th>
                  <th className="pb-3 font-medium">Name</th>
                  <th className="pb-3 font-medium">Contact</th>
                  <th className="pb-3 font-medium">Phone</th>
                  <th className="pb-3 font-medium">Orders</th>
                  <th className="pb-3 font-medium">Total Purchases</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.map((supplier) => (
                  <tr key={supplier.id} className="border-b last:border-0">
                    <td className="py-3 font-mono text-xs">{supplier.code}</td>
                    <td className="py-3 font-medium">{supplier.name}</td>
                    <td className="py-3">{supplier.contactPerson ?? "-"}</td>
                    <td className="py-3">{supplier.phone ?? "-"}</td>
                    <td className="py-3">{getOrderCount(supplier.id)}</td>
                    <td className="py-3">MMK {getTotalPurchases(supplier.id).toLocaleString()}</td>
                    <td className="py-3">
                      <Badge color={supplier.isActive ? "green" : "gray"}>
                        {supplier.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => openEditModal(supplier)}>
                          Edit
                        </Button>
                        {isAdmin && (
                          <Button
                            size="sm"
                            variant={supplier.isActive ? "danger" : "primary"}
                            onClick={() => toggleActive(supplier)}
                          >
                            {supplier.isActive ? "Deactivate" : "Activate"}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Supplier Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingSupplier ? "Edit Supplier" : "Add Supplier"}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="SUP-001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="Supplier name"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Contact Person</label>
              <input
                type="text"
                value={form.contactPerson}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="Contact name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="09-xxxxxxxxx"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="email@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="Full address"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              rows={2}
              placeholder="Additional notes..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              {editingSupplier ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
};
