import type { CartItem, ProductUnit } from "../../types";
import { normalizeAmountInput } from "../../lib/utils";

export const STOCK_OVERRIDE_REQUIRED_MESSAGE =
  "This exceeds available stock and requires stock override.";
export const STOCK_OVERRIDE_UI_REQUIRED_MESSAGE =
  "Stock override UI is needed before checkout.";

export type StockByProductId = Record<string, number>;

export interface CartItemStockStatus {
  stockQty: number;
  requestedQty: number;
  requestedUnits: number;
  otherRequestedUnits: number;
  remainingUnitsAfterItem: number;
  unitsPerItem: number;
  maxQty: number;
  canIncrease: boolean;
  atMax: boolean;
  nearStock: boolean;
  exceedsStock: boolean;
  message?: string;
}

export interface CartAddStockStatus {
  canAdd: boolean;
  stockQty: number;
  requestedUnits: number;
  remainingUnits: number;
  unitsPerItem: number;
  reason?: string;
}

export interface CartQuantityClampResult {
  qty: number;
  maxQty: number;
  clamped: boolean;
  blockedByStock: boolean;
}

export interface PosCartValidation {
  canCheckout: boolean;
  errors: string[];
  itemStatuses: Record<string, CartItemStockStatus>;
  isEmpty: boolean;
  requiresShift: boolean;
  hasInvalidQty: boolean;
  hasStockExcess: boolean;
}

interface PosCartValidationOptions {
  hasOpenShift: boolean;
  canOverrideStock: boolean;
  stockOverrideReasonFlowAvailable?: boolean;
}

const cleanNonNegativeInteger = (value: number | undefined): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value ?? 0));
};

const cleanPositiveInteger = (value: number | undefined, fallback = 1): number => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.trunc(value ?? fallback));
};

export const getOnlyInStockMessage = (stockQty: number) =>
  `Only ${cleanNonNegativeInteger(stockQty)} in stock for this shop.`;

export const normalizeCartQuantityInput = normalizeAmountInput;

export const getCartItemUnitsPerItem = (item: Partial<Pick<CartItem, "unitsPerItem" | "unitBaseQuantity">>): number =>
  cleanPositiveInteger(item.unitBaseQuantity ?? item.unitsPerItem);

export const getProductUnitsPerAdd = (unit?: Pick<ProductUnit, "baseQuantity">): number =>
  cleanPositiveInteger(unit?.baseQuantity);

export const getCartItemRequestedUnits = (item: Pick<CartItem, "qty" | "unitsPerItem">): number =>
  cleanNonNegativeInteger(item.qty) * getCartItemUnitsPerItem(item);

export const getRequestedUnitsByProduct = (items: CartItem[]): StockByProductId =>
  items.reduce<StockByProductId>((totals, item) => {
    totals[item.productId] = (totals[item.productId] ?? 0) + getCartItemRequestedUnits(item);
    return totals;
  }, {});

export const getCartItemStockStatus = (
  item: CartItem,
  items: CartItem[],
  stockByProductId: StockByProductId
): CartItemStockStatus => {
  const unitsPerItem = getCartItemUnitsPerItem(item);
  const requestedQty = cleanNonNegativeInteger(item.qty);
  const requestedUnits = requestedQty * unitsPerItem;

  // Non-stock items (services, pass-through) never touch inventory. Return
  // a status that mirrors "stock is fine, no warnings" so the cart row UI
  // (quantity caps, low-stock badges) stays out of the way.
  if (item.isNonStock) {
    return {
      stockQty: Number.POSITIVE_INFINITY,
      requestedQty,
      requestedUnits,
      otherRequestedUnits: 0,
      remainingUnitsAfterItem: Number.POSITIVE_INFINITY,
      unitsPerItem,
      maxQty: Number.POSITIVE_INFINITY,
      canIncrease: true,
      atMax: false,
      nearStock: false,
      exceedsStock: false,
    };
  }

  const stockQty = cleanNonNegativeInteger(stockByProductId[item.productId] ?? 0);
  const otherRequestedUnits = items
    .filter((cartItem) => cartItem.productId === item.productId && cartItem.id !== item.id)
    .reduce((sum, cartItem) => sum + getCartItemRequestedUnits(cartItem), 0);
  const availableUnitsForItem = Math.max(0, stockQty - otherRequestedUnits);
  const maxQty = Math.floor(availableUnitsForItem / unitsPerItem);
  const remainingUnitsAfterItem = stockQty - otherRequestedUnits - requestedUnits;
  const exceedsStock = requestedUnits > availableUnitsForItem;
  const canIncrease = requestedQty < maxQty;
  const atMax = maxQty > 0 && requestedQty >= maxQty;
  const nearStock = !exceedsStock && remainingUnitsAfterItem >= 0 && remainingUnitsAfterItem < unitsPerItem;

  return {
    stockQty,
    requestedQty,
    requestedUnits,
    otherRequestedUnits,
    remainingUnitsAfterItem,
    unitsPerItem,
    maxQty,
    canIncrease,
    atMax,
    nearStock,
    exceedsStock,
    message: exceedsStock || atMax || nearStock ? getOnlyInStockMessage(stockQty) : undefined,
  };
};

