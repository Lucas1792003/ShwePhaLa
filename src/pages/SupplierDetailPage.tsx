import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { useAppStore } from "../stores/appStore";
import { useDataStore } from "../stores/dataStore";
import { useToast } from "../components/ui/Toast";
import { PageHeader } from "../components/layout/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Tabs } from "../components/ui/Tabs";
import { PurchaseOrderCreateModal } from "../components/purchases/PurchaseOrderCreateModal";
import { PurchaseOrderReceiveModal } from "../components/purchases/PurchaseOrderReceiveModal";
import { SupplierFormModal } from "../components/suppliers/SupplierFormModal";
import { SupplierPaymentModal } from "../components/suppliers/SupplierPaymentModal";
import {
  buildSupplierFinancialSummary,
  getComputedPaymentStatus,
  getPurchaseOrderBalanceMmk,
  getPurchaseOrderPaidMmk,
  getSupplierPayments,
  getSupplierPurchaseOrders,
} from "../features/suppliers/debt";
import { getPurchaseOrderActionState } from "../features/suppliers/actions";
import { DetailMeta, MoneyLine, SummaryCard } from "../features/suppliers/ui";
import {
  getSupplierPaymentMethodLabel,
  paymentStatusColors,
  poStatusColors,
} from "../features/suppliers/uiConstants";
import { formatDateTime, formatMmk, getEffectiveShopId } from "../lib/utils";
import { getErrorMessage } from "../lib/errors";
import { hasAnyPermission, hasPermission, hasShopPermission } from "../lib/permissions";
import type { PurchaseOrder } from "../types";

type TabId = "overview" | "purchases" | "payments";

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "purchases", label: "Purchase Orders" },
  { id: "payments", label: "Payments" },
];

// Friendly "supplier missing / no access" page. Used both when the id does
// not match any row AND when RLS hides the row from the current user — we
// can't tell the two apart from the client, so the copy covers both cases.
const SupplierNotFound = () => (
  <Card className="text-center">
    <h1 className="text-xl font-semibold text-slate-900">Supplier not found</h1>
    <p className="mt-2 text-sm text-slate-500">
      This supplier does not exist or you do not have access to it.
    </p>
    <div className="mt-5">
      <Link to="/app/suppliers">
        <Button>Back to Suppliers</Button>
      </Link>
    </div>
  </Card>
);

