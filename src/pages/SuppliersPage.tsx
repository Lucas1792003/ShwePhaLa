import { useMemo, useState } from "react";
import { useAuthStore } from "../stores/authStore";
import { useAppStore } from "../stores/appStore";
import { useDataStore } from "../stores/dataStore";
import { useToastStore } from "../stores/toastStore";
import { PageHeader } from "../components/layout/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { Drawer } from "../components/ui/Drawer";
import { Select } from "../components/ui/Select";
import { SearchInput } from "../components/forms/SearchInput";
import { MoneyInput } from "../components/forms/MoneyInput";
import {
  buildSupplierFinancialSummary,
  getComputedPaymentStatus,
  getPurchaseOrderBalanceMmk,
  getPurchaseOrderPaidMmk,
  getSupplierPayments,
  getSupplierPurchaseOrders,
} from "../features/suppliers/debt";
import { formatDateTime, formatMmk, getEffectiveShopId } from "../lib/utils";
import { canRecordSupplierPayment, hasAnyPermission, hasPermission } from "../lib/permissions";
import type { PurchaseOrder, PurchasePaymentStatus, Supplier, SupplierPaymentMethod } from "../types";

const poStatusColors: Record<PurchaseOrder["status"], "gray" | "yellow" | "green" | "blue" | "red"> = {
  DRAFT: "gray",
  SUBMITTED: "yellow",
  APPROVED: "blue",
  RECEIVED: "green",
  CANCELED: "red",
};

const paymentStatusColors: Record<PurchasePaymentStatus, "gray" | "yellow" | "green"> = {
  UNPAID: "gray",
  PARTIAL: "yellow",
  PAID: "green",
};

const paymentMethods: Array<{ value: SupplierPaymentMethod; label: string }> = [
  { value: "CASH", label: "Cash" },
  { value: "BANK", label: "Bank" },
  { value: "MOBILE", label: "Mobile" },
  { value: "OTHER", label: "Other" },
];

const getDebtStatus = (outstandingDebtMmk: number) => {
  if (outstandingDebtMmk <= 0) return { label: "No Debt", color: "green" as const };
  return { label: "Unpaid", color: "red" as const };
};

