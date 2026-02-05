import { useEffect } from "react";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";
import { useDataStore } from "../../stores/dataStore";
import { Select } from "../ui/Select";
import { getEffectiveShopId } from "../../lib/utils";

export const ShopSwitcher = () => {
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentUser = useDataStore((state) => state.users.find((user) => user.id === currentUserId));
  const shops = useDataStore((state) => state.shops);
  const { currentShopId, setShopId } = useAppStore();

  useEffect(() => {
    if (!currentUser || currentUser.role !== "ADMIN") return;
    if (!currentShopId && shops.length > 0) setShopId(shops[0].id);
  }, [currentUser, currentShopId, shops, setShopId]);

  const effectiveShopId = getEffectiveShopId(currentUser, currentShopId, shops);
  const activeShop = shops.find((shop) => shop.id === effectiveShopId);

  if (!currentUser) return null;

  return (
    <div className="flex items-center gap-3">
      <div>
        <div className="text-lg font-semibold">{activeShop?.name || "Select a shop"}</div>
        <div className="text-xs text-slate-500">{activeShop?.address}</div>
      </div>
      {currentUser.role === "ADMIN" && (
        <Select value={currentShopId ?? ""} onChange={(event) => setShopId(event.target.value)}>
          {shops.map((shop) => (
            <option key={shop.id} value={shop.id}>
              {shop.code} - {shop.name}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
};
