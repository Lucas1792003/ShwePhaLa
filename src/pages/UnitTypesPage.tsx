import { useMemo, useState } from "react";
import { useDataStore } from "../stores/dataStore";
import { useAuthStore } from "../stores/authStore";
import { PageHeader } from "../components/layout/PageHeader";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Badge } from "../components/ui/Badge";
import { Table, THead, TBody, TR, TH, TD } from "../components/ui/Table";
import type { UnitType } from "../types";
import {
  compareUnitTypes,
  validateUnitTypeForm,
} from "../features/unitTypes/unitTypeValidation";
import { newId } from "../lib/id";

interface FormState {
  name: string;
  abbreviation: string;
  description: string;
  sortOrder: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  abbreviation: "",
  description: "",
  sortOrder: "100",
};

export const UnitTypesPage = () => {
  const unitTypes = useDataStore((state) => state.unitTypes);
  const products = useDataStore((state) => state.products);
  const addUnitType = useDataStore((state) => state.addUnitType);
  const updateUnitType = useDataStore((state) => state.updateUnitType);
  const deactivateUnitType = useDataStore((state) => state.deactivateUnitType);
  const addAuditLog = useDataStore((state) => state.addAuditLog);
  const currentUserId = useAuthStore((state) => state.currentUserId);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<UnitType | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Sorted by sort_order then name (the same key the product dropdown uses).
  const sortedUnitTypes = useMemo(
    () => [...unitTypes].sort(compareUnitTypes),
    [unitTypes],
  );

  const filteredUnitTypes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedUnitTypes;
    return sortedUnitTypes.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        (u.abbreviation ?? "").toLowerCase().includes(q) ||
        (u.description ?? "").toLowerCase().includes(q),
    );
  }, [sortedUnitTypes, search]);

  // Per-unit usage count — drives the deactivate button label and the
  // post-deactivate warning. Counted by case-insensitive name match so
  // legacy products with values like "piece" still count toward "Piece".
  const usageByName = useMemo(() => {
    const map = new Map<string, number>();
    for (const product of products) {
      const key = (product.unitType ?? "").trim().toLowerCase();
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [products]);

  const openCreateModal = () => {
    setEditing(null);
    // Place new entries at the end of the current sort so admins can
    // re-order later without colliding with existing rows.
    const nextSort = sortedUnitTypes.length > 0
      ? Math.max(...sortedUnitTypes.map((u) => u.sortOrder)) + 10
      : 10;
    setForm({ ...EMPTY_FORM, sortOrder: String(nextSort) });
    setFormError(null);
    setShowModal(true);
  };

  const openEditModal = (unit: UnitType) => {
    setEditing(unit);
    setForm({
      name: unit.name,
      abbreviation: unit.abbreviation ?? "",
      description: unit.description ?? "",
      sortOrder: String(unit.sortOrder),
    });
    setFormError(null);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  const handleSave = () => {
    const error = validateUnitTypeForm(
      {
        name: form.name,
        abbreviation: form.abbreviation,
        description: form.description,
      },
      unitTypes,
      editing?.id ?? null,
    );
    if (error) {
      setFormError(error.message);
      return;
    }

    const parsedSort = Number.parseInt(form.sortOrder, 10);
    const sortOrder = Number.isFinite(parsedSort) ? parsedSort : 0;
    const now = new Date().toISOString();

    if (editing) {
      const next: UnitType = {
        ...editing,
        name: form.name.trim(),
        abbreviation: form.abbreviation.trim() || undefined,
        description: form.description.trim() || undefined,
        sortOrder,
        updatedAt: now,
      };
      updateUnitType(next);
      void addAuditLog({
        id: newId("audit"),
        actorId: currentUserId ?? "system",
        actionType: "CATEGORY_EDIT",
        message: `Updated unit type "${next.name}".`,
        entityType: "UnitType",
        entityId: next.id,
        createdAt: now,
      });
    } else {
      const created: UnitType = {
        id: newId("ut"),
        name: form.name.trim(),
        abbreviation: form.abbreviation.trim() || undefined,
        description: form.description.trim() || undefined,
        isActive: true,
        sortOrder,
        createdAt: now,
        updatedAt: now,
      };
      addUnitType(created);
      void addAuditLog({
        id: newId("audit"),
        actorId: currentUserId ?? "system",
        actionType: "CATEGORY_CREATE",
        message: `Created unit type "${created.name}".`,
        entityType: "UnitType",
        entityId: created.id,
        createdAt: now,
      });
    }

    closeModal();
  };

  const handleDeactivate = (unit: UnitType) => {
    const usage = usageByName.get(unit.name.trim().toLowerCase()) ?? 0;
    const tail = usage > 0
      ? `\n\n${usage} product(s) still reference this unit. They will keep showing "${unit.name}" but it will no longer appear in the picker for new products.`
      : "";
    if (!confirm(`Deactivate "${unit.name}"?${tail}`)) return;

    deactivateUnitType(unit.id);
    void addAuditLog({
      id: newId("audit"),
      actorId: currentUserId ?? "system",
      actionType: "CATEGORY_DELETE",
      message: `Deactivated unit type "${unit.name}".`,
      entityType: "UnitType",
      entityId: unit.id,
      createdAt: new Date().toISOString(),
    });
  };

  const handleReactivate = (unit: UnitType) => {
    const now = new Date().toISOString();
    updateUnitType({ ...unit, isActive: true, updatedAt: now });
    void addAuditLog({
      id: newId("audit"),
      actorId: currentUserId ?? "system",
      actionType: "CATEGORY_EDIT",
      message: `Reactivated unit type "${unit.name}".`,
      entityType: "UnitType",
      entityId: unit.id,
      createdAt: now,
    });
  };

  return (
    <Card>
      <PageHeader
        title="Unit Types"
        subtitle="The base stock unit per product (Piece, Can, Sachet, Kilogram, ...). The Product form pulls its dropdown from this list."
        actions={
          <Button onClick={openCreateModal}>
            <span className="material-symbols-rounded mr-1 text-sm">add</span>
            Add Unit Type
          </Button>
        }
      />

      <div className="mt-4 max-w-sm">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or abbreviation..."
        />
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200/70">
        <Table className="min-w-[760px]">
          <THead>
            <TR>
              <TH className="w-20 text-right">Order</TH>
              <TH>Name</TH>
              <TH>Abbreviation</TH>
              <TH>Description</TH>
              <TH className="text-right">Products</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {filteredUnitTypes.length === 0 ? (
              <TR>
                <TD colSpan={7} className="py-8 text-center text-slate-500">
                  {unitTypes.length === 0
                    ? "No unit types yet. Click Add Unit Type to create one."
                    : "No unit types match this search."}
                </TD>
              </TR>
            ) : (
              filteredUnitTypes.map((unit) => {
                const usage = usageByName.get(unit.name.trim().toLowerCase()) ?? 0;
                return (
                  <TR key={unit.id} className={unit.isActive ? undefined : "bg-slate-50/70 opacity-70"}>
                    <TD className="text-right font-mono text-xs text-slate-500">{unit.sortOrder}</TD>
                    <TD className="font-medium text-slate-800">{unit.name}</TD>
                    <TD className="font-mono text-xs text-slate-600">
                      {unit.abbreviation ?? <span className="text-slate-400">-</span>}
                    </TD>
                    <TD className="text-sm text-slate-600">
                      {unit.description ?? <span className="text-slate-400">-</span>}
                    </TD>
                    <TD className="text-right text-sm text-slate-600">{usage}</TD>
                    <TD>
                      <Badge tone={unit.isActive ? "green" : "slate"}>
                        {unit.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TD>
                    <TD className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEditModal(unit)}>
                          <span className="material-symbols-rounded text-sm">edit</span>
                        </Button>
                        {unit.isActive ? (
                          <Button variant="ghost" size="sm" onClick={() => handleDeactivate(unit)}>
                            <span className="material-symbols-rounded text-sm text-red-500">
                              visibility_off
                            </span>
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => handleReactivate(unit)}>
                            <span className="material-symbols-rounded text-sm text-emerald-600">
                              visibility
                            </span>
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                );
              })
            )}
          </TBody>
        </Table>
      </div>

      <Modal
        open={showModal}
        onClose={closeModal}
        title={editing ? "Edit Unit Type" : "Add Unit Type"}
        description="Unit type is the base stock unit for a product."
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Name *</label>
            <Input
              placeholder="e.g. Piece, Can, Sachet, Kilogram"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Abbreviation</label>
              <Input
                placeholder="e.g. pc, can, kg"
                value={form.abbreviation}
                onChange={(e) => setForm({ ...form, abbreviation: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Sort order</label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="100"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
            <Input
              placeholder="Optional — short note shown nowhere yet, reserved for the future."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          {formError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {formError}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={closeModal}>
              Cancel
            </Button>
            <Button onClick={handleSave}>{editing ? "Update" : "Create"}</Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
};
