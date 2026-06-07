import { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "../stores/authStore";
import { useAppStore } from "../stores/appStore";
import { useDataStore } from "../stores/dataStore";
import { PageHeader } from "../components/layout/PageHeader";
import { Card } from "../components/ui/Card";
import { Tabs } from "../components/ui/Tabs";
import { Select } from "../components/ui/Select";
import { Pagination } from "../components/ui/Pagination";
import { SearchInput } from "../components/forms/SearchInput";
import { DateRangePicker } from "../components/forms/DateRangePicker";
import { InventoryTable } from "../components/inventory/InventoryTable";
import { MovementsTable } from "../components/inventory/MovementsTable";
import { AdjustStockModal } from "../components/inventory/AdjustStockModal";
import { Button } from "../components/ui/Button";
import { downloadCsv } from "../lib/csv";
import { hasPermission } from "../lib/permissions";
import { CategoryFilter } from "../features/categories/CategoryFilter";
import { formatDateTime, getEffectiveShopId } from "../lib/utils";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export const InventoryPage = () => {
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentUser = useDataStore((state) => state.users.find((user) => user.id === currentUserId));
  const { currentShopId } = useAppStore();
  const shops = useDataStore((state) => state.shops);
  const products = useDataStore((state) => state.products);
  const categories = useDataStore((state) => state.categories);
  const inventory = useDataStore((state) => state.inventory);
  const movements = useDataStore((state) => state.movements);
  const productUnits = useDataStore((state) => state.productUnits);
  const adjustStock = useDataStore((state) => state.adjustStock);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [activeTab, setActiveTab] = useState("stock");
  const [adjustProductId, setAdjustProductId] = useState<string | null>(null);
  const [movementSearch, setMovementSearch] = useState("");
  const [range, setRange] = useState({ start: "", end: "" });

  // Pagination state
  const [stockPage, setStockPage] = useState(1);
  const [stockPageSize, setStockPageSize] = useState(10);
  const [movementPage, setMovementPage] = useState(1);
  const [movementPageSize, setMovementPageSize] = useState(10);

  const shopId = getEffectiveShopId(currentUser, currentShopId, shops);
  const hasShop = !!shopId;

  // Permission gating: stock availability is broadly visible, but movement
  // history and manual adjustment are restricted (cashiers see stock only).
  // Manual adjustment is additionally gated on having a shop selected — the
  // backend `adjust_stock` RPC rejects null/empty shop_id, and we don't want
  // an admin with no shop selected to even reach the modal.
  const canViewMovements = hasPermission(currentUser, "inventory:view_movements");
  const canAdjust = hasPermission(currentUser, "inventory:adjust") && hasShop;
  const effectiveTab = activeTab === "movements" && !canViewMovements ? "stock" : activeTab;

  const stockRows = useMemo(() => {
    return products
      .filter((product) => product.name.toLowerCase().includes(search.toLowerCase()))
      .filter((product) => category === "all" || product.category === category)
      .map((product) => {
        const record = inventory.find((item) => item.shopId === shopId && item.productId === product.id);
        const qty = record?.qtyBaseUnits ?? 0;
        const productMovements = movements.filter((movement) => movement.shopId === shopId && movement.productId === product.id);
        const lastMovement = productMovements[0]?.createdAt ?? "";
        return { product, qty, lastMovement };
      });
  }, [products, inventory, movements, search, category, shopId]);

  const filteredMovements = useMemo(() => {
    return movements.filter((movement) => {
      if (movement.shopId !== shopId) return false;
      const product = products.find((item) => item.id === movement.productId);
      const matchesSearch = product?.name.toLowerCase().includes(movementSearch.toLowerCase()) ?? false;
      const movementDate = movement.createdAt.slice(0, 10);
      const afterStart = !range.start || movementDate >= range.start;
      const beforeEnd = !range.end || movementDate <= range.end;
      return matchesSearch && afterStart && beforeEnd;
    });
  }, [movements, shopId, products, movementSearch, range]);

  // Reset page when filters change
  useEffect(() => { setStockPage(1); }, [search, category]);
  useEffect(() => { setMovementPage(1); }, [movementSearch, range]);

  // Paginated data
  const stockTotalPages = Math.max(1, Math.ceil(stockRows.length / stockPageSize));
  const paginatedStockRows = stockRows.slice((stockPage - 1) * stockPageSize, stockPage * stockPageSize);

  const movementTotalPages = Math.max(1, Math.ceil(filteredMovements.length / movementPageSize));
  const paginatedMovements = filteredMovements.slice((movementPage - 1) * movementPageSize, movementPage * movementPageSize);

  const exportInventory = () => {
    const rows = stockRows.map(({ product, qty, lastMovement }) => ({
      product: product.name,
      category: product.category,
      qtyBaseUnits: qty,
      lastMovement: lastMovement ? formatDateTime(lastMovement) : "",
    }));
    downloadCsv("inventory.csv", rows);
  };

  return (
    <Card>
      <PageHeader
        title="Inventory"
        subtitle="Track on-hand and adjustments."
        actions={<Button variant="secondary" onClick={exportInventory}>Export CSV</Button>}
      />

      {!hasShop && (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-600">
          Select a shop before adjusting inventory. On-hand stock and movements
          are shop-specific.
          {currentUser?.role === "ADMIN"
            ? " Pick one from the shop switcher at the top of the page."
            : " Contact your administrator if you have not been assigned to a shop."}
        </div>
      )}

      <div className="mt-6">
        <Tabs
          tabs={[
            { id: "stock", label: "Stock" },
            ...(canViewMovements ? [{ id: "movements", label: "Movements" }] : []),
          ]}
          active={effectiveTab}
          onChange={setActiveTab}
        />
      </div>

      {effectiveTab === "stock" && (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput value={search} onChange={setSearch} placeholder="Search product" />
            <div className="ml-auto flex items-center gap-2">
              <span className="text-sm text-slate-500">Show:</span>
              <Select value={stockPageSize} onChange={(e) => { setStockPageSize(Number(e.target.value)); setStockPage(1); }}>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </Select>
            </div>
          </div>
          {/* Category filter — shared icon-chip filter (no native dropdown) */}
          <CategoryFilter
            categories={categories}
            selectedCategory={category}
            onChange={setCategory}
          />
          <InventoryTable
            rows={paginatedStockRows}
            productUnits={productUnits}
            categories={categories}
            onAdjust={canAdjust ? setAdjustProductId : undefined}
          />
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">
              Showing {((stockPage - 1) * stockPageSize) + 1}-{Math.min(stockPage * stockPageSize, stockRows.length)} of {stockRows.length} products
            </span>
            <Pagination page={stockPage} totalPages={stockTotalPages} onChange={setStockPage} />
          </div>
        </div>
      )}

      {effectiveTab === "movements" && canViewMovements && (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput value={movementSearch} onChange={setMovementSearch} placeholder="Filter by product" />
            <DateRangePicker start={range.start} end={range.end} onChange={setRange} />
            <div className="ml-auto flex items-center gap-2">
              <span className="text-sm text-slate-500">Show:</span>
              <Select value={movementPageSize} onChange={(e) => { setMovementPageSize(Number(e.target.value)); setMovementPage(1); }}>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </Select>
            </div>
          </div>
          {filteredMovements.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300/70 bg-slate-50/60 p-6 text-center text-sm text-slate-500">
              No movements yet.
            </div>
          ) : (
            <>
              <MovementsTable movements={paginatedMovements} products={products} />
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">
                  Showing {((movementPage - 1) * movementPageSize) + 1}-{Math.min(movementPage * movementPageSize, filteredMovements.length)} of {filteredMovements.length} movements
                </span>
                <Pagination page={movementPage} totalPages={movementTotalPages} onChange={setMovementPage} />
              </div>
            </>
          )}
        </div>
      )}

      <AdjustStockModal
        open={!!adjustProductId}
        onClose={() => setAdjustProductId(null)}
        product={adjustProductId ? products.find((p) => p.id === adjustProductId) ?? null : null}
        productUnits={productUnits}
        onSave={async ({ type, qtyChange, reason, productUnitId, unitQty }) => {
          if (!adjustProductId || !currentUserId) return;
          try {
            await adjustStock({
              shopId,
              productId: adjustProductId,
              type,
              qtyChange,
              reason: reason || "Manual adjustment",
              actorId: currentUserId,
              productUnitId,
              unitQty,
            });
            setAdjustProductId(null);
          } catch (error) {
            alert(error instanceof Error ? error.message : "Failed to adjust stock");
          }
        }}
      />
    </Card>
  );
};
