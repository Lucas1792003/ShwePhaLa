import type { CartItem } from "../../types";
import { CartItemRow } from "./CartItemRow";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { formatMmk, toNumber } from "../../lib/utils";

interface CartPanelProps {
  items: CartItem[];
  subtotal: number;
  itemDiscount: number;
  cartDiscount: number;
  total: number;
  cartDiscountPct: number;
  onDiscountChange: (id: string, value: number) => void;
  onQtyChange: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
  onCartDiscountChange: (value: number) => void;
  onCheckout: () => void;
  onOverridePrice?: (item: CartItem) => void;
}

export const CartPanel = ({
  items,
  subtotal,
  itemDiscount,
  cartDiscount,
  total,
  cartDiscountPct,
  onDiscountChange: _onDiscountChange,
  onQtyChange,
  onRemove,
  onCartDiscountChange,
  onCheckout,
  onOverridePrice: _onOverridePrice,
}: CartPanelProps) => (
  <div className="flex h-full flex-col">
    {/* Header */}
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-xl font-bold text-slate-800">Bills</h2>
      <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">
        {items.length} items
      </span>
    </div>

    {/* Cart Items - Scrollable */}
    <div className="flex-1 space-y-2 overflow-y-auto pr-1" style={{ maxHeight: "calc(100vh - 400px)" }}>
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-12 text-center">
          <span className="material-symbols-rounded mb-2 text-4xl text-slate-300">shopping_cart</span>
          <p className="text-sm text-slate-500">Cart is empty</p>
          <p className="text-xs text-slate-400">Add items to get started</p>
        </div>
      ) : (
        items.map((item) => (
          <CartItemRow
            key={item.id}
            item={item}
            onQtyChange={onQtyChange}
            onRemove={onRemove}
          />
        ))
      )}
    </div>

    {/* Summary */}
    <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">Sub Total</span>
        <span className="font-semibold text-slate-700">{formatMmk(subtotal)}</span>
      </div>

      {(itemDiscount > 0 || cartDiscountPct > 0) && (
        <>
          {itemDiscount > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Item Discounts</span>
              <span className="font-semibold text-rose-500">- {formatMmk(itemDiscount)}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-slate-500">
              Discount %
              <Input
                type="number"
                min={0}
                max={100}
                value={cartDiscountPct || ""}
                onChange={(event) => onCartDiscountChange(toNumber(event.target.value))}
                className="h-7 w-16 text-center text-xs"
                placeholder="0"
              />
            </span>
            <span className="font-semibold text-rose-500">- {formatMmk(cartDiscount)}</span>
          </div>
        </>
      )}

      {cartDiscountPct === 0 && itemDiscount === 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 text-slate-500">
            Discount %
            <Input
              type="number"
              min={0}
              max={100}
              value={cartDiscountPct || ""}
              onChange={(event) => onCartDiscountChange(toNumber(event.target.value))}
              className="h-7 w-16 text-center text-xs"
              placeholder="0"
            />
          </span>
          <span className="font-semibold text-slate-400">- {formatMmk(0)}</span>
        </div>
      )}

      <div className="h-px bg-slate-200" />

      <div className="flex items-center justify-between">
        <span className="text-lg font-bold text-slate-800">Total</span>
        <span className="text-xl font-bold text-emerald-600">{formatMmk(total)}</span>
      </div>
    </div>

    {/* Checkout Button */}
    <Button
      className="mt-4 w-full bg-emerald-600 py-3 text-base font-semibold hover:bg-emerald-700"
      onClick={onCheckout}
      disabled={items.length === 0}
    >
      <span className="material-symbols-rounded mr-2">point_of_sale</span>
      Place Order (F2)
    </Button>
  </div>
);
