import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CartItem, Product } from "../types";
import { useAuthStore } from "../stores/authStore";
import { useAppStore } from "../stores/appStore";
import { useDataStore } from "../stores/dataStore";
import { Card } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { useToast } from "../components/ui/Toast";
import { ProductFinder } from "../components/pos/ProductFinder";
import { CartPanel } from "../components/pos/CartPanel";
import { PaymentModal } from "../components/pos/PaymentModal";
import { calculateCartTotals } from "../features/pos/service";
import { hasShopPermission } from "../lib/permissions";
import { getEffectiveShopId, toNumber } from "../lib/utils";

const packLabel = (product: Product) => (product.packSize ? `pack of ${product.packSize}` : undefined);

export const PosPage = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [barcodeInput, setBarcodeInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartDiscountPct, setCartDiscountPct] = useState(0);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [overrideItem, setOverrideItem] = useState<CartItem | null>(null);
  const [overridePrice, setOverridePrice] = useState(0);
  const [stockOverrideRequest, setStockOverrideRequest] = useState<{ product: Product; usePack: boolean } | null>(null);
  const [packMode, setPackMode] = useState(false);
  const [showBarcodeInput, setShowBarcodeInput] = useState(false);

  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentUser = useDataStore((state) => state.users.find((user) => user.id === currentUserId));
  const { currentShopId } = useAppStore();
  const shops = useDataStore((state) => state.shops);
  const products = useDataStore((state) => state.products);
  const categories = useDataStore((state) => state.categories);
  const getInventoryQty = useDataStore((state) => state.getInventoryQty);
  const getProductByBarcode = useDataStore((state) => state.getProductByBarcode);
  const createSale = useDataStore((state) => state.createSale);
  const startShift = useDataStore((state) => state.startShift);
  const shifts = useDataStore((state) => state.shifts);

  const shopId = getEffectiveShopId(currentUser, currentShopId, shops);
  const currentShop = shops.find((s) => s.id === shopId);
  const openShift = shifts.find((shift) => shift.shopId === shopId && shift.cashierId === currentUserId && !shift.endedAt);
  const canOverridePrice = hasShopPermission(currentUser, "pos:override_price", shopId);
  const canOverrideStock = hasShopPermission(currentUser, "pos:override_stock", shopId);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        if (cartItems.length > 0) setPaymentOpen(true);
      }
      if (event.key === "Escape") {
        setPaymentOpen(false);
        setOverrideItem(null);
        setStockOverrideRequest(null);
        setShowBarcodeInput(false);
      }
      // F3 to toggle barcode input
      if (event.key === "F3") {
        event.preventDefault();
        setShowBarcodeInput((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cartItems.length]);

  const filteredProducts = useMemo(() => {
    return products
      .filter((product) => product.isActive)
      .filter((product) => {
        const matchesSearch = product.name.toLowerCase().includes(search.toLowerCase());
        const matchesCategory = category === "all" || product.category === category;
        return matchesSearch && matchesCategory;
      });
  }, [products, search, category]);

  const inventoryById = useMemo(() => {
    const map: Record<string, number> = {};
    products.forEach((product) => {
      map[product.id] = getInventoryQty(shopId, product.id);
    });
    return map;
  }, [products, getInventoryQty, shopId]);

  const { subtotal, itemDiscount, cartDiscount, total } = calculateCartTotals(cartItems, cartDiscountPct);

  const handleAddToCart = (product: Product, usePack: boolean, overrideStock = false) => {
    const qtyBase = getInventoryQty(shopId, product.id);
    const unitsPerItem = usePack && product.packSize ? product.packSize : 1;
    const requiresOverride = qtyBase < unitsPerItem;
    if (requiresOverride && !overrideStock) {
      if (canOverrideStock) {
        setStockOverrideRequest({ product, usePack });
      } else {
        toast({ title: "Out of stock", description: "Insufficient stock for this item.", variant: "error" });
      }
      return;
    }
    const unitLabel = usePack && product.packSize ? packLabel(product) : "unit";
    setCartItems((items) => {
      const existing = items.find((item) => item.productId === product.id && item.unitsPerItem === unitsPerItem);
      if (existing) {
        return items.map((item) => (item.id === existing.id ? { ...item, qty: item.qty + 1 } : item));
      }
      return [
        ...items,
        {
          id: `${product.id}-${unitsPerItem}`,
          productId: product.id,
          name: product.name,
          qty: 1,
          unitPriceMmk: product.priceMmk,
          unitsPerItem,
          unitLabel,
          stockOverrideBy: requiresOverride && overrideStock ? currentUserId || undefined : undefined,
          // Display fields
          imageUrl: product.imageUrl,
          category: product.category,
        },
      ];
    });
  };

  const handleBarcodeSubmit = () => {
    const value = barcodeInput.trim();
    if (!value) return;
    const product = getProductByBarcode(value);
    if (!product) {
      toast({ title: "Barcode not found", description: value, variant: "error" });
      setBarcodeInput("");
      return;
    }
    handleAddToCart(product, packMode);
    setBarcodeInput("");
  };

  const handleQtyChange = (id: string, delta: number) => {
    setCartItems((items) =>
      items
        .map((item) => (item.id === id ? { ...item, qty: Math.max(1, item.qty + delta) } : item))
        .filter((item) => item.qty > 0)
    );
  };

  const handleCheckout = () => {
    if (submitting) return;
    if (!currentUser) return;
    if (currentUser.role === "CASHIER" && !openShift) {
      toast({ title: "Shift required", description: "Start a shift before checkout.", variant: "error" });
      return;
    }
    setPaymentOpen(true);
  };

  const handlePaymentConfirm = async (paymentMethod: "CASH" | "OTHER", paidMmk: number) => {
    if (!currentUser || submitting) return;
    setSubmitting(true);
    try {
      const shiftId =
        openShift?.id || (await startShift({ shopId, cashierId: currentUser.id, openingCashMmk: 0 }));
      const saleId = await createSale({
        shopId,
        cashierId: currentUser.id,
        shiftId,
        cartItems,
        cartDiscountPct,
        paymentMethod,
        paidMmk,
      });
      // Clear the cart and open the receipt only after the sale is committed.
      setCartItems([]);
      setCartDiscountPct(0);
      setPaymentOpen(false);
      navigate(`/app/sales/${saleId}`);
    } catch (error) {
      toast({
        title: "Checkout failed",
        description: error instanceof Error ? error.message : "Could not complete the sale.",
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleOverrideSave = () => {
    if (!overrideItem || !currentUserId) return;
    setCartItems((items) =>
      items.map((item) =>
        item.id === overrideItem.id
          ? { ...item, unitPriceMmk: overridePrice, priceOverriddenBy: currentUserId }
          : item
      )
    );
    setOverrideItem(null);
  };

  return (
    <div className="flex h-[calc(100vh-2rem)] flex-col gap-4">
      {/* Top Bar */}
      <div className="flex items-center justify-between rounded-2xl bg-white px-5 py-3 shadow-sm">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-slate-800">Point of Sale</h1>
          <Badge tone={openShift ? "green" : "amber"}>
            {openShift ? "Shift Open" : "No Shift"}
          </Badge>
        </div>
        <div className="flex items-center gap-4">
          {/* Barcode Toggle */}
          <button
            type="button"
            onClick={() => setShowBarcodeInput(!showBarcodeInput)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              showBarcodeInput
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <span className="material-symbols-rounded text-lg">qr_code_scanner</span>
            Barcode (F3)
          </button>
          {/* Shop Info */}
          <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2">
            <span className="material-symbols-rounded text-lg text-slate-500">store</span>
            <span className="text-sm font-medium text-slate-700">{currentShop?.name || "No Shop"}</span>
          </div>
        </div>
      </div>

      {/* Barcode Input (Collapsible) */}
      {showBarcodeInput && (
        <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-3 shadow-sm">
          <span className="material-symbols-rounded text-2xl text-slate-400">qr_code_scanner</span>
          <Input
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleBarcodeSubmit()}
            placeholder="Scan or enter barcode..."
            className="flex-1"
            autoFocus
          />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={packMode}
              onChange={(e) => setPackMode(e.target.checked)}
              className="rounded border-slate-300"
            />
            Pack mode
          </label>
          <Button onClick={handleBarcodeSubmit}>Add</Button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Products Section */}
        <Card className="flex-1 overflow-y-auto">
          <ProductFinder
            products={filteredProducts}
            categories={categories.filter((c) => c.isActive)}
            search={search}
            category={category}
            onSearch={setSearch}
            onCategory={setCategory}
            inventoryById={inventoryById}
            onAdd={(product, usePack) => handleAddToCart(product, usePack)}
          />
        </Card>

        {/* Cart Section */}
        <Card className="w-[320px] flex-shrink-0 xl:w-[380px]">
          <CartPanel
            items={cartItems}
            subtotal={subtotal}
            itemDiscount={itemDiscount}
            cartDiscount={cartDiscount}
            total={total}
            cartDiscountPct={cartDiscountPct}
            onDiscountChange={(id, value) =>
              setCartItems((items) => items.map((item) => (item.id === id ? { ...item, itemDiscountPct: value } : item)))
            }
            onQtyChange={handleQtyChange}
            onRemove={(id) => setCartItems((items) => items.filter((item) => item.id !== id))}
            onCartDiscountChange={setCartDiscountPct}
            onCheckout={handleCheckout}
            onOverridePrice={canOverridePrice ? (item) => { setOverrideItem(item); setOverridePrice(item.unitPriceMmk); } : undefined}
          />
        </Card>
      </div>

      <PaymentModal open={paymentOpen} onClose={() => setPaymentOpen(false)} totalMmk={total} onConfirm={handlePaymentConfirm} loading={submitting} />

      <Modal
        open={!!overrideItem}
        onClose={() => setOverrideItem(null)}
        title="Price override"
        description="Managers and admins can override unit price."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOverrideItem(null)}>
              Cancel
            </Button>
            <Button onClick={handleOverrideSave}>Apply override</Button>
          </>
        }
      >
        <Input
          type="number"
          value={overridePrice}
          onChange={(event) => setOverridePrice(toNumber(event.target.value))}
          placeholder="New unit price"
        />
      </Modal>

      <Modal
        open={!!stockOverrideRequest}
        onClose={() => setStockOverrideRequest(null)}
        title="Override out-of-stock"
        description="This item is out of stock. Override requires manager/admin confirmation."
        footer={
          <>
            <Button variant="secondary" onClick={() => setStockOverrideRequest(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (stockOverrideRequest) handleAddToCart(stockOverrideRequest.product, stockOverrideRequest.usePack, true);
                setStockOverrideRequest(null);
              }}
            >
              Override & add
            </Button>
          </>
        }
      >
        <div className="text-sm text-slate-500">
          Current stock: {stockOverrideRequest ? inventoryById[stockOverrideRequest.product.id] ?? 0 : 0} units
        </div>
      </Modal>
    </div>
  );
};
