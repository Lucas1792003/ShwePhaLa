import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CartItem, Product, ProductUnit } from "../types";
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
  getActivePriceLevels,
  getDefaultPriceLevel,
  resolveProductUnitPrice,
} from "../features/pricing/priceLevels";
import { Select } from "../components/ui/Select";
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
import { getEffectiveShopId } from "../lib/utils";

export const PosPage = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [barcodeInput, setBarcodeInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  // Brand sub-filter, scoped to whichever category is currently selected.
  // Reset to empty whenever the category changes — see the effect below.
  const [brandId, setBrandId] = useState<string>("");
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartDiscountPct, setCartDiscountPct] = useState(0);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [overrideItem, setOverrideItem] = useState<CartItem | null>(null);
  const [overridePriceLevelId, setOverridePriceLevelId] = useState("");
  // Open Price prompt — fires when an Open-Price product is added to the
  // cart. Holds the product + selected unit until the cashier confirms
  // the price, then completes the add. The prompt is the only entry path
  // for Open Price items; we never accept the resolved price for them.
  const [openPricePrompt, setOpenPricePrompt] = useState<{ product: Product; unit: ProductUnit } | null>(null);
  const [openPriceInput, setOpenPriceInput] = useState<string>("");
  const [showBarcodeInput, setShowBarcodeInput] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  // Selected POS price level. Newly added cart lines use this level.
  // Existing lines keep whatever level they were rung up at (per spec
  // — switching POS-level should not silently re-price a started cart).
  const [activePriceLevelId, setActivePriceLevelId] = useState<string>("");

  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentUser = useDataStore((state) => state.users.find((user) => user.id === currentUserId));
  const { currentShopId } = useAppStore();
  const shops = useDataStore((state) => state.shops);
  const products = useDataStore((state) => state.products);
  const productUnits = useDataStore((state) => state.productUnits);
  const priceLevels = useDataStore((state) => state.priceLevels);
  const productUnitPrices = useDataStore((state) => state.productUnitPrices);
  const categories = useDataStore((state) => state.categories);
  const brands = useDataStore((state) => state.brands);
  const getInventoryQty = useDataStore((state) => state.getInventoryQty);
  const getProductByBarcode = useDataStore((state) => state.getProductByBarcode);
  const createSale = useDataStore((state) => state.createSale);
  const shifts = useDataStore((state) => state.shifts);

  const activePriceLevels = useMemo(() => getActivePriceLevels(priceLevels), [priceLevels]);
  // Pin the dropdown to the default (Retail) level whenever it loads /
  // becomes available. Cashier can still switch it manually.
  useEffect(() => {
    if (activePriceLevelId) return;
    const next = getDefaultPriceLevel(priceLevels) ?? activePriceLevels[0];
    if (next) setActivePriceLevelId(next.id);
  }, [activePriceLevelId, activePriceLevels, priceLevels]);

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

  // Reset the brand sub-filter whenever the category changes so a stale
  // brand never silently constrains a different category's results.
  useEffect(() => {
    setBrandId("");
  }, [category]);

  const filteredProducts = useMemo(() => {
    return products
      .filter((product) => product.isActive)
      .filter((product) => {
        const matchesSearch = product.name.toLowerCase().includes(search.toLowerCase());
        const matchesCategory = category === "all" || product.category === category;
        const matchesBrand = !brandId || product.brandId === brandId;
        return matchesSearch && matchesCategory && matchesBrand;
      });
  }, [products, search, category, brandId]);

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

  // Inner helper: actually push the row into the cart. Split out so the
  // Open Price prompt can call it with the cashier-supplied price after
  // confirmation, without the prompt being part of the public callable
  // surface for barcode scans and the product-grid Add button.
  const addLineToCart = (
    product: Product,
    unit: ProductUnit,
    unitPriceMmk: number,
    options: {
      priceLevelId: string;
      priceLevelName: string;
      unitsPerItem: number;
      isOpenPrice: boolean;
      isNonStock: boolean;
    },
  ) => {
    setCartItems((items) => {
      // Cart uniqueness is `productId + productUnitId + priceLevelId` for
      // fixed-price items so the same product+unit can appear once at
      // Retail and once at Wholesale. Open Price items get a unique id
      // every time so two cashier-entered prices for the same product
      // don't merge into one line.
      const sharedKey = options.isOpenPrice
        ? `${product.id}-${unit.id}-open-${Date.now()}`
        : `${product.id}-${unit.id}-${options.priceLevelId}`;
      if (!options.isOpenPrice) {
        const existing = items.find(
          (item) =>
            item.productId === product.id &&
            item.productUnitId === unit.id &&
            item.priceLevelId === options.priceLevelId,
        );
        if (existing) {
          return items.map((item) =>
            item.id === existing.id ? { ...item, qty: item.qty + 1 } : item,
          );
        }
      }
      return [
        ...items,
        {
          id: sharedKey,
          productId: product.id,
          productUnitId: unit.id,
          name: product.name,
          unitName: unit.name,
          qty: 1,
          unitPriceMmk,
          priceLevelId: options.priceLevelId,
          priceLevelName: options.priceLevelName,
          unitBaseQuantity: unit.baseQuantity,
          unitsPerItem: options.unitsPerItem,
          unitLabel: unit.name,
          isOpenPrice: options.isOpenPrice,
          isNonStock: options.isNonStock,
          imageUrl: product.imageUrl,
          category: product.category,
        },
      ];
    });
  };

  const handleAddToCart = (product: Product, unit: ProductUnit): boolean => {
    const isNonStock = Boolean(product.isNonStock);
    const isOpenPrice = Boolean(product.isOpenPrice);

    // Non-stock items skip stock checks entirely. Stock-tracked items go
    // through the usual stock-availability gate before we even ask the
    // cashier for a price (no point prompting if it can't be added).
    const addStatus = getCartAddStockStatus(product, unit, cartItems, inventoryById, {
      isNonStock,
    });
    const unitsPerItem = addStatus.unitsPerItem;
    if (!addStatus.canAdd) {
      toast({
        title: addStatus.stockQty <= 0 ? "Out of stock" : "Stock limit reached",
        description: getStockBlockDescription(addStatus.stockQty),
        variant: "error",
      });
      return false;
    }

    // Open Price branch — defer the add until the cashier confirms the
    // price in the modal. The actual cart push happens in
    // `handleOpenPriceConfirm`. The default level metadata is used for
    // labelling only; the server treats Open Price as its own source.
    if (isOpenPrice) {
      setOpenPricePrompt({ product, unit });
      setOpenPriceInput("");
      return true;
    }

    // Standard path: resolve the price for the current POS price level.
    // The server re-resolves in `complete_sale` so a stale value here
    // can't cause an under- or over-charge.
    const resolved = resolveProductUnitPrice({
      unit,
      priceLevelId: activePriceLevelId,
      shopId: shopId ?? undefined,
      priceLevels,
      productUnitPrices,
    });
    addLineToCart(product, unit, resolved.priceMmk, {
      priceLevelId: resolved.priceLevelId,
      priceLevelName: resolved.priceLevelName,
      unitsPerItem,
      isOpenPrice: false,
      isNonStock,
    });
    return true;
  };

  const handleOpenPriceConfirm = () => {
    if (!openPricePrompt) return;
    const value = Number(openPriceInput.replace(/[^\d]/g, ""));
    if (!Number.isFinite(value) || value <= 0) {
      toast({
        title: "Invalid price",
        description: "Enter a price greater than 0.",
        variant: "error",
      });
      return;
    }
    const { product, unit } = openPricePrompt;
    // For labelling only. The price level snapshot keeps a sensible
    // default-level name on the receipt; complete_sale never resolves a
    // fallback price for is_open_price items.
    const defaultLevel = getDefaultPriceLevel(priceLevels) ?? priceLevels[0];
    addLineToCart(product, unit, Math.trunc(value), {
      priceLevelId: defaultLevel?.id ?? "",
      priceLevelName: defaultLevel?.name ?? "Open",
      unitsPerItem: unit.baseQuantity,
      isOpenPrice: true,
      isNonStock: Boolean(product.isNonStock),
    });
    setOpenPricePrompt(null);
    setOpenPriceInput("");
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
    const match = getProductByBarcode(value);
    if (!match) {
      toast({ title: "Barcode not found", description: value, variant: "error" });
      resetBarcodeInputForNextScan();
      return;
    }
    const added = handleAddToCart(match.product, match.unit);
    if (added) {
      toast({ title: `Added ${match.product.name} - ${match.unit.name}`, variant: "success" });
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
    if (!overrideItem) return;
    const unit = productUnits.find((item) => item.id === overrideItem.productUnitId);
    if (!unit) {
      toast({
        title: "Price level unavailable",
        description: "Could not find this product unit. Remove and add the item again.",
        variant: "error",
      });
      return;
    }

    const resolved = resolveProductUnitPrice({
      unit,
      priceLevelId: overridePriceLevelId || overrideItem.priceLevelId || activePriceLevelId,
      shopId: shopId ?? undefined,
      priceLevels,
      productUnitPrices,
    });

    setCartItems((items) => {
      const duplicate = items.find(
        (item) =>
          item.id !== overrideItem.id &&
          !item.isOpenPrice &&
          item.productId === overrideItem.productId &&
          item.productUnitId === overrideItem.productUnitId &&
          item.priceLevelId === resolved.priceLevelId,
      );

      if (duplicate) {
        return items
          .filter((item) => item.id !== overrideItem.id)
          .map((item) =>
            item.id === duplicate.id
              ? {
                  ...item,
                  qty: item.qty + overrideItem.qty,
                  unitPriceMmk: resolved.priceMmk,
                  priceLevelId: resolved.priceLevelId,
                  priceLevelName: resolved.priceLevelName,
                  priceOverriddenBy: undefined,
                }
              : item,
          );
      }

      return items.map((item) =>
        item.id === overrideItem.id
          ? {
              ...item,
              unitPriceMmk: resolved.priceMmk,
              priceLevelId: resolved.priceLevelId,
              priceLevelName: resolved.priceLevelName,
              priceOverriddenBy: undefined,
            }
          : item,
      );
    });
    setOverrideItem(null);
    setOverridePriceLevelId("");
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
            brands={brands}
            search={search}
            category={category}
            brandId={brandId}
            onSearch={setSearch}
            onCategory={setCategory}
            onBrand={setBrandId}
            inventoryById={inventoryById}
            cartUnitsByProductId={cartUnitsByProductId}
            productUnits={productUnits}
            onAdd={handleAddToCart}
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
            onOverridePrice={
              canOverridePrice
                ? (item) => {
                    setOverrideItem(item);
                    setOverridePriceLevelId(item.priceLevelId || activePriceLevelId);
                  }
                : undefined
            }
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
        onClose={() => {
          setOverrideItem(null);
          setOverridePriceLevelId("");
        }}
        title="Change price level"
        description="Choose one of the configured price levels for this cart line."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setOverrideItem(null);
                setOverridePriceLevelId("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleOverrideSave} disabled={activePriceLevels.length === 0}>
              Apply price level
            </Button>
          </>
        }
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Price level</label>
          <Select
            value={overridePriceLevelId}
            onChange={(event) => setOverridePriceLevelId(event.target.value)}
            autoFocus
          >
            {activePriceLevels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.name}{level.isDefault ? " (default)" : ""}
              </option>
            ))}
          </Select>
        </div>
      </Modal>

      <Modal
        open={!!openPricePrompt}
        onClose={() => {
          setOpenPricePrompt(null);
          setOpenPriceInput("");
        }}
        title="Enter price"
        description={
          openPricePrompt
            ? `${openPricePrompt.product.name} (${openPricePrompt.unit.name}) is an Open Price item. Enter the price the customer is paying for this unit.`
            : ""
        }
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setOpenPricePrompt(null);
                setOpenPriceInput("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleOpenPriceConfirm}>Add to cart</Button>
          </>
        }
      >
        <Input
          autoFocus
          inputMode="numeric"
          value={openPriceInput}
          onChange={(event) =>
            setOpenPriceInput(event.target.value.replace(/[^\d]/g, ""))
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleOpenPriceConfirm();
            }
          }}
          placeholder="Unit price (MMK)"
        />
      </Modal>

    </div>
  );
};
