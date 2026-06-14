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
import { nextSupplierCode } from "../lib/supplierValidation";
import { formatMmk, getEffectiveShopId } from "../lib/utils";
import { getErrorMessage } from "../lib/errors";
import { hasAnyPermission, hasPermission } from "../lib/permissions";
import { useTranslation } from "../hooks/useTranslation";
import type { Supplier } from "../types";

export const SuppliersPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
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

  // Precompute each supplier's financial summary in one pass (group POs by
  // supplier once) instead of re-filtering all POs per row — O(N+M) not O(N×M).
  const summaryBySupplier = useMemo(() => {
    const posBySupplier = new Map<string, typeof visiblePurchaseOrders>();
    for (const po of visiblePurchaseOrders) {
      const list = posBySupplier.get(po.supplierId);
      if (list) list.push(po);
      else posBySupplier.set(po.supplierId, [po]);
    }
    const map = new Map<string, ReturnType<typeof buildSupplierFinancialSummary>>();
    for (const supplier of suppliers) {
      map.set(supplier.id, buildSupplierFinancialSummary(supplier.id, posBySupplier.get(supplier.id) ?? []));
    }
    return map;
  }, [suppliers, visiblePurchaseOrders]);

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
        title: supplier.isActive ? t("suppliers", "deactivated") : t("suppliers", "activated"),
      });
    } catch (error) {
      addToast({
        variant: "error",
        title: t("suppliers", "updateFailed"),
        description: getErrorMessage(error, t("suppliers", "updateFailedDesc")),
      });
    }
  };

  const goToDetail = (supplier: Supplier) => navigate(`/app/suppliers/${supplier.id}`);

  // Suggested next sequential code when adding a supplier. Derived from the
  // highest existing SUP-### so it never collides after a deactivation. The
  // detail page uses the same modal but only for edit, so this only matters here.
  const suggestedNewCode = nextSupplierCode(suppliers);

  return (
    <Card>
      <PageHeader
        title={t("suppliers", "title")}
        subtitle={t("suppliers", "subtitle")}
        actions={canCreateSupplier && <Button onClick={openCreateModal}>{t("suppliers", "addSupplier")}</Button>}
      />

      <div className="mt-5">
        <SearchInput value={search} onChange={setSearch} placeholder={t("suppliers", "searchPlaceholder")} className="md:max-w-md" />
      </div>

      <div className="mt-5">
        {filteredSuppliers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300/70 bg-slate-50/60 p-6 text-center text-sm text-slate-500">
            {t("suppliers", "none")}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200/70 bg-white">
            <table className="min-w-[1180px] w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="pb-3 font-medium">{t("suppliers", "code")}</th>
                  <th className="pb-3 font-medium">{t("common", "name")}</th>
                  <th className="pb-3 font-medium">{t("suppliers", "contact")}</th>
                  <th className="pb-3 font-medium">{t("suppliers", "phone")}</th>
                  <th className="pb-3 text-right font-medium">{t("suppliers", "orders")}</th>
                  <th className="pb-3 text-right font-medium">{t("suppliers", "totalReceived")}</th>
                  <th className="pb-3 text-right font-medium">{t("suppliers", "paid")}</th>
                  <th className="pb-3 text-right font-medium">{t("suppliers", "outstandingDebt")}</th>
                  <th className="pb-3 font-medium">{t("suppliers", "debtStatus")}</th>
                  <th className="pb-3 font-medium">{t("common", "status")}</th>
                  <th className="pb-3 font-medium">{t("common", "actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.map((supplier) => {
                  const summary = summaryBySupplier.get(supplier.id)
                    ?? buildSupplierFinancialSummary(supplier.id, visiblePurchaseOrders);
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
                          <Badge color={debtStatus.color}>
                            {summary.outstandingDebtMmk > 0 ? t("suppliers", "unpaid") : t("suppliers", "noDebt")}
                          </Badge>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-3">
                        <Badge color={supplier.isActive ? "green" : "gray"}>
                          {supplier.isActive ? t("common", "active") : t("common", "inactive")}
                        </Badge>
                      </td>
                      <td className="py-3" onClick={(event) => event.stopPropagation()}>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="ghost" onClick={() => goToDetail(supplier)}>
                            {t("suppliers", "viewDetails")}
                          </Button>
                          {canUpdateSupplier && (
                            <Button size="sm" variant="ghost" onClick={() => openEditModal(supplier)}>
                              {t("common", "edit")}
                            </Button>
                          )}
                          {isAdmin && (
                            <Button
                              size="sm"
                              variant={supplier.isActive ? "danger" : "primary"}
                              onClick={() => toggleActive(supplier)}
                            >
                              {supplier.isActive ? t("suppliers", "deactivate") : t("suppliers", "activate")}
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
        suppliers={suppliers}
        suggestedNewCode={suggestedNewCode}
      />
    </Card>
  );
};
