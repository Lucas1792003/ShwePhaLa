# POS Flow

## Barcode Scan

1. Cashier opens the barcode input with F3 or the Barcode button. The input
   autofocuses and is refocused after every scan so a scanner's next
   Enter-terminated burst always lands here.
2. On Enter, POS resolves the scanned code via the shared
   `findProductForScan(value, products, barcodes)` lookup
   (`src/features/pos/barcodeLookup.ts`):
   1. exact match against `product_barcodes.value`
   2. fallback case-insensitive match against `products.sku`
3. If a product is found, it is added to the cart and a success toast is
   shown ("Added <name>"). Stock guards still apply — out of stock or at
   max cart units shows "Only X in stock for this shop."
4. If no product is found, an error toast "Barcode not found" is shown.

The fallback to SKU intentionally mirrors `getPrintableBarcodeValue`
(`src/features/barcodes/labels.ts`), which prints the first
`product_barcodes.value` and falls back to SKU. Without the same fallback at
scan time, labels printed from SKU would scan as "Barcode not found".

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

