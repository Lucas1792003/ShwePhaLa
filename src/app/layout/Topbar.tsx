import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { useAppStore } from "../../stores/appStore";
import { useDataStore } from "../../stores/dataStore";
import { Button } from "../../components/ui/Button";
import { ShopSwitcher } from "./ShopSwitcher";

export const Topbar = () => {
  const navigate = useNavigate();
  const { currentUserId, logout } = useAuthStore();
  const currentUser = useDataStore((state) => state.users.find((user) => user.id === currentUserId));
  const setShopId = useAppStore((state) => state.setShopId);

  const handleLogout = () => {
    logout();
    setShopId(null);
    navigate("/login");
  };

  return (
    <header className="print-hidden sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/80 px-6 py-4 backdrop-blur">
      <ShopSwitcher />
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="text-sm font-semibold text-slate-900">{currentUser?.name}</div>
          <div className="text-xs text-slate-500">{currentUser?.role}</div>
        </div>
        <Button variant="secondary" onClick={handleLogout}>
          Logout
        </Button>
      </div>
    </header>
  );
};
