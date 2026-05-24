import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  STOCK_OVERRIDE_REQUIRED_MESSAGE,
  STOCK_OVERRIDE_UI_REQUIRED_MESSAGE,
  clampCartItemQuantity,
  getCartAddStockStatus,
  getOnlyInStockMessage,
  getRequestedUnitsByProduct,
  validatePosCart,
} from "../features/pos/cartStock";
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
  const [packMode, setPackMode] = useState(false);
  const [showBarcodeInput, setShowBarcodeInput] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentUser = useDataStore((state) => state.users.find((user) => user.id === currentUserId));
  const { currentShopId } = useAppStore();
  const shops = useDataStore((state) => state.shops);
  const products = useDataStore((state) => state.products);
  const categories = useDataStore((state) => state.categories);
  const getInventoryQty = useDataStore((state) => state.getInventoryQty);
  const getProductByBarcode = useDataStore((state) => state.getProductByBarcode);
  const createSale = useDataStore((state) => state.createSale);
  const shifts = useDataStore((state) => state.shifts);

  const shopId = getEffectiveShopId(currentUser, currentShopId, shops);
  const currentShop = shops.find((s) => s.id === shopId);
  const hasShop = !!shopId;
  // Cart safety: if the operator switches the selected shop, drop the cart
  // so items rung up against shop A never check out against shop B. The
  // discount and override modal also reset for the same reason.
  useEffect(() => {
    setCartItems([]);
    setCartDiscountPct(0);
    setOverrideItem(null);
    setPaymentOpen(false);
  }, [shopId]);
  const openShift = shifts.find((shift) => shift.shopId === shopId && shift.cashierId === currentUserId && !shift.endedAt);
  const canOverridePrice = hasShopPermission(currentUser, "pos:override_price", shopId);
  const canOverrideStock = hasShopPermission(currentUser, "pos:override_stock", shopId);

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

  const cartUnitsByProductId = useMemo(() => getRequestedUnitsByProduct(cartItems), [cartItems]);

  const cartValidation = useMemo(
    () =>
      validatePosCart(cartItems, inventoryById, {
        hasOpenShift: Boolean(openShift),
        canOverrideStock,
      }),
    [cartItems, canOverrideStock, inventoryById, openShift]
  );

  const { subtotal, itemDiscount, cartDiscount, total } = calculateCartTotals(cartItems, cartDiscountPct);
  const firstCartError = cartValidation.errors[0];
  const checkoutHelper = !openShift ? "Open a shift before checkout." : firstCartError;
  const stockOverrideUnavailableMessage = `${STOCK_OVERRIDE_REQUIRED_MESSAGE} ${STOCK_OVERRIDE_UI_REQUIRED_MESSAGE}`;
  const paymentValidationError = paymentOpen && !cartValidation.canCheckout ? firstCartError : undefined;

  const getStockBlockDescription = useCallback(
    (stockQty: number) => (canOverrideStock ? stockOverrideUnavailableMessage : getOnlyInStockMessage(stockQty)),
    [canOverrideStock, stockOverrideUnavailableMessage]
  );

  const showCartValidationToast = useCallback(
    (title = "Checkout blocked") => {
      toast({
        title,
        description: firstCartError ?? "Review the cart before checkout.",
        variant: "error",
      });
    },
    [firstCartError, toast]
  );

  const handleAddToCart = (product: Product, usePack: boolean): boolean => {
    const addStatus = getCartAddStockStatus(product, usePack, cartItems, inventoryById);
    const unitsPerItem = addStatus.unitsPerItem;
    if (!addStatus.canAdd) {
      toast({
        title: usePack ? "Not enough stock for pack" : addStatus.stockQty <= 0 ? "Out of stock" : "Stock limit reached",
        description: getStockBlockDescription(addStatus.stockQty),
        variant: "error",
      });
      return false;
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
          // Display fields
          imageUrl: product.imageUrl,
          category: product.category,
        },
      ];
    });
    return true;
  };

  // Keep the scan input ready for the next scan: clear value and refocus so
  // a scanner's next Enter-terminated burst still lands here even if a click
  // (e.g. the "Add" button) briefly stole focus.
  const resetBarcodeInputForNextScan = () => {
    setBarcodeInput("");
    barcodeInputRef.current?.focus();
  };

  const handleBarcodeSubmit = () => {
    const value = barcodeInput.trim();
    if (!value) return;
    const product = getProductByBarcode(value);
    if (!product) {
      toast({ title: "Barcode not found", description: value, variant: "error" });
      resetBarcodeInputForNextScan();
      return;
    }
    const added = handleAddToCart(product, packMode);
    if (added) {
      toast({ title: `Added ${product.name}`, variant: "success" });
    }
    resetBarcodeInputForNextScan();
  };

  const applyCartQuantity = (id: string, requestedQty: number) => {
    const currentItem = cartItems.find((item) => item.id === id);
    if (!currentItem) return;
    const result = clampCartItemQuantity(currentItem, cartItems, inventoryById, requestedQty);
    if (result.blockedByStock && requestedQty > result.qty) {
      toast({
        title: "Stock limit reached",
        description: getStockBlockDescription(inventoryById[currentItem.productId] ?? 0),
        variant: "error",
      });
    }
    setCartItems((items) =>
      items.map((item) => (item.id === id ? { ...item, qty: result.qty } : item))
    );
  };

  const handleQtyChange = (id: string, delta: number) => {
    const currentItem = cartItems.find((item) => item.id === id);
    if (!currentItem) return;
    applyCartQuantity(id, currentItem.qty + delta);
  };

  const handleQtySet = (id: string, qty: number) => {
    applyCartQuantity(id, qty);
  };

  const handleCheckout = useCallback(() => {
    if (submitting) return;
    if (!currentUser) {
      toast({ title: "Checkout blocked", description: "Sign in before checkout.", variant: "error" });
      return;
    }
    if (!cartValidation.canCheckout) {
      showCartValidationToast();
      return;
    }
    setPaymentOpen(true);
  }, [cartValidation.canCheckout, currentUser, showCartValidationToast, submitting, toast]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        handleCheckout();
      }
      if (event.key === "Escape") {
        setPaymentOpen(false);
        setOverrideItem(null);
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
  }, [handleCheckout]);

  const handlePaymentConfirm = async (paymentMethod: "CASH" | "OTHER", paidMmk: number) => {
    if (!currentUser || submitting) return;
    if (!cartValidation.canCheckout || !openShift) {
      showCartValidationToast("Payment blocked");
      return;
    }
    setSubmitting(true);
    try {
      const saleId = await createSale({
        shopId,
        cashierId: currentUser.id,
        shiftId: openShift.id,
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

  if (!hasShop) {
    return (
      <Card className="mt-6">
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="material-symbols-rounded text-4xl text-slate-400">store</span>
          <h2 className="text-lg font-semibold text-slate-700">No shop selected</h2>
          <p className="text-sm text-slate-500 max-w-md">
            Select a shop to use POS. Sales and inventory are shop-specific.
            {currentUser?.role === "ADMIN"
              ? " Pick a shop from the switcher at the top of the page."
              : " Contact your administrator if you have not been assigned to a shop."}
          </p>
        </div>
      </Card>
    );
  }

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
            ref={barcodeInputRef}
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleBarcodeSubmit();
              }
            }}
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
            cartUnitsByProductId={cartUnitsByProductId}
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
            onQtySet={handleQtySet}
            onRemove={(id) => setCartItems((items) => items.filter((item) => item.id !== id))}
            onCartDiscountChange={setCartDiscountPct}
            onCheckout={handleCheckout}
            onOverridePrice={canOverridePrice ? (item) => { setOverrideItem(item); setOverridePrice(item.unitPriceMmk); } : undefined}
            stockStatuses={cartValidation.itemStatuses}
            checkoutDisabled={!cartValidation.canCheckout || submitting}
            checkoutHelper={checkoutHelper}
          />
        </Card>
      </div>

      <PaymentModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        totalMmk={total}
        onConfirm={handlePaymentConfirm}
        loading={submitting}
        validationError={paymentValidationError}
      />

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

    </div>
  );
};
