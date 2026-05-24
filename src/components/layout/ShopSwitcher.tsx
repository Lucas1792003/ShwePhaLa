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

  // No auto-pick. ADMIN must explicitly choose a shop via the dropdown;
  // until they do, shop-scoped pages render a blocked state. See
  // `getEffectiveShopId` for the full contract.

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
        <Select value={currentShopId ?? ""} onChange={(event) => setShopId(event.target.value || null)}>
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
