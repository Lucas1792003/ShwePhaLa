import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { useToast } from "../ui/Toast";
import { useDataStore } from "../../stores/dataStore";
import { mapSupplierFormError, validateSupplierInput } from "../../lib/supplierValidation";
import { useTranslation } from "../../hooks/useTranslation";
import { newId } from "../../lib/id";
import type { Supplier } from "../../types";

interface SupplierFormModalProps {
  open: boolean;
  onClose: () => void;
  // When set, the modal edits this supplier; when null it creates a new one.
  // Switching between values resets the form fields on the next open.
  editing: Supplier | null;
  // Existing suppliers — used to block duplicate codes before the round-trip.
  suppliers: Supplier[];
  // Used to default the next sequential SUP-### code on create.
  suggestedNewCode?: string;
}

interface FormState {
  code: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
}

const emptyForm: FormState = {
  code: "",
  name: "",
  contactPerson: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
};

export const SupplierFormModal = ({
  open,
  onClose,
  editing,
  suppliers,
  suggestedNewCode,
}: SupplierFormModalProps) => {
  const addSupplier = useDataStore((state) => state.addSupplier);
  const updateSupplier = useDataStore((state) => state.updateSupplier);
  const toast = useToast();
  const { t } = useTranslation();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Re-seed the form whenever the modal is opened or the editing target
  // changes. Cleared values prevent leaking the previous supplier's data
  // when the same modal is reused for a different row.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaving(false);
    if (editing) {
      setForm({
        code: editing.code,
        name: editing.name,
        contactPerson: editing.contactPerson ?? "",
        phone: editing.phone ?? "",
        email: editing.email ?? "",
        address: editing.address ?? "",
        notes: editing.notes ?? "",
      });
    } else {
      setForm({ ...emptyForm, code: suggestedNewCode ?? "" });
    }
  }, [open, editing, suggestedNewCode]);

  const requestClose = () => {
    if (saving) return;
    setError(null);
    onClose();
  };

  const handleSave = async () => {
    setError(null);
    const validationError = validateSupplierInput(
      { code: form.code, name: form.name },
      suppliers,
      editing?.id ?? null
    );
    if (validationError) {
      setError(validationError);
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      if (editing) {
        await updateSupplier({ ...editing, ...form });
        toast({ variant: "success", title: t("suppliers", "updated") });
      } else {
        await addSupplier({
          id: newId("supplier"),
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
        toast({ variant: "success", title: t("suppliers", "added") });
      }
      onClose();
    } catch (err) {
      // Keep the modal open and preserve values so the user can adjust.
      // Friendly mapping handles RLS, duplicate code, network.
      const message = mapSupplierFormError(err);
      setError(message);
      toast({ variant: "error", title: t("suppliers", "saveFailed"), description: message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={requestClose} title={editing ? t("suppliers", "editTitle") : t("suppliers", "addTitle")}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {t("suppliers", "code")} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              className="min-h-11 w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="SUP-001"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {t("common", "name")} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="min-h-11 w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="Supplier name"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t("suppliers", "contactPerson")}</label>
            <input
              type="text"
              value={form.contactPerson}
              onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
              className="min-h-11 w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="Contact name"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t("suppliers", "phone")}</label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="min-h-11 w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="09-xxxxxxxxx"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t("suppliers", "email")}</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="min-h-11 w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="email@example.com"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t("suppliers", "address")}</label>
          <input
            type="text"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className="min-h-11 w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="Full address"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t("suppliers", "notes")}</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="min-h-24 w-full rounded-lg border px-3 py-2 text-sm"
            rows={2}
            placeholder="Additional notes..."
          />
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-4">
          <Button variant="secondary" disabled={saving} onClick={requestClose}>
            {t("common", "cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving
              ? editing ? t("suppliers", "updating") : t("suppliers", "creating")
              : editing ? t("suppliers", "update") : t("suppliers", "create")}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
