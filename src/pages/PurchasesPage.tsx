import { useMemo, useState } from "react";
import { useAuthStore } from "../stores/authStore";
import { useAppStore } from "../stores/appStore";
import { useDataStore } from "../stores/dataStore";
import { PageHeader } from "../components/layout/PageHeader";
import { Card } from "../components/ui/Card";
import { Tabs } from "../components/ui/Tabs";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { Select } from "../components/ui/Select";
import { useToast } from "../components/ui/Toast";
import { SearchInput } from "../components/forms/SearchInput";
import { PurchaseOrderCreateModal } from "../components/purchases/PurchaseOrderCreateModal";
import { PurchaseOrderReceiveModal } from "../components/purchases/PurchaseOrderReceiveModal";
import { formatDateTime, getEffectiveShopId } from "../lib/utils";
import { getErrorMessage } from "../lib/errors";
import {
  canApprovePurchaseOrder,
  canReceivePurchaseOrder,
  hasPermission,
  hasShopPermission,
} from "../lib/permissions";
import { useTranslation } from "../hooks/useTranslation";
import type { PurchaseOrderStatus } from "../types";

const statusColors: Record<PurchaseOrderStatus, "gray" | "yellow" | "green" | "blue" | "red"> = {
  DRAFT: "gray",
  SUBMITTED: "yellow",
  APPROVED: "blue",
  RECEIVED: "green",
  CANCELED: "red",
};

