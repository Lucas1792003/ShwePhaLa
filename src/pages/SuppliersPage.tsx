import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { useAppStore } from "../stores/appStore";
import { useDataStore } from "../stores/dataStore";
import { useToastStore } from "../stores/toastStore";
import { PageHeader } from "../components/layout/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { SearchInput } from "../components/forms/SearchInput";
import { SupplierFormModal } from "../components/suppliers/SupplierFormModal";
import { buildSupplierFinancialSummary } from "../features/suppliers/debt";
import { getDebtStatus } from "../features/suppliers/uiConstants";
import { formatMmk, getEffectiveShopId } from "../lib/utils";
import { getErrorMessage } from "../lib/errors";
import { hasAnyPermission, hasPermission } from "../lib/permissions";
import type { Supplier } from "../types";

export const SuppliersPage = () => {
  const navigate = useNavigate();
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentUser = useDataStore((state) => state.users.find((u) => u.id === currentUserId));
  const { currentShopId } = useAppStore();
  const shops = useDataStore((state) => state.shops);
  const suppliers = useDataStore((state) => state.suppliers);
  const purchaseOrders = useDataStore((state) => state.purchaseOrders);
  const updateSupplier = useDataStore((state) => state.updateSupplier);
  const addToast = useToastStore((state) => state.addToast);

  const [search, setSearch] = useState("");
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  const isAdmin = currentUser?.role === "ADMIN";
  const shopId = getEffectiveShopId(currentUser, currentShopId, shops);
  const canCreateSupplier = hasPermission(currentUser, "supplier:create");
  const canUpdateSupplier = hasPermission(currentUser, "supplier:update");
  const canViewDebt = hasAnyPermission(currentUser, ["supplier:debt_view", "purchase:view"]);

  // Scope debt totals to the manager's shop. Admin still sees cross-shop totals.
  const visiblePurchaseOrders = useMemo(
    () => purchaseOrders.filter((po) => isAdmin || po.shopId === shopId),
    [purchaseOrders, isAdmin, shopId]
  );

  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase()) ||
      (s.contactPerson ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const openCreateModal = () => {
    setEditingSupplier(null);
    setFormModalOpen(true);
  };

  const openEditModal = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormModalOpen(true);
  };

  const toggleActive = async (supplier: Supplier) => {
    try {
      await updateSupplier({ ...supplier, isActive: !supplier.isActive });
      addToast({
        variant: "success",
        title: supplier.isActive ? "Supplier deactivated" : "Supplier activated",
      });
    } catch (error) {
      addToast({
        variant: "error",
        title: "Update failed",
        description: getErrorMessage(error, "Failed to update supplier."),
      });
    }
  };

  const goToDetail = (supplier: Supplier) => navigate(`/app/suppliers/${supplier.id}`);

  // Suggested next sequential code when adding a supplier. The detail page
  // uses the same modal but only for edit, so this only matters here.
  const suggestedNewCode = `SUP-${String(suppliers.length + 1).padStart(3, "0")}`;

  return (
    <Card>
      <PageHeader
        title="Suppliers"
        subtitle="Click a supplier to open its full account workspace."
        actions={canCreateSupplier && <Button onClick={openCreateModal}>Add Supplier</Button>}
      />

      <div className="mt-5">
        <SearchInput value={search} onChange={setSearch} placeholder="Search suppliers..." />
      </div>

      <div className="mt-5">
        {filteredSuppliers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300/70 bg-slate-50/60 p-6 text-center text-sm text-slate-500">
            No suppliers found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1180px] w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="pb-3 font-medium">Code</th>
                  <th className="pb-3 font-medium">Name</th>
                  <th className="pb-3 font-medium">Contact</th>
                  <th className="pb-3 font-medium">Phone</th>
                  <th className="pb-3 text-right font-medium">Orders</th>
                  <th className="pb-3 text-right font-medium">Total Received Purchases</th>
                  <th className="pb-3 text-right font-medium">Paid</th>
                  <th className="pb-3 text-right font-medium">Outstanding Debt</th>
                  <th className="pb-3 font-medium">Debt Status</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.map((supplier) => {
                  const summary = buildSupplierFinancialSummary(supplier.id, visiblePurchaseOrders);
                  const debtStatus = getDebtStatus(summary.outstandingDebtMmk);
                  return (
                    <tr
                      key={supplier.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => goToDetail(supplier)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          goToDetail(supplier);
                        }
                      }}
                      className="cursor-pointer border-b last:border-0 hover:bg-slate-50/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    >
                      <td className="py-3 font-mono text-xs">{supplier.code}</td>
                      <td className="py-3 font-medium text-slate-900">{supplier.name}</td>
                      <td className="py-3">{supplier.contactPerson ?? "-"}</td>
                      <td className="py-3">{supplier.phone ?? "-"}</td>
                      <td className="py-3 text-right">{summary.orderCount}</td>
                      <td className="py-3 text-right">
                        {canViewDebt ? formatMmk(summary.totalReceivedPurchasesMmk) : "-"}
                      </td>
                      <td className="py-3 text-right">
                        {canViewDebt ? formatMmk(summary.totalPaidMmk) : "-"}
                      </td>
                      <td className="py-3 text-right font-semibold text-slate-900">
                        {canViewDebt ? formatMmk(summary.outstandingDebtMmk) : "-"}
                      </td>
                      <td className="py-3">
                        {canViewDebt ? (
                          <Badge color={debtStatus.color}>{debtStatus.label}</Badge>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-3">
                        <Badge color={supplier.isActive ? "green" : "gray"}>
                          {supplier.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="py-3" onClick={(event) => event.stopPropagation()}>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="ghost" onClick={() => goToDetail(supplier)}>
                            View details
                          </Button>
                          {canUpdateSupplier && (
                            <Button size="sm" variant="ghost" onClick={() => openEditModal(supplier)}>
                              Edit
                            </Button>
                          )}
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SupplierFormModal
        open={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        editing={editingSupplier}
        suggestedNewCode={suggestedNewCode}
      />
    </Card>
  );
};
