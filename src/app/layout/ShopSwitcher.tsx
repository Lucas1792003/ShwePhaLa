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

  // No auto-pick. ADMIN must explicitly choose a shop via the dropdown
  // below; until they do, shop-scoped pages render a blocked state.
  // Non-admins are bound to their assigned shop, which is set elsewhere
  // (currentShopId is persisted from prior sessions; the shop-scoped
  // pages already key off `getEffectiveShopId`).

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
          onChange={(event) => setShopId(event.target.value || null)}
        >
          <option value="" disabled>
            Select a shop
          </option>
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
