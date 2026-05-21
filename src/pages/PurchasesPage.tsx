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
import { SearchInput } from "../components/forms/SearchInput";
import { formatDateTime, getEffectiveShopId } from "../lib/utils";
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

  const createPurchaseOrder = useDataStore((state) => state.createPurchaseOrder);
  const approvePurchaseOrder = useDataStore((state) => state.approvePurchaseOrder);
  const receivePurchaseOrder = useDataStore((state) => state.receivePurchaseOrder);
  const cancelPurchaseOrder = useDataStore((state) => state.cancelPurchaseOrder);

  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState<string | null>(null);
  const [showReceiveModal, setShowReceiveModal] = useState<string | null>(null);

  // Create PO form state
  const [newPO, setNewPO] = useState({
    supplierId: "",
    items: [] as { productId: string; orderedQty: number; unitCostMmk: number }[],
    notes: "",
  });

  // Receive PO form state
  const [receiveItems, setReceiveItems] = useState<{ productId: string; receivedQty: number }[]>([]);

  const shopId = getEffectiveShopId(currentUser, currentShopId, shops);
  const isAdmin = currentUser?.role === "ADMIN";
  const isManager = currentUser?.role === "MANAGER" || isAdmin;

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

  const handleCreatePO = async () => {
    if (!currentUserId || !newPO.supplierId || newPO.items.length === 0) return;
    try {
      await createPurchaseOrder({
        shopId,
        supplierId: newPO.supplierId,
        items: newPO.items,
        notes: newPO.notes,
        createdBy: currentUserId,
      });
      setShowCreateModal(false);
      setNewPO({ supplierId: "", items: [], notes: "" });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to create purchase order");
    }
  };

  const handleApprovePO = async (poId: string) => {
    if (!currentUserId) return;
    try {
      await approvePurchaseOrder({ purchaseOrderId: poId, approverId: currentUserId });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to approve purchase order");
    }
  };

  const handleCancelPO = async (poId: string) => {
    if (!currentUserId) return;
    if (!confirm("Are you sure you want to cancel this purchase order?")) return;
    try {
      await cancelPurchaseOrder({ purchaseOrderId: poId, actorId: currentUserId });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to cancel purchase order");
    }
  };

  const openReceiveModal = (poId: string) => {
    const items = purchaseOrderItems.filter((i) => i.purchaseOrderId === poId);
    setReceiveItems(items.map((i) => ({ productId: i.productId, receivedQty: i.orderedQty })));
    setShowReceiveModal(poId);
  };

  const handleReceivePO = async () => {
    if (!currentUserId || !showReceiveModal) return;
    try {
      await receivePurchaseOrder({
        purchaseOrderId: showReceiveModal,
        receiverId: currentUserId,
        receivedItems: receiveItems,
      });
      setShowReceiveModal(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to receive purchase order");
    }
  };

  const addItemToPO = (productId: string) => {
    if (newPO.items.some((i) => i.productId === productId)) return;
    const product = products.find((p) => p.id === productId);
    setNewPO((prev) => ({
      ...prev,
      items: [...prev.items, { productId, orderedQty: 1, unitCostMmk: product?.costMmk ?? 0 }],
    }));
  };

  const updatePOItem = (productId: string, field: "orderedQty" | "unitCostMmk", value: number) => {
    setNewPO((prev) => ({
      ...prev,
      items: prev.items.map((i) =>
        i.productId === productId ? { ...i, [field]: Math.max(field === "orderedQty" ? 1 : 0, value) } : i
      ),
    }));
  };

  const removeItemFromPO = (productId: string) => {
    setNewPO((prev) => ({
      ...prev,
      items: prev.items.filter((i) => i.productId !== productId),
    }));
  };

  const calculateTotal = () => {
    return newPO.items.reduce((sum, i) => sum + i.orderedQty * i.unitCostMmk, 0);
  };

  const selectedPO = showDetailModal ? purchaseOrders.find((po) => po.id === showDetailModal) : null;
  const selectedPOItems = showDetailModal
    ? purchaseOrderItems.filter((i) => i.purchaseOrderId === showDetailModal)
    : [];

  const activeSuppliers = suppliers.filter((s) => s.isActive);

  return (
    <Card>
      <PageHeader
        title="Purchase Orders"
        subtitle="Manage supplier purchases and stock-in"
        actions={
          isManager && (
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
                          {(po.status === "DRAFT" || po.status === "SUBMITTED") && isAdmin && (
                            <Button size="sm" variant="primary" onClick={() => handleApprovePO(po.id)}>
                              Approve
                            </Button>
                          )}
                          {po.status === "APPROVED" && isManager && (
                            <Button size="sm" variant="primary" onClick={() => openReceiveModal(po.id)}>
                              Receive
                            </Button>
                          )}
                          {po.status !== "RECEIVED" && po.status !== "CANCELED" && (
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

      {/* Create PO Modal */}
      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create Purchase Order">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Supplier</label>
            <Select
              value={newPO.supplierId}
              onChange={(e) => setNewPO((prev) => ({ ...prev, supplierId: e.target.value }))}
            >
              <option value="">Select supplier...</option>
              {activeSuppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Add Products</label>
            <Select onChange={(e) => { if (e.target.value) addItemToPO(e.target.value); e.target.value = ""; }}>
              <option value="">Select product to add...</option>
              {products
                .filter((p) => p.isActive && !newPO.items.some((i) => i.productId === p.id))
                .map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} (Cost: MMK {product.costMmk?.toLocaleString() ?? 0})
                  </option>
                ))}
            </Select>
          </div>

          {newPO.items.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-left">Qty</th>
                    <th className="px-3 py-2 text-left">Unit Cost</th>
                    <th className="px-3 py-2 text-right">Line Total</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {newPO.items.map((item) => {
                    const product = products.find((p) => p.id === item.productId);
                    return (
                      <tr key={item.productId} className="border-t">
                        <td className="px-3 py-2">{product?.name}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="1"
                            value={item.orderedQty}
                            onChange={(e) => updatePOItem(item.productId, "orderedQty", parseInt(e.target.value) || 1)}
                            className="w-20 rounded border px-2 py-1"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            value={item.unitCostMmk}
                            onChange={(e) => updatePOItem(item.productId, "unitCostMmk", parseInt(e.target.value) || 0)}
                            className="w-24 rounded border px-2 py-1"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-medium">
                          MMK {(item.orderedQty * item.unitCostMmk).toLocaleString()}
                        </td>
                        <td className="px-3 py-2">
                          <Button size="sm" variant="ghost" onClick={() => removeItemFromPO(item.productId)}>
                            Remove
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t bg-slate-50">
                    <td colSpan={3} className="px-3 py-2 text-right font-medium">Total:</td>
                    <td className="px-3 py-2 text-right font-bold">MMK {calculateTotal().toLocaleString()}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
            <textarea
              value={newPO.notes}
              onChange={(e) => setNewPO((prev) => ({ ...prev, notes: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              rows={2}
              placeholder="Additional notes..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button onClick={handleCreatePO} disabled={!newPO.supplierId || newPO.items.length === 0}>
              Create Order
            </Button>
          </div>
        </div>
      </Modal>

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

      {/* Receive PO Modal */}
      <Modal
        open={!!showReceiveModal}
        onClose={() => setShowReceiveModal(null)}
        title="Receive Purchase Order"
      >
        {showReceiveModal && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Confirm the quantities received for each item. This will add stock to your inventory.
            </p>

            <table className="w-full text-sm border rounded-lg overflow-hidden">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">Product</th>
                  <th className="px-3 py-2 text-right">Ordered</th>
                  <th className="px-3 py-2 text-right">Received Qty</th>
                </tr>
              </thead>
              <tbody>
                {receiveItems.map((item, idx) => {
                  const product = products.find((p) => p.id === item.productId);
                  const poItem = purchaseOrderItems.find(
                    (i) => i.purchaseOrderId === showReceiveModal && i.productId === item.productId
                  );
                  return (
                    <tr key={item.productId} className="border-t">
                      <td className="px-3 py-2">{product?.name}</td>
                      <td className="px-3 py-2 text-right">{poItem?.orderedQty}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min="0"
                          max={poItem?.orderedQty}
                          value={item.receivedQty}
                          onChange={(e) => {
                            const qty = parseInt(e.target.value) || 0;
                            setReceiveItems((prev) =>
                              prev.map((i, iIdx) =>
                                iIdx === idx ? { ...i, receivedQty: Math.min(qty, poItem?.orderedQty ?? qty) } : i
                              )
                            );
                          }}
                          className="w-20 rounded border px-2 py-1 text-right"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="secondary" onClick={() => setShowReceiveModal(null)}>Cancel</Button>
              <Button onClick={handleReceivePO}>Confirm Receipt</Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
};