export const clampCartItemQuantity = (
  item: CartItem,
  items: CartItem[],
  stockByProductId: StockByProductId,
  requestedQty: number
): CartQuantityClampResult => {
  const nextQty = cleanPositiveInteger(requestedQty);
  const status = getCartItemStockStatus({ ...item, qty: nextQty }, items, stockByProductId);

  if (status.maxQty < 1) {
    return {
      qty: 1,
      maxQty: status.maxQty,
      clamped: nextQty !== 1 || status.exceedsStock,
      blockedByStock: true,
    };
  }

  if (nextQty > status.maxQty) {
    return {
      qty: status.maxQty,
      maxQty: status.maxQty,
      clamped: true,
      blockedByStock: true,
    };
  }

  return {
    qty: nextQty,
    maxQty: status.maxQty,
    clamped: false,
    blockedByStock: false,
  };
};

export const getCartAddStockStatus = (
  product: Pick<CartItem, "productId"> | { id: string },
  unitOrUsePack: Pick<ProductUnit, "baseQuantity"> | boolean | undefined,
  items: CartItem[],
  stockByProductId: StockByProductId,
  options?: { isNonStock?: boolean }
): CartAddStockStatus => {
  const productId = "id" in product ? product.id : product.productId;
  const unitsPerItem = typeof unitOrUsePack === "object"
    ? getProductUnitsPerAdd(unitOrUsePack)
    : getProductUnitsPerAdd();

  // Non-stock products always allow add. Return an infinite-stock status
  // so the cart row's stock badges / quantity clamps don't fire.
  if (options?.isNonStock) {
    return {
      canAdd: true,
      stockQty: Number.POSITIVE_INFINITY,
      requestedUnits: 0,
      remainingUnits: Number.POSITIVE_INFINITY,
      unitsPerItem,
    };
  }

  const stockQty = cleanNonNegativeInteger(stockByProductId[productId] ?? 0);
  const requestedUnits = getRequestedUnitsByProduct(items)[productId] ?? 0;
  const remainingUnits = stockQty - requestedUnits;
  const canAdd = remainingUnits >= unitsPerItem;

  return {
    canAdd,
    stockQty,
    requestedUnits,
    remainingUnits,
    unitsPerItem,
    reason: canAdd ? undefined : getOnlyInStockMessage(stockQty),
  };
};

export const validatePosCart = (
  items: CartItem[],
  stockByProductId: StockByProductId,
  options: PosCartValidationOptions
): PosCartValidation => {
  const itemStatuses = items.reduce<Record<string, CartItemStockStatus>>((statuses, item) => {
    statuses[item.id] = getCartItemStockStatus(item, items, stockByProductId);
    return statuses;
  }, {});

  const errors: string[] = [];
  const isEmpty = items.length === 0;
  const requiresShift = !options.hasOpenShift;
  const hasInvalidQty = items.some((item) => !Number.isInteger(item.qty) || item.qty < 1);
  const exceededItems = items.filter((item) => itemStatuses[item.id]?.exceedsStock);
  const hasStockExcess = exceededItems.length > 0;

  if (isEmpty) errors.push("Cart is empty.");
  if (requiresShift) errors.push("Open a shift before checkout.");
  if (hasInvalidQty) errors.push("Each cart item needs a valid quantity.");

  if (hasStockExcess) {
    if (options.canOverrideStock) {
      errors.push(
        options.stockOverrideReasonFlowAvailable
          ? STOCK_OVERRIDE_REQUIRED_MESSAGE
          : `${STOCK_OVERRIDE_REQUIRED_MESSAGE} ${STOCK_OVERRIDE_UI_REQUIRED_MESSAGE}`
      );
    } else {
      const firstExceeded = exceededItems[0];
      const stockQty = firstExceeded ? itemStatuses[firstExceeded.id]?.stockQty ?? 0 : 0;
      errors.push(getOnlyInStockMessage(stockQty));
    }
  }

  return {
    canCheckout: errors.length === 0,
    errors,
    itemStatuses,
    isEmpty,
    requiresShift,
    hasInvalidQty,
    hasStockExcess,
  };
};
