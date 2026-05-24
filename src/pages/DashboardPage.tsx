import { Card } from "../components/ui/Card";
import { AdminDashboard } from "../features/dashboard/AdminDashboard";
import { CashierDashboard } from "../features/dashboard/CashierDashboard";
import { ManagerDashboard } from "../features/dashboard/ManagerDashboard";
import { getEffectiveShopId } from "../lib/utils";
import { useAppStore } from "../stores/appStore";
import { useAuthStore } from "../stores/authStore";
import { useDataStore } from "../stores/dataStore";

const BlockedDashboard = ({ title, message }: { title: string; message: string }) => (
  <Card className="mt-6 rounded-lg p-6 shadow-sm">
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <span className="material-symbols-rounded text-4xl text-slate-400">store</span>
      <h2 className="text-lg font-semibold text-slate-700">{title}</h2>
      <p className="max-w-md text-sm text-slate-500">{message}</p>
    </div>
  </Card>
);

export const DashboardPage = () => {
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentUser = useDataStore((state) =>
    state.users.find((user) => user.id === currentUserId)
  );
  const shops = useDataStore((state) => state.shops);
  const { currentShopId } = useAppStore();

  if (!currentUser) {
    return (
      <BlockedDashboard
        title="Dashboard unavailable"
        message="Sign in again to load dashboard data."
      />
    );
  }

  if (currentUser.role === "ADMIN") {
    return <AdminDashboard currentUser={currentUser} shops={shops} />;
  }

  const effectiveShopId = getEffectiveShopId(currentUser, currentShopId, shops);
  if (!effectiveShopId) {
    return (
      <BlockedDashboard
        title="No shop assigned"
        message="Your account is not assigned to a shop, so there is no dashboard data to show. Contact your administrator."
      />
    );
  }

  if (currentUser.role === "CASHIER") {
    return (
      <CashierDashboard currentUser={currentUser} shopId={effectiveShopId} shops={shops} />
    );
  }

  return <ManagerDashboard currentUser={currentUser} shopId={effectiveShopId} shops={shops} />;
};
