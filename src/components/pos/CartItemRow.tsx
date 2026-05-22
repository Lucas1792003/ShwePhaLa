import type { CartItem } from "../../types";
import { formatMmk, toNumber } from "../../lib/utils";
import { resolveCategoryIconSymbol } from "../../features/categories/categoryIcons";

interface CartItemRowProps {
  item: CartItem;
  onQtyChange: (id: string, delta: number) => void;
  onRemove?: (id: string) => void;
  onDiscountChange?: (id: string, value: number) => void;
  onOverridePrice?: (item: CartItem) => void;
}

export const CartItemRow = ({ item, onQtyChange, onRemove, onDiscountChange, onOverridePrice }: CartItemRowProps) => (
  <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-2">
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
    <div className="flex-1 min-w-0">
      <h4 className="truncate text-sm font-semibold text-slate-800">{item.name}</h4>
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
      {onDiscountChange && (
        <label className="mt-1 flex items-center gap-1 text-xs text-slate-500">
          Disc
          <input
            type="number"
            min={0}
            max={100}
            value={item.itemDiscountPct ?? ""}
            onChange={(event) => onDiscountChange(item.id, toNumber(event.target.value))}
            className="h-6 w-14 rounded-md border border-slate-200 bg-white px-1 text-center text-xs outline-none focus:border-emerald-400"
            placeholder="0"
          />
          %
        </label>
      )}
    </div>

    {/* Quantity Controls */}
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onQtyChange(item.id, 1)}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 transition-colors hover:bg-emerald-200"
      >
        <span className="material-symbols-rounded text-lg">add</span>
      </button>
      <span className="w-8 text-center text-sm font-bold text-slate-700">{item.qty.toString().padStart(2, "0")}</span>
      <button
        type="button"
        onClick={() => onQtyChange(item.id, -1)}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-100 text-rose-600 transition-colors hover:bg-rose-200"
      >
        <span className="material-symbols-rounded text-lg">remove</span>
      </button>
    </div>

    {/* Remove Button */}
    {onRemove && (
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        className="text-xs font-medium text-rose-500 hover:text-rose-700"
      >
        Remove
      </button>
    )}
  </div>
);
