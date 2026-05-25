import { useEffect, useState } from "react";
import type { CartItem } from "../../types";
import { cn, formatMmk } from "../../lib/utils";
import { resolveCategoryIconSymbol } from "../../features/categories/categoryIcons";
import {
  normalizeCartQuantityInput,
  type CartItemStockStatus,
} from "../../features/pos/cartStock";

interface CartItemRowProps {
  item: CartItem;
  onQtyChange: (id: string, delta: number) => void;
  onQtySet: (id: string, qty: number) => void;
  onRemove?: (id: string) => void;
  onDiscountChange?: (id: string, value: number) => void;
  onOverridePrice?: (item: CartItem) => void;
  stockStatus?: CartItemStockStatus;
}

export const CartItemRow = ({
  item,
  onQtyChange,
  onQtySet,
  onRemove,
  onOverridePrice,
  stockStatus,
}: CartItemRowProps) => {
  const [qtyInput, setQtyInput] = useState(String(item.qty));
  const isInvalid = Boolean(stockStatus?.exceedsStock) || item.qty < 1;
  const canIncrease = stockStatus ? stockStatus.canIncrease : true;

  useEffect(() => {
    setQtyInput(String(item.qty));
  }, [item.qty]);

  const handleQtyInputChange = (raw: string) => {
    const normalized = normalizeCartQuantityInput(raw);
    setQtyInput(normalized);
    if (normalized === "" || normalized === "0") return;
    onQtySet(item.id, Number(normalized));
  };

  const handleQtyInputBlur = () => {
    if (qtyInput === "" || qtyInput === "0") {
      setQtyInput(String(item.qty));
      return;
    }
    setQtyInput(String(item.qty));
  };

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border p-2",
        isInvalid ? "border-rose-200 bg-rose-50" : "border-transparent bg-slate-50"
      )}
    >
      {/* Product Image/Icon */}
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-slate-100 to-slate-200">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <span className="material-symbols-rounded text-2xl text-slate-400">
            {resolveCategoryIconSymbol(undefined, item.category)}
          </span>
        )}
      </div>

      {/* Product Info */}
      <div className="min-w-0 flex-1">
        <h4 className="truncate text-sm font-semibold text-slate-800">
          {item.name} {item.unitName ? `- ${item.unitName}` : ""}
        </h4>
        {item.priceLevelName && (
          // Show the price level chip next to the price so cashiers can
          // see at a glance which level the line was rung up at.
          <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-700">
            {item.priceLevelName}
          </p>
        )}
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-emerald-600">{formatMmk(item.unitPriceMmk)}</p>
          {onOverridePrice && (
            <button
              type="button"
              onClick={() => onOverridePrice(item)}
              className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
              title="Override price"
            >
              <span className="material-symbols-rounded text-base">edit</span>
            </button>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          {/* Stock + base-unit hints are only useful while editing the
              product itself — in the cart they're noise. Keep the red
              error variant so an over-quantity still surfaces inline. */}
          {stockStatus && isInvalid && (
            <span className="font-medium text-rose-600">
              {stockStatus.message ?? "Enter a quantity of at least 1."}
            </span>
          )}
        </div>
        {/* Per-line discount input intentionally hidden — the cart-level
            Discount % below the bill totals is the only discount input
            cashiers should reach. `itemDiscountPct` is still serialized
            on existing rows, so older sales render correctly. */}
      </div>

      {/* Quantity Controls */}
      <div className="flex flex-shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => onQtyChange(item.id, -1)}
          disabled={item.qty <= 1}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-100 text-rose-600 transition-colors hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="material-symbols-rounded text-lg">remove</span>
        </button>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={qtyInput}
          onChange={(event) => handleQtyInputChange(event.target.value)}
          onBlur={handleQtyInputBlur}
          aria-label={`Quantity for ${item.name}`}
          aria-invalid={isInvalid}
          className={cn(
            "h-8 w-12 rounded-lg border bg-white px-1 text-center text-sm font-bold outline-none focus:ring-2",
            isInvalid
              ? "border-rose-300 text-rose-700 focus:border-rose-400 focus:ring-rose-100"
              : "border-slate-200 text-slate-700 focus:border-emerald-400 focus:ring-emerald-100"
          )}
        />
        <button
          type="button"
          onClick={() => onQtyChange(item.id, 1)}
          disabled={!canIncrease}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 transition-colors hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="material-symbols-rounded text-lg">add</span>
        </button>
      </div>

      {/* Remove Button */}
      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="flex-shrink-0 text-xs font-medium text-rose-500 hover:text-rose-700"
        >
          Remove
        </button>
      )}
    </div>
  );
};