export const SuppliersPage = () => {
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentUser = useDataStore((state) => state.users.find((u) => u.id === currentUserId));
  const { currentShopId } = useAppStore();
  const shops = useDataStore((state) => state.shops);
  const suppliers = useDataStore((state) => state.suppliers);
  const purchaseOrders = useDataStore((state) => state.purchaseOrders);
  const purchaseOrderItems = useDataStore((state) => state.purchaseOrderItems);
  const supplierPayments = useDataStore((state) => state.supplierPayments);
  const products = useDataStore((state) => state.products);
  const users = useDataStore((state) => state.users);
  const addSupplier = useDataStore((state) => state.addSupplier);
  const updateSupplier = useDataStore((state) => state.updateSupplier);
  const recordSupplierPayment = useDataStore((state) => state.recordSupplierPayment);
  const addToast = useToastStore((state) => state.addToast);

  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null);
  const [paymentPoId, setPaymentPoId] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    amountMmk: 0,
    paymentMethod: "CASH" as SupplierPaymentMethod,
    referenceNo: "",
    notes: "",
  });
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
  const shopId = getEffectiveShopId(currentUser, currentShopId, shops);
  const canCreateSupplier = hasPermission(currentUser, "supplier:create");
  const canUpdateSupplier = hasPermission(currentUser, "supplier:update");
  const canViewDebt = hasAnyPermission(currentUser, ["supplier:debt_view", "purchase:view"]);

  const visiblePurchaseOrders = useMemo(
    () => purchaseOrders.filter((po) => isAdmin || po.shopId === shopId),
    [purchaseOrders, isAdmin, shopId]
  );
  const visibleSupplierPayments = useMemo(
    () => supplierPayments.filter((payment) => isAdmin || payment.shopId === shopId),
    [supplierPayments, isAdmin, shopId]
  );

  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase()) ||
      (s.contactPerson ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const selectedSupplier = selectedSupplierId
    ? suppliers.find((supplier) => supplier.id === selectedSupplierId) ?? null
    : null;
  const selectedSupplierOrders = selectedSupplier
    ? getSupplierPurchaseOrders(selectedSupplier.id, visiblePurchaseOrders)
    : [];
  const selectedSupplierPayments = selectedSupplier
    ? getSupplierPayments(selectedSupplier.id, visibleSupplierPayments)
    : [];
  const selectedSupplierSummary = selectedSupplier
    ? buildSupplierFinancialSummary(selectedSupplier.id, visiblePurchaseOrders)
    : null;

  const detailPo = selectedPoId
    ? selectedSupplierOrders.find((po) => po.id === selectedPoId) ?? null
    : selectedSupplierOrders[0] ?? null;
  const detailPoItems = detailPo
    ? purchaseOrderItems.filter((item) => item.purchaseOrderId === detailPo.id)
    : [];
  const paymentPo = paymentPoId
    ? visiblePurchaseOrders.find((po) => po.id === paymentPoId) ?? null
    : null;
  const paymentBalance = paymentPo ? getPurchaseOrderBalanceMmk(paymentPo) : 0;

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

  const openSupplierDetail = (supplier: Supplier) => {
    const orders = getSupplierPurchaseOrders(supplier.id, visiblePurchaseOrders);
    setSelectedSupplierId(supplier.id);
    setSelectedPoId(orders[0]?.id ?? null);
  };

  const openPaymentModal = (po: PurchaseOrder) => {
    const balance = getPurchaseOrderBalanceMmk(po);
    setPaymentPoId(po.id);
    setPaymentForm({ amountMmk: balance, paymentMethod: "CASH", referenceNo: "", notes: "" });
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

  const handleRecordPayment = async () => {
    if (!paymentPo) return;
    if (paymentPo.status !== "RECEIVED") {
      addToast({ variant: "error", title: "Payment blocked", description: "Only received purchase orders can be paid." });
      return;
    }
    if (paymentForm.amountMmk <= 0 || paymentForm.amountMmk > paymentBalance) {
      addToast({
        variant: "error",
        title: "Invalid amount",
        description: `Amount must be between MMK 1 and ${formatMmk(paymentBalance)}.`,
      });
      return;
    }

    try {
      await recordSupplierPayment({
        purchaseOrderId: paymentPo.id,
        amountMmk: paymentForm.amountMmk,
        paymentMethod: paymentForm.paymentMethod,
        referenceNo: paymentForm.referenceNo || undefined,
        notes: paymentForm.notes || undefined,
      });
      setPaymentPoId(null);
      addToast({
        variant: "success",
        title: "Supplier payment recorded",
        description: `${paymentPo.orderNo} updated.`,
      });
    } catch (error) {
      addToast({
        variant: "error",
        title: "Payment failed",
        description: error instanceof Error ? error.message : "Could not record supplier payment.",
      });
    }
  };

  return (
    <Card>
      <PageHeader
        title="Suppliers"
        subtitle="Track supplier purchases, receiving confirmation, and outstanding payables."
        actions={
          canCreateSupplier && (
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
                    <tr key={supplier.id} className="border-b last:border-0">
                      <td className="py-3 font-mono text-xs">{supplier.code}</td>
                      <td className="py-3 font-medium text-slate-900">{supplier.name}</td>
                      <td className="py-3">{supplier.contactPerson ?? "-"}</td>
                      <td className="py-3">{supplier.phone ?? "-"}</td>
                      <td className="py-3 text-right">{summary.orderCount}</td>
                      <td className="py-3 text-right">{canViewDebt ? formatMmk(summary.totalReceivedPurchasesMmk) : "-"}</td>
                      <td className="py-3 text-right">{canViewDebt ? formatMmk(summary.totalPaidMmk) : "-"}</td>
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
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="ghost" onClick={() => openSupplierDetail(supplier)}>
                            View
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

      <Drawer
        open={!!selectedSupplier}
        onClose={() => {
          setSelectedSupplierId(null);
          setSelectedPoId(null);
        }}
        title={selectedSupplier?.name ?? "Supplier"}
        header={selectedSupplier && (
          <div className="mt-1 text-xs text-slate-500">
            {selectedSupplier.code} {selectedSupplier.phone ? `- ${selectedSupplier.phone}` : ""}
          </div>
        )}
      >
        {selectedSupplier && selectedSupplierSummary && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm">
              <div className="font-semibold text-slate-900">Supplier info</div>
              <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-3 gap-y-2">
                <dt className="text-slate-500">Contact</dt>
                <dd className="text-right font-medium">{selectedSupplier.contactPerson ?? "-"}</dd>
                <dt className="text-slate-500">Phone</dt>
                <dd className="text-right font-medium">{selectedSupplier.phone ?? "-"}</dd>
                <dt className="text-slate-500">Email</dt>
                <dd className="break-all text-right font-medium">{selectedSupplier.email ?? "-"}</dd>
                <dt className="text-slate-500">Address</dt>
                <dd className="text-right font-medium">{selectedSupplier.address ?? "-"}</dd>
              </dl>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">Received purchases</div>
                <div className="mt-1 text-lg font-bold text-slate-900">
                  {formatMmk(selectedSupplierSummary.totalReceivedPurchasesMmk)}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">Outstanding debt</div>
                <div className="mt-1 text-lg font-bold text-rose-700">
                  {formatMmk(selectedSupplierSummary.outstandingDebtMmk)}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">Paid</div>
                <div className="mt-1 text-lg font-bold text-emerald-700">
                  {formatMmk(selectedSupplierSummary.totalPaidMmk)}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">Unpaid / partial POs</div>
                <div className="mt-1 text-lg font-bold text-slate-900">
                  {selectedSupplierSummary.unpaidPoCount + selectedSupplierSummary.partialPoCount}
                </div>
              </div>
            </div>

            <section>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">Purchase records</h3>
                <span className="text-xs text-slate-500">{selectedSupplierOrders.length} orders</span>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-[980px] w-full text-xs">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">PO</th>
                      <th className="px-3 py-2 font-medium">Shop</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Received</th>
                      <th className="px-3 py-2 font-medium">Received By</th>
                      <th className="px-3 py-2 text-right font-medium">Total</th>
                      <th className="px-3 py-2 text-right font-medium">Paid</th>
                      <th className="px-3 py-2 text-right font-medium">Balance</th>
                      <th className="px-3 py-2 font-medium">Payment</th>
                      <th className="px-3 py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSupplierOrders.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-3 py-4 text-center text-slate-500">
                          No purchase records for this supplier.
                        </td>
                      </tr>
                    ) : (
                      selectedSupplierOrders.map((po) => {
                        const balance = getPurchaseOrderBalanceMmk(po);
                        const paymentStatus = getComputedPaymentStatus(po);
                        const receivedByUser = po.receivedBy ? users.find((user) => user.id === po.receivedBy) : undefined;
                        const canPay = po.status === "RECEIVED" && balance > 0 && canRecordSupplierPayment(currentUser, po);
                        return (
                          <tr key={po.id} className="border-t">
                            <td className="px-3 py-2 font-medium text-slate-900">{po.orderNo}</td>
                            <td className="px-3 py-2">{shops.find((shop) => shop.id === po.shopId)?.name ?? po.shopId}</td>
                            <td className="px-3 py-2"><Badge color={poStatusColors[po.status]}>{po.status}</Badge></td>
                            <td className="px-3 py-2">{po.receivedAt ? formatDateTime(po.receivedAt) : "Not received"}</td>
                            <td className="px-3 py-2">{receivedByUser?.name ?? "-"}</td>
                            <td className="px-3 py-2 text-right">{formatMmk(po.totalMmk)}</td>
                            <td className="px-3 py-2 text-right">{formatMmk(getPurchaseOrderPaidMmk(po))}</td>
                            <td className="px-3 py-2 text-right font-semibold">{formatMmk(balance)}</td>
                            <td className="px-3 py-2"><Badge color={paymentStatusColors[paymentStatus]}>{paymentStatus}</Badge></td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-2">
                                <Button size="sm" variant="ghost" onClick={() => setSelectedPoId(po.id)}>
                                  Items
                                </Button>
                                {canPay && (
                                  <Button size="sm" onClick={() => openPaymentModal(po)}>
                                    Record payment
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {detailPo && (
              <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Receiving confirmation</h3>
                    <p className="mt-0.5 text-xs text-slate-500">{detailPo.orderNo}</p>
                  </div>
                  <Badge color={poStatusColors[detailPo.status]}>{detailPo.status}</Badge>
                </div>
                <div className="grid gap-2 text-xs sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-slate-500">Received at</div>
                    <div className="mt-1 font-medium text-slate-900">{detailPo.receivedAt ? formatDateTime(detailPo.receivedAt) : "-"}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-slate-500">Received by</div>
                    <div className="mt-1 font-medium text-slate-900">
                      {detailPo.receivedBy ? users.find((user) => user.id === detailPo.receivedBy)?.name ?? detailPo.receivedBy : "-"}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-slate-500">Supplier invoice</div>
                    <div className="mt-1 font-medium text-slate-900">{detailPo.supplierInvoiceNo ?? "-"}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-slate-500">Delivery note</div>
                    <div className="mt-1 font-medium text-slate-900">{detailPo.deliveryNoteNo ?? "-"}</div>
                  </div>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-[560px] w-full text-xs">
                    <thead className="border-b text-left text-slate-500">
                      <tr>
                        <th className="pb-2 font-medium">Product</th>
                        <th className="pb-2 text-right font-medium">Ordered</th>
                        <th className="pb-2 text-right font-medium">Received</th>
                        <th className="pb-2 text-right font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailPoItems.map((item) => {
                        const receivedQty = item.receivedQty ?? 0;
                        const receivedStatus =
                          detailPo.status !== "RECEIVED"
                            ? "Pending"
                            : receivedQty >= item.orderedQty
                              ? "Received"
                              : receivedQty > 0
                                ? "Partial"
                                : "Not received";
                        return (
                          <tr key={item.id} className="border-b last:border-0">
                            <td className="py-2">{products.find((product) => product.id === item.productId)?.name ?? item.productId}</td>
                            <td className="py-2 text-right">{item.orderedQty}</td>
                            <td className="py-2 text-right">{detailPo.status === "RECEIVED" ? receivedQty : "-"}</td>
                            <td className="py-2 text-right">{receivedStatus}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Payment history</h3>
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-[760px] w-full text-xs">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">PO</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                      <th className="px-3 py-2 font-medium">Method</th>
                      <th className="px-3 py-2 font-medium">Reference</th>
                      <th className="px-3 py-2 font-medium">Recorded by</th>
                      <th className="px-3 py-2 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSupplierPayments.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-4 text-center text-slate-500">
                          No supplier payments recorded.
                        </td>
                      </tr>
                    ) : (
                      selectedSupplierPayments.map((payment) => {
                        const po = visiblePurchaseOrders.find((order) => order.id === payment.purchaseOrderId);
                        const createdByUser = users.find((user) => user.id === payment.createdBy);
                        return (
                          <tr key={payment.id} className="border-t">
                            <td className="px-3 py-2">{formatDateTime(payment.paidAt)}</td>
                            <td className="px-3 py-2">{po?.orderNo ?? payment.purchaseOrderId}</td>
                            <td className="px-3 py-2 text-right font-semibold">{formatMmk(payment.amountMmk)}</td>
                            <td className="px-3 py-2">{payment.paymentMethod}</td>
                            <td className="px-3 py-2">{payment.referenceNo ?? "-"}</td>
                            <td className="px-3 py-2">{createdByUser?.name ?? payment.createdBy}</td>
                            <td className="px-3 py-2">{payment.notes ?? "-"}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </Drawer>

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

      <Modal
        open={!!paymentPo}
        onClose={() => setPaymentPoId(null)}
        title="Record supplier payment"
        description={paymentPo?.orderNo}
      >
        {paymentPo && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Total</div>
                  <div className="mt-0.5 font-semibold">{formatMmk(paymentPo.totalMmk)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Outstanding</div>
                  <div className="mt-0.5 font-semibold text-rose-700">{formatMmk(paymentBalance)}</div>
                </div>
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Amount</span>
              <MoneyInput
                value={paymentForm.amountMmk}
                onChange={(value) => setPaymentForm((prev) => ({ ...prev, amountMmk: value ?? 0 }))}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Payment method</span>
              <Select
                value={paymentForm.paymentMethod}
                onChange={(event) =>
                  setPaymentForm((prev) => ({ ...prev, paymentMethod: event.target.value as SupplierPaymentMethod }))
                }
              >
                {paymentMethods.map((method) => (
                  <option key={method.value} value={method.value}>{method.label}</option>
                ))}
              </Select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Reference no</span>
              <input
                type="text"
                value={paymentForm.referenceNo}
                onChange={(event) => setPaymentForm((prev) => ({ ...prev, referenceNo: event.target.value }))}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="Bank slip, mobile transaction, voucher..."
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Notes</span>
              <textarea
                value={paymentForm.notes}
                onChange={(event) => setPaymentForm((prev) => ({ ...prev, notes: event.target.value }))}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                rows={2}
                placeholder="Optional notes"
              />
            </label>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="secondary" onClick={() => setPaymentPoId(null)}>Cancel</Button>
              <Button
                onClick={handleRecordPayment}
                disabled={paymentForm.amountMmk <= 0 || paymentForm.amountMmk > paymentBalance}
              >
                Record payment
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
};
