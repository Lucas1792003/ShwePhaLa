import { useMemo } from "react";
import { useAuthStore } from "../../../stores/authStore";
import { useAppStore } from "../../../stores/appStore";
import { useDataStore } from "../../../stores/dataStore";
import { PageHeader } from "../../../components/layout/PageHeader";
import { Card } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { useToast } from "../../../components/ui/Toast";
import { getEffectiveShopId } from "../../../lib/utils";

export const ApprovalsPage = () => {
  const toast = useToast();
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const refunds = useDataStore((state) => state.refundVoidRequests);
  const shops = useDataStore((state) => state.shops);
  const currentUser = useDataStore((state) => state.users.find((user) => user.id === currentUserId));
  const { currentShopId } = useAppStore();
  const sales = useDataStore((state) => state.sales);
  const users = useDataStore((state) => state.users);
  const approveRefund = useDataStore((state) => state.approveRefund);

  const shopId = getEffectiveShopId(currentUser, currentShopId, shops);
  const pending = refunds.filter(
    (refund) => refund.status === "REQUESTED" && (!shopId || refund.shopId === shopId)
  );
  const saleMap = useMemo(() => Object.fromEntries(sales.map((sale) => [sale.id, sale])), [sales]);
  const userMap = useMemo(() => Object.fromEntries(users.map((user) => [user.id, user])), [users]);

  const handleApprove = async (requestId: string) => {
    if (!currentUserId) return;
    try {
      await approveRefund({ refundId: requestId, approverId: currentUserId });
      toast({ title: "Approval completed", variant: "success" });
    } catch (error) {
      toast({
        title: "Approval failed",
        description: error instanceof Error ? error.message : "Could not approve the request.",
        variant: "error",
      });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Approvals" subtitle="Review refund and void requests from cashiers." />
      <Card>
        {pending.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-sm text-slate-500">
            No pending approvals.
          </div>
        ) : (
          <div className="space-y-4">
            {pending.map((request) => {
              const sale = saleMap[request.saleId];
              const creator = userMap[request.createdBy];
              return (
                <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white p-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{sale?.receiptNo ?? "Unknown sale"}</div>
                    <div className="text-xs text-slate-500">
                      {request.type} request by {creator?.name ?? "Staff"} • {request.reason}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone="amber">{request.status ?? "REQUESTED"}</Badge>
                    <Button onClick={() => void handleApprove(request.id)}>
                      Approve
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};
