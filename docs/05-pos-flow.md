# POS Flow

## Barcode Scan

1. Cashier opens the barcode input with F3 or the Barcode button.
2. On Enter, POS looks up `product_barcodes.value`.
3. If a mapping exists, the linked product is added to the cart.
4. If no mapping exists, an error toast is shown.

Products also have `products.sku`, which is the primary catalog code in product
admin. SKU is not currently the POS scan lookup table; `product_barcodes` is.

## Cart Rules

- Quantity increments by scan or cart controls.
- Item discount percentage can be applied per line.
- Cart discount percentage is applied after item discounts.
- Price override requires the relevant override permission.
- Negative stock is blocked unless the user has stock override permission.

## Checkout

- Cashier must have an open shift.
- Payment modal captures payment method and paid amount. The "Amount
  received" input opens at `0` every time the modal opens; the shared
  `Input` selects-on-focus so typing replaces the 0 immediately. The
  Confirm button stays disabled until paid ≥ total.
- Checkout calls `complete_sale`, a single atomic, permission-checked RPC.
- The RPC validates auth, shop access, shift, products, inventory, stock, and
  override permissions.
- The RPC inserts sale rows, sale item rows, inventory updates, movement rows,
  and audit rows in one database transaction.
- The cart clears and the receipt page opens only after RPC success.

## Receipt detail

The post-payment receipt page and the Sales History drawer share a single
`ReceiptDetail` component (`src/components/receipt/ReceiptDetail.tsx`).
The `variant="page"` form keeps the existing centered 80 mm receipt with a
`PageHeader` + Print/Reprint actions; the `variant="drawer"` form omits
the page header so the same body fits inside the responsive `Drawer`
primitive used by Sales History.

## Reprints

Receipt reprint logging uses `log_receipt_reprint`, not a direct table insert.
The Reprint button is gated on `receipt:reprint`. Print (no log) and Reprint
(logged) coexist so a normal first print does not double-log.

## Refunds And Voids

- Refund/void request creation uses `create_refund_void_request`.
- Approval uses `approve_refund_request` or `approve_void_request`.
- Inventory restoration and audit writes happen inside approval RPCs.