export const SupplierDetailPage = () => {
  const { supplierId } = useParams<{ supplierId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

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
  const approvePurchaseOrder = useDataStore((state) => state.approvePurchaseOrder);
  const cancelPurchaseOrder = useDataStore((state) => state.cancelPurchaseOrder);

  const [tab, setTab] = useState<TabId>("overview");
  const [expandedPoId, setExpandedPoId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [createPoOpen, setCreatePoOpen] = useState(false);
  const [receivePoId, setReceivePoId] = useState<string | null>(null);
  const [paymentPoId, setPaymentPoId] = useState<string | null>(null);
  const [busyPoId, setBusyPoId] = useState<string | null>(null);

  const supplier = suppliers.find((s) => s.id === supplierId) ?? null;
  const isAdmin = currentUser?.role === "ADMIN";
  const shopId = getEffectiveShopId(currentUser, currentShopId, shops);
  const canUpdateSupplier = hasPermission(currentUser, "supplier:update");
  const canViewDebt = hasAnyPermission(currentUser, ["supplier:debt_view", "purchase:view"]);
  const canRaisePoForShop = hasShopPermission(currentUser, "purchase:create", shopId);

  // Mirror the SuppliersPage scoping: ADMIN sees all, others only see records
  // for their own shop. Server-side RLS still enforces this — the filter just
  // keeps our summaries consistent for managers viewing a supplier that has
  // POs across multiple shops.
  const visiblePurchaseOrders = useMemo(
    () => purchaseOrders.filter((po) => isAdmin || po.shopId === shopId),
    [purchaseOrders, isAdmin, shopId]
  );
  const visibleSupplierPayments = useMemo(
    () => supplierPayments.filter((payment) => isAdmin || payment.shopId === shopId),
    [supplierPayments, isAdmin, shopId]
  );

  const supplierOrders = useMemo(
    () => (supplier ? getSupplierPurchaseOrders(supplier.id, visiblePurchaseOrders) : []),
    [supplier, visiblePurchaseOrders]
  );
  const supplierPaymentsList = useMemo(
    () => (supplier ? getSupplierPayments(supplier.id, visibleSupplierPayments) : []),
    [supplier, visibleSupplierPayments]
  );
  const summary = useMemo(
    () => (supplier ? buildSupplierFinancialSummary(supplier.id, visiblePurchaseOrders) : null),
    [supplier, visiblePurchaseOrders]
  );

  const lastPurchaseDate = useMemo(() => {
    if (!supplier) return null;
    // Use createdAt as a proxy for "last purchase date" — it's the only
    // timestamp guaranteed on every PO regardless of approval/receiving state.
    const dates = supplierOrders
      .map((po) => po.createdAt)
      .filter(Boolean)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    return dates[0] ?? null;
  }, [supplier, supplierOrders]);

  if (!supplier) return <SupplierNotFound />;

  const paymentPo = paymentPoId ? supplierOrders.find((po) => po.id === paymentPoId) ?? null : null;

  const handleApprovePo = async (po: PurchaseOrder) => {
    if (!currentUserId || busyPoId) return;
    setBusyPoId(po.id);
    try {
      await approvePurchaseOrder({ purchaseOrderId: po.id, approverId: currentUserId });
      toast({ variant: "success", title: `Approved ${po.orderNo}` });
    } catch (error) {
      toast({
        variant: "error",
        title: "Approval failed",
        description: getErrorMessage(error, "Could not approve this purchase order."),
      });
    } finally {
      setBusyPoId(null);
    }
  };

  const handleCancelPo = async (po: PurchaseOrder) => {
    if (!currentUserId || busyPoId) return;
    if (!confirm(`Cancel ${po.orderNo}? This cannot be undone.`)) return;
    setBusyPoId(po.id);
    try {
      await cancelPurchaseOrder({ purchaseOrderId: po.id, actorId: currentUserId });
      toast({ variant: "success", title: `Canceled ${po.orderNo}` });
    } catch (error) {
      toast({
        variant: "error",
        title: "Cancel failed",
        description: getErrorMessage(error, "Could not cancel this purchase order."),
      });
    } finally {
      setBusyPoId(null);
    }
  };

  // ---- Header --------------------------------------------------------------

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      {canUpdateSupplier && (
        <Button variant="secondary" onClick={() => setEditOpen(true)}>
          Edit supplier
        </Button>
      )}
      {canRaisePoForShop && supplier.isActive && (
        <Button onClick={() => setCreatePoOpen(true)}>Create purchase order</Button>
      )}
    </div>
  );

  // ---- Overview tab --------------------------------------------------------

  const overviewSection = (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Supplier profile</h2>
            <p className="mt-0.5 text-xs text-slate-500">Contact and account details</p>
          </div>
          <Badge color={supplier.isActive ? "green" : "gray"}>
            {supplier.isActive ? "Active" : "Inactive"}
          </Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <DetailMeta label="Contact" value={supplier.contactPerson ?? "-"} />
          <DetailMeta label="Phone" value={supplier.phone ?? "-"} />
          <DetailMeta label="Email" value={supplier.email ?? "-"} />
          <DetailMeta label="Address" value={supplier.address ?? "-"} />
          <DetailMeta label="Code" value={<span className="font-mono">{supplier.code}</span>} />
          <DetailMeta label="Added" value={formatDateTime(supplier.createdAt)} />
        </div>
        {supplier.notes && (
          <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {supplier.notes}
          </div>
        )}
      </section>
    </div>
  );

  // ---- Purchase Orders tab -------------------------------------------------

  const purchasesSection =
    supplierOrders.length === 0 ? (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        No purchase records for this supplier yet.
        {canRaisePoForShop && supplier.isActive && (
          <div className="mt-4">
            <Button onClick={() => setCreatePoOpen(true)}>Create purchase order</Button>
          </div>
        )}
      </div>
    ) : (
      <div className="space-y-3">
        {supplierOrders.map((po) => {
          const balance = getPurchaseOrderBalanceMmk(po);
          const paymentStatus = getComputedPaymentStatus(po);
          const receivedByUser = po.receivedBy ? users.find((u) => u.id === po.receivedBy) : undefined;
          const poItems = purchaseOrderItems.filter((item) => item.purchaseOrderId === po.id);
          const hasPartialReceiving =
            po.status === "RECEIVED" && poItems.some((item) => (item.receivedQty ?? 0) < item.orderedQty);
          const receivedStatus =
            po.status === "RECEIVED"
              ? {
                  label: hasPartialReceiving ? "Partially received" : "Received",
                  color: hasPartialReceiving ? "yellow" : "green",
                }
              : { label: "Not received", color: "gray" };
          const actionState = getPurchaseOrderActionState(po, currentUser);
          const isExpanded = expandedPoId === po.id;
          const isBusy = busyPoId === po.id;

          return (
            <article
              key={po.id}
              className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-base font-semibold text-slate-900">{po.orderNo}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {shops.find((shop) => shop.id === po.shopId)?.name ?? po.shopId} ·{" "}
                    Created {formatDateTime(po.createdAt)}
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Badge color={poStatusColors[po.status]}>{po.status}</Badge>
                  <Badge color={receivedStatus.color}>{receivedStatus.label}</Badge>
                  <Badge color={paymentStatusColors[paymentStatus]}>{paymentStatus}</Badge>
                  {actionState.hint && <Badge color="amber">{actionState.hint}</Badge>}
                </div>
              </div>

              <div className="mt-4 grid gap-3 rounded-2xl bg-slate-50/80 p-3 sm:grid-cols-3">
                <MoneyLine label="Total" value={po.totalMmk} />
                <MoneyLine label="Paid" value={getPurchaseOrderPaidMmk(po)} tone="green" />
                <MoneyLine label="Balance" value={balance} tone={balance > 0 ? "red" : "slate"} />
              </div>

              <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                <div>
                  <span className="font-medium text-slate-500">Received date: </span>
                  {po.receivedAt ? formatDateTime(po.receivedAt) : "Not received"}
                </div>
                <div>
                  <span className="font-medium text-slate-500">Received by: </span>
                  {receivedByUser?.name ?? "-"}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setExpandedPoId(isExpanded ? null : po.id)}
                >
                  {isExpanded ? "Hide details" : "View details"}
                </Button>
                <div className="flex flex-wrap items-center gap-2">
                  {actionState.nextAction === "approve" && actionState.canActor && (
                    <Button size="sm" disabled={isBusy} onClick={() => handleApprovePo(po)}>
                      {isBusy ? "Approving…" : "Approve"}
                    </Button>
                  )}
                  {actionState.nextAction === "receive" && actionState.canActor && (
                    <Button size="sm" onClick={() => setReceivePoId(po.id)}>
                      Receive
                    </Button>
                  )}
                  {actionState.nextAction === "pay" && actionState.canActor && (
                    <Button size="sm" onClick={() => setPaymentPoId(po.id)}>
                      Record payment
                    </Button>
                  )}
                  {actionState.canCancel && (
                    <Button size="sm" variant="ghost" disabled={isBusy} onClick={() => handleCancelPo(po)}>
                      Cancel PO
                    </Button>
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="mt-5 space-y-4 border-t border-slate-200/70 pt-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <DetailMeta label="Supplier invoice" value={po.supplierInvoiceNo ?? "-"} />
                    <DetailMeta label="Delivery note" value={po.deliveryNoteNo ?? "-"} />
                    <DetailMeta
                      label="Approved at"
                      value={po.approvedAt ? formatDateTime(po.approvedAt) : "-"}
                    />
                    <DetailMeta
                      label="Approved by"
                      value={
                        po.approvedBy
                          ? users.find((u) => u.id === po.approvedBy)?.name ?? po.approvedBy
                          : "-"
                      }
                    />
                  </div>

                  {po.status === "RECEIVED" && (
                    <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                      Received by{" "}
                      {receivedByUser?.name ?? po.receivedBy ?? "unknown user"}{" "}
                      {po.receivedAt ? `on ${formatDateTime(po.receivedAt)}` : ""}
                    </div>
                  )}

                  {poItems.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm text-slate-500">
                      No line items found for this purchase order.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200/70">
                      <table className="w-full min-w-[640px] text-sm">
                        <thead>
                          <tr className="border-b text-left text-slate-500">
                            <th className="pb-2 font-medium">Product</th>
                            <th className="pb-2 text-right font-medium">Ordered</th>
                            <th className="pb-2 text-right font-medium">Received</th>
                            <th className="pb-2 text-right font-medium">Unit cost</th>
                            <th className="pb-2 text-right font-medium">Line total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {poItems.map((item) => {
                            const product = products.find((p) => p.id === item.productId);
                            const receivedQty = item.receivedQty ?? 0;
                            return (
                              <tr key={item.id} className="border-b last:border-0">
                                <td className="py-2">{product?.name ?? item.productId}</td>
                                <td className="py-2 text-right tabular-nums">{item.orderedQty}</td>
                                <td className="py-2 text-right tabular-nums">
                                  {po.status === "RECEIVED" ? receivedQty : "-"}
                                </td>
                                <td className="py-2 text-right tabular-nums">
                                  {formatMmk(item.unitCostMmk)}
                                </td>
                                <td className="py-2 text-right tabular-nums">
                                  {formatMmk(item.lineTotalMmk)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    );

  // ---- Payments tab --------------------------------------------------------

  const paymentsSection =
    supplierPaymentsList.length === 0 ? (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        No supplier payments recorded yet.
      </div>
    ) : (
      <div className="overflow-x-auto rounded-2xl border border-slate-200/70 bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b text-left text-slate-500">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">PO #</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Method</th>
              <th className="px-4 py-3 font-medium">Reference</th>
              <th className="px-4 py-3 font-medium">Notes</th>
              <th className="px-4 py-3 font-medium">Recorded by</th>
            </tr>
          </thead>
          <tbody>
            {supplierPaymentsList.map((payment) => {
              const po = visiblePurchaseOrders.find((order) => order.id === payment.purchaseOrderId);
              const createdByUser = users.find((u) => u.id === payment.createdBy);
              return (
                <tr key={payment.id} className="border-b last:border-0">
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(payment.paidAt)}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {po?.orderNo ?? payment.purchaseOrderId}
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-emerald-700">
                    {formatMmk(payment.amountMmk)}
                  </td>
                  <td className="px-4 py-3">{getSupplierPaymentMethodLabel(payment.paymentMethod)}</td>
                  <td className="px-4 py-3">{payment.referenceNo ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{payment.notes ?? "-"}</td>
                  <td className="px-4 py-3">{createdByUser?.name ?? payment.createdBy}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );

  return (
    <div className="space-y-6">
      <Card>
        <PageHeader
          title={supplier.name}
          crumbs={[{ label: "Suppliers", href: "/app/suppliers" }, { label: supplier.name }]}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" onClick={() => navigate("/app/suppliers")}>
                ← Back
              </Button>
              {headerActions}
            </div>
          }
        />

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <Badge color={supplier.isActive ? "green" : "gray"}>
            {supplier.isActive ? "Active" : "Inactive"}
          </Badge>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-mono font-semibold text-slate-700">
            {supplier.code}
          </span>
          {supplier.contactPerson && <span>{supplier.contactPerson}</span>}
          {supplier.phone && <span>{supplier.phone}</span>}
        </div>

        {summary && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            <SummaryCard
              label="Outstanding debt"
              value={canViewDebt ? formatMmk(summary.outstandingDebtMmk) : "—"}
              tone={summary.outstandingDebtMmk > 0 ? "red" : "green"}
            />
            <SummaryCard
              label="Received purchases"
              value={canViewDebt ? formatMmk(summary.totalReceivedPurchasesMmk) : "—"}
            />
            <SummaryCard
              label="Paid"
              value={canViewDebt ? formatMmk(summary.totalPaidMmk) : "—"}
              tone="green"
            />
            <SummaryCard
              label="Unpaid / partial POs"
              value={summary.unpaidPoCount + summary.partialPoCount}
              tone={summary.unpaidPoCount + summary.partialPoCount > 0 ? "amber" : "slate"}
              badge={
                <Badge color={summary.partialPoCount > 0 ? "yellow" : "gray"}>
                  {summary.partialPoCount} partial
                </Badge>
              }
            />
            <SummaryCard
              label="Last purchase"
              value={lastPurchaseDate ? formatDateTime(lastPurchaseDate) : "—"}
            />
          </div>
        )}

        <div className="mt-6">
          <Tabs
            tabs={tabs}
            active={tab}
            onChange={(id) => setTab(id as TabId)}
          />
        </div>

        <div className="mt-5">
          {tab === "overview" && overviewSection}
          {tab === "purchases" && purchasesSection}
          {tab === "payments" && paymentsSection}
        </div>
      </Card>

      <SupplierFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        editing={supplier}
      />

      <PurchaseOrderCreateModal
        open={createPoOpen}
        onClose={() => setCreatePoOpen(false)}
        shopId={shopId}
        currentUserId={currentUserId}
        defaultSupplierId={supplier.id}
        suppliers={suppliers}
        products={products}
        onCreated={() => setTab("purchases")}
      />

      <PurchaseOrderReceiveModal
        purchaseOrderId={receivePoId}
        onClose={() => setReceivePoId(null)}
        currentUserId={currentUserId}
      />

      <SupplierPaymentModal
        purchaseOrder={paymentPo}
        onClose={() => setPaymentPoId(null)}
      />
    </div>
  );
};