export const PurchasesPage = () => {
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentUser = useDataStore((state) => state.users.find((u) => u.id === currentUserId));
  const { currentShopId } = useAppStore();
  const shops = useDataStore((state) => state.shops);
  const products = useDataStore((state) => state.products);
  const suppliers = useDataStore((state) => state.suppliers);
  const supplierProducts = useDataStore((state) => state.supplierProducts);
  const purchaseOrders = useDataStore((state) => state.purchaseOrders);
  const purchaseOrderItems = useDataStore((state) => state.purchaseOrderItems);
  const users = useDataStore((state) => state.users);

  const approvePurchaseOrder = useDataStore((state) => state.approvePurchaseOrder);
  const cancelPurchaseOrder = useDataStore((state) => state.cancelPurchaseOrder);
  const toast = useToast();
  const { t } = useTranslation();
  const statusLabels: Record<PurchaseOrderStatus, string> = {
    DRAFT: t("purchases", "draft"),
    SUBMITTED: t("purchases", "submitted"),
    APPROVED: t("purchases", "approved"),
    RECEIVED: t("purchases", "received"),
    CANCELED: t("purchases", "canceled"),
  };

  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState<string | null>(null);
  const [showReceiveModal, setShowReceiveModal] = useState<string | null>(null);

  const shopId = getEffectiveShopId(currentUser, currentShopId, shops);
  const isAdmin = currentUser?.role === "ADMIN";
  // Creating a PO is permission-gated (managers, admins and buyers) rather
  // than role-gated, so the limited BUYER role can raise purchase orders.
  const canCreatePO = hasPermission(currentUser, "purchase:create");

  const filteredOrders = useMemo(() => {
    return purchaseOrders
      .filter((po) => po.shopId === shopId || isAdmin)
      .filter((po) => {
        if (activeTab === "pending") return po.status === "DRAFT" || po.status === "SUBMITTED";
        if (activeTab === "approved") return po.status === "APPROVED";
        if (activeTab === "received") return po.status === "RECEIVED";
        return true;
      })
      .filter((po) => statusFilter === "all" || po.status === statusFilter)
      .filter((po) => po.orderNo.toLowerCase().includes(search.toLowerCase()));
  }, [purchaseOrders, activeTab, statusFilter, search, shopId, isAdmin]);

  const handleApprovePO = async (poId: string) => {
    if (!currentUserId) return;
    try {
      await approvePurchaseOrder({ purchaseOrderId: poId, approverId: currentUserId });
      toast({ title: t("purchases", "approvedToast"), variant: "success" });
    } catch (error) {
      toast({
        title: t("purchases", "approvalFailed"),
        description: getErrorMessage(error, t("purchases", "approvalFailedDesc")),
        variant: "error",
      });
    }
  };

  const handleCancelPO = async (poId: string) => {
    if (!currentUserId) return;
    if (!confirm(t("purchases", "confirmCancel"))) return;
    try {
      await cancelPurchaseOrder({ purchaseOrderId: poId, actorId: currentUserId });
      toast({ title: t("purchases", "canceledToast"), variant: "success" });
    } catch (error) {
      toast({
        title: t("purchases", "cancelFailed"),
        description: getErrorMessage(error, t("purchases", "cancelFailedDesc")),
        variant: "error",
      });
    }
  };

  const selectedPO = showDetailModal ? purchaseOrders.find((po) => po.id === showDetailModal) : null;
  const selectedPOItems = showDetailModal
    ? purchaseOrderItems.filter((i) => i.purchaseOrderId === showDetailModal)
    : [];

  return (
    <Card>
      <PageHeader
        title={t("purchases", "title")}
        subtitle={t("purchases", "subtitle")}
        actions={
          canCreatePO && (
            <Button onClick={() => setShowCreateModal(true)}>{t("purchases", "newPo")}</Button>
          )
        }
      />

      <div className="mt-6">
        <Tabs
          tabs={[
            { id: "all", label: t("purchases", "tabAll") },
            { id: "pending", label: t("purchases", "tabPending") },
            { id: "approved", label: t("purchases", "tabReady") },
            { id: "received", label: t("purchases", "tabReceived") },
          ]}
          active={activeTab}
          onChange={setActiveTab}
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder={t("purchases", "searchPo")} className="min-w-64 flex-1 md:w-72 md:flex-none" />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="min-w-44 flex-1 md:w-auto md:flex-none">
          <option value="all">{t("purchases", "allStatus")}</option>
          <option value="DRAFT">{t("purchases", "draft")}</option>
          <option value="SUBMITTED">{t("purchases", "submitted")}</option>
          <option value="APPROVED">{t("purchases", "approved")}</option>
          <option value="RECEIVED">{t("purchases", "received")}</option>
          <option value="CANCELED">{t("purchases", "canceled")}</option>
        </Select>
      </div>

      <div className="mt-5">
        {filteredOrders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300/70 bg-slate-50/60 p-6 text-center text-sm text-slate-500">
            {t("purchases", "none")}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200/70 bg-white">
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="px-3 py-3 font-medium">{t("purchases", "poNo")}</th>
                  <th className="px-3 py-3 font-medium">{t("purchases", "supplier")}</th>
                  <th className="px-3 py-3 font-medium">{t("purchases", "shop")}</th>
                  <th className="px-3 py-3 font-medium">{t("purchases", "items")}</th>
                  <th className="px-3 py-3 font-medium">{t("purchases", "total")}</th>
                  <th className="px-3 py-3 font-medium">{t("common", "status")}</th>
                  <th className="px-3 py-3 font-medium">{t("purchases", "created")}</th>
                  <th className="px-3 py-3 font-medium">{t("common", "actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((po) => {
                  const supplier = suppliers.find((s) => s.id === po.supplierId);
                  const shop = shops.find((s) => s.id === po.shopId);
                  const items = purchaseOrderItems.filter((i) => i.purchaseOrderId === po.id);
                  const createdByUser = users.find((u) => u.id === po.createdBy);

                  return (
                    <tr key={po.id} className="border-b last:border-0">
                      <td className="px-3 py-3 font-medium">{po.orderNo}</td>
                      <td className="px-3 py-3">{supplier?.name ?? po.supplierId}</td>
                      <td className="px-3 py-3">{shop?.name ?? po.shopId}</td>
                      <td className="px-3 py-3">{items.length} {t("purchases", "itemsSuffix")}</td>
                      <td className="px-3 py-3 font-medium">MMK {po.totalMmk.toLocaleString()}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge color={statusColors[po.status]}>{statusLabels[po.status]}</Badge>
                          {po.pendingSync && <Badge tone="amber">Pending sync</Badge>}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div>{formatDateTime(po.createdAt)}</div>
                        <div className="text-xs text-slate-500">{t("purchases", "by")} {createdByUser?.name ?? t("purchases", "unknown")}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setShowDetailModal(po.id)}>
                            {t("purchases", "view")}
                          </Button>
                          {(po.status === "DRAFT" || po.status === "SUBMITTED") &&
                            canApprovePurchaseOrder(currentUser, po) && (
                              <Button size="sm" variant="primary" onClick={() => handleApprovePO(po.id)}>
                                {t("purchases", "approve")}
                              </Button>
                            )}
                          {po.status === "APPROVED" && canReceivePurchaseOrder(currentUser, po) && (
                            <Button size="sm" variant="primary" onClick={() => setShowReceiveModal(po.id)}>
                              {t("purchases", "receive")}
                            </Button>
                          )}
                          {po.status !== "RECEIVED" &&
                            po.status !== "CANCELED" &&
                            hasShopPermission(currentUser, "purchase:create", po.shopId) && (
                              <Button size="sm" variant="ghost" onClick={() => handleCancelPO(po.id)}>
                                {t("purchases", "cancel")}
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

      <PurchaseOrderCreateModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        shopId={shopId}
        currentUserId={currentUserId}
        suppliers={suppliers}
        products={products}
        supplierProducts={supplierProducts}
      />

      {/* PO Detail Modal */}
      <Modal
        open={!!showDetailModal}
        onClose={() => setShowDetailModal(null)}
        title={`${t("purchases", "detailTitle")} - ${selectedPO?.orderNo}`}
        size="lg"
      >
        {selectedPO && (
          <div className="space-y-4">
            <div className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <span className="text-slate-500">{t("purchases", "supplier")}:</span>
                <span className="ml-2 font-medium">{suppliers.find((s) => s.id === selectedPO.supplierId)?.name}</span>
              </div>
              <div>
                <span className="text-slate-500">{t("purchases", "shop")}:</span>
                <span className="ml-2 font-medium">{shops.find((s) => s.id === selectedPO.shopId)?.name}</span>
              </div>
              <div>
                <span className="text-slate-500">{t("common", "status")}:</span>
                <span className="ml-2"><Badge color={statusColors[selectedPO.status]}>{statusLabels[selectedPO.status]}</Badge></span>
              </div>
              <div>
                <span className="text-slate-500">{t("purchases", "total")}:</span>
                <span className="ml-2 font-bold">MMK {selectedPO.totalMmk.toLocaleString()}</span>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">{t("purchases", "items")}</h4>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left">{t("purchases", "product")}</th>
                      <th className="px-3 py-2 text-right">{t("purchases", "ordered")}</th>
                      <th className="px-3 py-2 text-right">{t("purchases", "receivedCol")}</th>
                      <th className="px-3 py-2 text-right">{t("purchases", "unitCost")}</th>
                      <th className="px-3 py-2 text-right">{t("purchases", "total")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPOItems.map((item) => {
                      const product = products.find((p) => p.id === item.productId);
                      return (
                        <tr key={item.id} className="border-t">
                          <td className="px-3 py-2">{product?.name}</td>
                          <td className="px-3 py-2 text-right">{item.orderedQty}</td>
                          <td className="px-3 py-2 text-right">{item.receivedQty ?? "-"}</td>
                          <td className="px-3 py-2 text-right">MMK {item.unitCostMmk.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">MMK {item.lineTotalMmk.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-4">
              <Button variant="secondary" onClick={() => setShowDetailModal(null)}>{t("common", "close")}</Button>
            </div>
          </div>
        )}
      </Modal>

      <PurchaseOrderReceiveModal
        purchaseOrderId={showReceiveModal}
        onClose={() => setShowReceiveModal(null)}
        currentUserId={currentUserId}
      />
    </Card>
  );
};
