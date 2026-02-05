import { useEffect } from "react";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";
import { useDataStore } from "../../stores/dataStore";
import { Select } from "../../components/ui/Select";
import { cn, getEffectiveShopId } from "../../lib/utils";

interface ShopSwitcherProps {
  className?: string;
}

export const ShopSwitcher = ({ className }: ShopSwitcherProps) => {
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentUser = useDataStore((state) => state.users.find((user) => user.id === currentUserId));
  const shops = useDataStore((state) => state.shops);
  const { currentShopId, setShopId } = useAppStore();

  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.role === "ADMIN" && !currentShopId && shops.length > 0) setShopId(shops[0].id);
    if (currentUser.role !== "ADMIN" && currentUser.shopId) setShopId(currentUser.shopId);
  }, [currentUser, currentShopId, shops, setShopId]);

  const effectiveShopId = getEffectiveShopId(currentUser, currentShopId, shops);
  const activeShop = shops.find((shop) => shop.id === effectiveShopId);

  if (!currentUser) return null;

  return (
    <div className={cn("shop-switcher", className)}>
      <div>
        <div className="shop-title">{activeShop?.name || "Select a shop"}</div>
        <div className="shop-subtitle">{activeShop?.address}</div>
      </div>
      {currentUser.role === "ADMIN" && (
        <Select
          className="shop-select"
          value={currentShopId ?? ""}
          onChange={(event) => setShopId(event.target.value)}
        >
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
