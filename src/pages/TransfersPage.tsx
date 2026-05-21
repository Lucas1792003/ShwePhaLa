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
import type { TransferStatus } from "../types";

const statusColors: Record<TransferStatus, "gray" | "yellow" | "green" | "red" | "blue"> = {
  PENDING: "yellow",
  APPROVED: "blue",
  COMPLETED: "green",
  CANCELED: "gray",
  REJECTED: "red",
};

export const TransfersPage = () => {
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentUser = useDataStore((state) => state.users.find((u) => u.id === currentUserId));
  const { currentShopId } = useAppStore();
  const shops = useDataStore((state) => state.shops);
  const products = useDataStore((state) => state.products);
  const inventory = useDataStore((state) => state.inventory);
  const transfers = useDataStore((state) => state.stockTransfers);
  const transferItems = useDataStore((state) => state.stockTransferItems);
  const users = useDataStore((state) => state.users);

  const createTransfer = useDataStore((state) => state.createTransfer);
  const approveTransfer = useDataStore((state) => state.approveTransfer);
  const rejectTransfer = useDataStore((state) => state.rejectTransfer);
  const completeTransfer = useDataStore((state) => state.completeTransfer);
  const cancelTransfer = useDataStore((state) => state.cancelTransfer);

  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState<string | null>(null);

  // Create transfer form state
  const [newTransfer, setNewTransfer] = useState({
    toShopId: "",
    items: [] as { productId: string; requestedQty: number }[],
    notes: "",
  });

  const shopId = getEffectiveShopId(currentUser, currentShopId, shops);
  const isAdmin = currentUser?.role === "ADMIN";
  const isManager = currentUser?.role === "MANAGER" || isAdmin;

  // Filter transfers based on tab and filters
  const filteredTransfers = useMemo(() => {
    return transfers
      .filter((t) => {
        // Tab filter
        if (activeTab === "outgoing") return t.fromShopId === shopId;
        if (activeTab === "incoming") return t.toShopId === shopId;
        if (activeTab === "pending") return t.fromShopId === shopId && t.status === "PENDING";
        // "all" tab - show transfers involving current shop
        return t.fromShopId === shopId || t.toShopId === shopId;
      })
      .filter((t) => statusFilter === "all" || t.status === statusFilter)
      .filter((t) => t.transferNo.toLowerCase().includes(search.toLowerCase()));
  }, [transfers, activeTab, statusFilter, search, shopId]);

  const pendingForApproval = transfers.filter(
    (t) => t.fromShopId === shopId && t.status === "PENDING"
  );

  const handleCreateTransfer = async () => {
    if (!currentUserId || !newTransfer.toShopId || newTransfer.items.length === 0) return;
    try {
      await createTransfer({
        fromShopId: shopId,
        toShopId: newTransfer.toShopId,
        items: newTransfer.items,
        notes: newTransfer.notes,
        createdBy: currentUserId,
      });
      setShowCreateModal(false);
      setNewTransfer({ toShopId: "", items: [], notes: "" });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to create transfer");
    }
  };

  const handleApprove = async (transferId: string) => {
    if (!currentUserId) return;
    try {
      await approveTransfer({ transferId, approverId: currentUserId });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to approve transfer");
    }
  };

  const handleReject = async (transferId: string) => {
    if (!currentUserId) return;
    const reason = prompt("Enter rejection reason:");
    if (!reason) return;
    try {
      await rejectTransfer({ transferId, actorId: currentUserId, reason });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to reject transfer");
    }
  };

  const handleComplete = async (transferId: string) => {
    if (!currentUserId) return;
    try {
      await completeTransfer({ transferId, actorId: currentUserId });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to complete transfer");
    }
  };

  const handleCancel = async (transferId: string) => {
    if (!currentUserId) return;
    const reason = prompt("Enter cancellation reason:");
    if (!reason) return;
    try {
      await cancelTransfer({ transferId, actorId: currentUserId, reason });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to cancel transfer");
    }
  };

  const addItemToTransfer = (productId: string) => {
    if (newTransfer.items.some((i) => i.productId === productId)) return;
    const inv = inventory.find((i) => i.shopId === shopId && i.productId === productId);
    const maxQty = inv?.qtyBaseUnits ?? 0;
    if (maxQty <= 0) {
      alert("No stock available for this product");
      return;
    }
    setNewTransfer((prev) => ({
      ...prev,
      items: [...prev.items, { productId, requestedQty: 1 }],
    }));
  };

  const updateItemQty = (productId: string, qty: number) => {
    const inv = inventory.find((i) => i.shopId === shopId && i.productId === productId);
    const maxQty = inv?.qtyBaseUnits ?? 0;
    setNewTransfer((prev) => ({
      ...prev,
      items: prev.items.map((i) =>
        i.productId === productId ? { ...i, requestedQty: Math.min(Math.max(1, qty), maxQty) } : i
      ),
    }));
  };

  const removeItemFromTransfer = (productId: string) => {
    setNewTransfer((prev) => ({
      ...prev,
      items: prev.items.filter((i) => i.productId !== productId),
    }));
  };

  const selectedTransfer = showDetailModal ? transfers.find((t) => t.id === showDetailModal) : null;
  const selectedTransferItems = showDetailModal
    ? transferItems.filter((i) => i.transferId === showDetailModal)
    : [];

  return (
    <Card>
      <PageHeader
        title="Stock Transfers"
        subtitle="Transfer inventory between shops"
        actions={
          isManager && (
            <Button onClick={() => setShowCreateModal(true)}>New Transfer</Button>
          )
        }
      />

      {pendingForApproval.length > 0 && isManager && (
        <div className="mt-4 rounded-lg bg-yellow-50 border border-yellow-200 p-4">
          <p className="text-sm font-medium text-yellow-800">
            {pendingForApproval.length} transfer(s) pending your approval
          </p>
        </div>
      )}

      <div className="mt-6">
        <Tabs
          tabs={[
            { id: "all", label: "All Transfers" },
            { id: "outgoing", label: "Outgoing" },
            { id: "incoming", label: "Incoming" },
            { id: "pending", label: `Pending Approval (${pendingForApproval.length})` },
          ]}
          active={activeTab}
          onChange={setActiveTab}
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by transfer #" />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELED">Canceled</option>
          <option value="REJECTED">Rejected</option>
        </Select>
      </div>

      <div className="mt-5">
        {filteredTransfers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300/70 bg-slate-50/60 p-6 text-center text-sm text-slate-500">
            No transfers found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="pb-3 font-medium">Transfer #</th>
                  <th className="pb-3 font-medium">From</th>
                  <th className="pb-3 font-medium">To</th>
                  <th className="pb-3 font-medium">Items</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Created</th>
                  <th className="pb-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransfers.map((transfer) => {
                  const fromShop = shops.find((s) => s.id === transfer.fromShopId);
                  const toShop = shops.find((s) => s.id === transfer.toShopId);
                  const items = transferItems.filter((i) => i.transferId === transfer.id);
                  const createdByUser = users.find((u) => u.id === transfer.createdBy);
                  const isFromCurrentShop = transfer.fromShopId === shopId;

                  return (
                    <tr key={transfer.id} className="border-b last:border-0">
                      <td className="py-3 font-medium">{transfer.transferNo}</td>
                      <td className="py-3">{fromShop?.name ?? transfer.fromShopId}</td>
                      <td className="py-3">{toShop?.name ?? transfer.toShopId}</td>
                      <td className="py-3">{items.length} items</td>
                      <td className="py-3">
                        <Badge color={statusColors[transfer.status]}>{transfer.status}</Badge>
                      </td>
                      <td className="py-3">
                        <div>{formatDateTime(transfer.createdAt)}</div>
                        <div className="text-xs text-slate-500">by {createdByUser?.name ?? "Unknown"}</div>
                      </td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setShowDetailModal(transfer.id)}>
                            View
                          </Button>
                          {isFromCurrentShop && transfer.status === "PENDING" && isManager && (
                            <>
                              <Button size="sm" variant="primary" onClick={() => handleApprove(transfer.id)}>
                                Approve
                              </Button>
                              <Button size="sm" variant="danger" onClick={() => handleReject(transfer.id)}>
                                Reject
                              </Button>
                            </>
                          )}
                          {isFromCurrentShop && transfer.status === "APPROVED" && isManager && (
                            <Button size="sm" variant="primary" onClick={() => handleComplete(transfer.id)}>
                              Complete
                            </Button>
                          )}
                          {transfer.status === "PENDING" && (
                            <Button size="sm" variant="ghost" onClick={() => handleCancel(transfer.id)}>
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

      {/* Create Transfer Modal */}
      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create Stock Transfer">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Destination Shop</label>
            <Select
              value={newTransfer.toShopId}
              onChange={(e) => setNewTransfer((prev) => ({ ...prev, toShopId: e.target.value }))}
            >
              <option value="">Select shop...</option>
              {shops.filter((s) => s.id !== shopId).map((shop) => (
                <option key={shop.id} value={shop.id}>{shop.name}</option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Add Products</label>
            <Select onChange={(e) => { if (e.target.value) addItemToTransfer(e.target.value); e.target.value = ""; }}>
              <option value="">Select product to add...</option>
              {products
                .filter((p) => !newTransfer.items.some((i) => i.productId === p.id))
                .filter((p) => {
                  const inv = inventory.find((i) => i.shopId === shopId && i.productId === p.id);
                  return (inv?.qtyBaseUnits ?? 0) > 0;
                })
                .map((product) => {
                  const inv = inventory.find((i) => i.shopId === shopId && i.productId === product.id);
                  return (
                    <option key={product.id} value={product.id}>
                      {product.name} (Available: {inv?.qtyBaseUnits ?? 0})
                    </option>
                  );
                })}
            </Select>
          </div>

          {newTransfer.items.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-left">Available</th>
                    <th className="px-3 py-2 text-left">Qty to Transfer</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {newTransfer.items.map((item) => {
                    const product = products.find((p) => p.id === item.productId);
                    const inv = inventory.find((i) => i.shopId === shopId && i.productId === item.productId);
                    return (
                      <tr key={item.productId} className="border-t">
                        <td className="px-3 py-2">{product?.name}</td>
                        <td className="px-3 py-2">{inv?.qtyBaseUnits ?? 0}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="1"
                            max={inv?.qtyBaseUnits ?? 1}
                            value={item.requestedQty}
                            onChange={(e) => updateItemQty(item.productId, parseInt(e.target.value) || 1)}
                            className="w-20 rounded border px-2 py-1"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Button size="sm" variant="ghost" onClick={() => removeItemFromTransfer(item.productId)}>
                            Remove
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
            <textarea
              value={newTransfer.notes}
              onChange={(e) => setNewTransfer((prev) => ({ ...prev, notes: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              rows={2}
              placeholder="Reason for transfer..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button onClick={handleCreateTransfer} disabled={!newTransfer.toShopId || newTransfer.items.length === 0}>
              Create Transfer
            </Button>
          </div>
        </div>
      </Modal>

      {/* Transfer Detail Modal */}
      <Modal
        open={!!showDetailModal}
        onClose={() => setShowDetailModal(null)}
        title={`Transfer Details - ${selectedTransfer?.transferNo}`}
      >
        {selectedTransfer && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-500">From:</span>
                <span className="ml-2 font-medium">{shops.find((s) => s.id === selectedTransfer.fromShopId)?.name}</span>
              </div>
              <div>
                <span className="text-slate-500">To:</span>
                <span className="ml-2 font-medium">{shops.find((s) => s.id === selectedTransfer.toShopId)?.name}</span>
              </div>
              <div>
                <span className="text-slate-500">Status:</span>
                <span className="ml-2"><Badge color={statusColors[selectedTransfer.status]}>{selectedTransfer.status}</Badge></span>
              </div>
              <div>
                <span className="text-slate-500">Created:</span>
                <span className="ml-2">{formatDateTime(selectedTransfer.createdAt)}</span>
              </div>
              {selectedTransfer.approvedAt && (
                <div>
                  <span className="text-slate-500">Approved:</span>
                  <span className="ml-2">{formatDateTime(selectedTransfer.approvedAt)}</span>
                </div>
              )}
              {selectedTransfer.completedAt && (
                <div>
                  <span className="text-slate-500">Completed:</span>
                  <span className="ml-2">{formatDateTime(selectedTransfer.completedAt)}</span>
                </div>
              )}
            </div>

            {selectedTransfer.notes && (
              <div className="text-sm">
                <span className="text-slate-500">Notes:</span>
                <p className="mt-1">{selectedTransfer.notes}</p>
              </div>
            )}

            {selectedTransfer.cancelReason && (
              <div className="text-sm bg-red-50 p-3 rounded-lg">
                <span className="text-red-700 font-medium">Cancel Reason:</span>
                <p className="mt-1 text-red-600">{selectedTransfer.cancelReason}</p>
              </div>
            )}

            <div>
              <h4 className="font-medium mb-2">Items</h4>
              <table className="w-full text-sm border rounded-lg overflow-hidden">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-right">Requested</th>
                    <th className="px-3 py-2 text-right">Approved</th>
                    <th className="px-3 py-2 text-right">Transferred</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedTransferItems.map((item) => {
                    const product = products.find((p) => p.id === item.productId);
                    return (
                      <tr key={item.id} className="border-t">
                        <td className="px-3 py-2">{product?.name}</td>
                        <td className="px-3 py-2 text-right">{item.requestedQty}</td>
                        <td className="px-3 py-2 text-right">{item.approvedQty ?? "-"}</td>
                        <td className="px-3 py-2 text-right">{item.transferredQty ?? "-"}</td>
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
    </Card>
  );
};
