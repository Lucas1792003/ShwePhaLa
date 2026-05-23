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
  const purchaseOrders = useDataStore((state) => state.purchaseOrders);
  const purchaseOrderItems = useDataStore((state) => state.purchaseOrderItems);
  const users = useDataStore((state) => state.users);

  const approvePurchaseOrder = useDataStore((state) => state.approvePurchaseOrder);
  const cancelPurchaseOrder = useDataStore((state) => state.cancelPurchaseOrder);
  const toast = useToast();

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
      toast({ title: "Purchase order approved", variant: "success" });
    } catch (error) {
      toast({
        title: "Approval failed",
        description: getErrorMessage(error, "Could not approve this purchase order."),
        variant: "error",
      });
    }
  };

  const handleCancelPO = async (poId: string) => {
    if (!currentUserId) return;
    if (!confirm("Are you sure you want to cancel this purchase order?")) return;
    try {
      await cancelPurchaseOrder({ purchaseOrderId: poId, actorId: currentUserId });
      toast({ title: "Purchase order canceled", variant: "success" });
    } catch (error) {
      toast({
        title: "Cancel failed",
        description: getErrorMessage(error, "Could not cancel this purchase order."),
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
        title="Purchase Orders"
        subtitle="Manage supplier purchases and stock-in"
        actions={
          canCreatePO && (
            <Button onClick={() => setShowCreateModal(true)}>New Purchase Order</Button>
          )
        }
      />

      <div className="mt-6">
        <Tabs
          tabs={[
            { id: "all", label: "All Orders" },
            { id: "pending", label: "Pending" },
            { id: "approved", label: "Ready to Receive" },
            { id: "received", label: "Received" },
          ]}
          active={activeTab}
          onChange={setActiveTab}
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by PO #" />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All Status</option>
          <option value="DRAFT">Draft</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="APPROVED">Approved</option>
          <option value="RECEIVED">Received</option>
          <option value="CANCELED">Canceled</option>
        </Select>
      </div>

      <div className="mt-5">
        {filteredOrders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300/70 bg-slate-50/60 p-6 text-center text-sm text-slate-500">
            No purchase orders found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="pb-3 font-medium">PO #</th>
                  <th className="pb-3 font-medium">Supplier</th>
                  <th className="pb-3 font-medium">Shop</th>
                  <th className="pb-3 font-medium">Items</th>
                  <th className="pb-3 font-medium">Total</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Created</th>
                  <th className="pb-3 font-medium">Actions</th>
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
                      <td className="py-3 font-medium">{po.orderNo}</td>
                      <td className="py-3">{supplier?.name ?? po.supplierId}</td>
                      <td className="py-3">{shop?.name ?? po.shopId}</td>
                      <td className="py-3">{items.length} items</td>
                      <td className="py-3 font-medium">MMK {po.totalMmk.toLocaleString()}</td>
                      <td className="py-3">
                        <Badge color={statusColors[po.status]}>{po.status}</Badge>
                      </td>
                      <td className="py-3">
                        <div>{formatDateTime(po.createdAt)}</div>
                        <div className="text-xs text-slate-500">by {createdByUser?.name ?? "Unknown"}</div>
                      </td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setShowDetailModal(po.id)}>
                            View
                          </Button>
                          {(po.status === "DRAFT" || po.status === "SUBMITTED") &&
                            canApprovePurchaseOrder(currentUser, po) && (
                              <Button size="sm" variant="primary" onClick={() => handleApprovePO(po.id)}>
                                Approve
                              </Button>
                            )}
                          {po.status === "APPROVED" && canReceivePurchaseOrder(currentUser, po) && (
                            <Button size="sm" variant="primary" onClick={() => setShowReceiveModal(po.id)}>
                              Receive
                            </Button>
                          )}
                          {po.status !== "RECEIVED" &&
                            po.status !== "CANCELED" &&
                            hasShopPermission(currentUser, "purchase:create", po.shopId) && (
                              <Button size="sm" variant="ghost" onClick={() => handleCancelPO(po.id)}>
                                Cancel
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
      />

      {/* PO Detail Modal */}
      <Modal
        open={!!showDetailModal}
        onClose={() => setShowDetailModal(null)}
        title={`Purchase Order - ${selectedPO?.orderNo}`}
      >
        {selectedPO && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-500">Supplier:</span>
                <span className="ml-2 font-medium">{suppliers.find((s) => s.id === selectedPO.supplierId)?.name}</span>
              </div>
              <div>
                <span className="text-slate-500">Shop:</span>
                <span className="ml-2 font-medium">{shops.find((s) => s.id === selectedPO.shopId)?.name}</span>
              </div>
              <div>
                <span className="text-slate-500">Status:</span>
                <span className="ml-2"><Badge color={statusColors[selectedPO.status]}>{selectedPO.status}</Badge></span>
              </div>
              <div>
                <span className="text-slate-500">Total:</span>
                <span className="ml-2 font-bold">MMK {selectedPO.totalMmk.toLocaleString()}</span>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">Items</h4>
              <table className="w-full text-sm border rounded-lg overflow-hidden">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-right">Ordered</th>
                    <th className="px-3 py-2 text-right">Received</th>
                    <th className="px-3 py-2 text-right">Unit Cost</th>
                    <th className="px-3 py-2 text-right">Total</th>
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

            <div className="flex justify-end pt-4">
              <Button variant="secondary" onClick={() => setShowDetailModal(null)}>Close</Button>
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
