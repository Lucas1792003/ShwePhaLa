# Printing

## How printing actually works

The app does **not** use a popup or PDF generator — it uses the browser's
native print pipeline via `window.print()`. The receipt is just an
ordinary 80 mm-wide `<div class="receipt">` that the browser renders on
the printable page when print mode is active.

The receipt isolation rules live in [`src/print/receipt.css`](../src/print/receipt.css)
(imported once from `main.tsx`):

- `@media print { body * { visibility: hidden; } .receipt, .receipt * { visibility: visible; } .receipt { position: absolute; top: 0; left: 0; … } }`
  — every other on-screen element is invisible during print, so the
  output contains the 80 mm receipt and nothing else.
- `.print-hidden { display: none !important; }` (under `@media print`) — a
  belt-and-braces tag for any element we explicitly want gone (Topbar,
  Sidebar, Toasts, page header, action toolbars, request-action cards).
- `@page { size: 80mm auto; margin: 4mm; }` — hints thermal-printer roll
  size; browsers fall back to the user's chosen paper when it's an A4
  printer.

## ReceiptDetail buttons

The post-payment route `/app/sales/:saleId` and the Sales History drawer
both render the shared `ReceiptDetail`
([`src/components/receipt/ReceiptDetail.tsx`](../src/components/receipt/ReceiptDetail.tsx)):

- **Print** — calls `window.print()` synchronously from the click handler.
  Does NOT call `log_receipt_reprint`. Disabled when the sale has no
  loaded items.
- **Reprint** — gated by `receipt:reprint`. Sets an in-flight flag,
  `await`s `log_receipt_reprint` (the `addReprintLog` slice action), then
  calls `window.print()`. The in-flight flag disables both Print and
  Reprint while the RPC is pending so double-clicks cannot create
  duplicate reprint logs. Reprint label switches to "Reprinting…" while
  pending. Any RPC failure shows a toast and skips the print dialog.

## Barcode Labels

The Barcode Labels page is available at `/app/barcode-labels` and remains
route-gated to `ADMIN` and `MANAGER`.

The flow is:

1. Select an active product.
2. Open the preview modal.
3. Confirm or edit quantity.
4. Choose a label design.
5. Review the live preview and print summary.
6. Click **Print labels** to mount `BarcodePrintSheet` and call
   `window.print()`.

The page does not print immediately after product selection. Browser print only
opens from the final print button in the preview modal.

Barcode value resolution is unchanged and lives in
[`src/features/barcodes/labels.ts`](../src/features/barcodes/labels.ts):

- Use the first matching `product_barcodes.value`.
- Fall back to `product.sku`.
- If neither exists, the product cannot print labels.

The barcode renderer remains `CODE128` through
[`src/components/barcodes/BarcodeSvg.tsx`](../src/components/barcodes/BarcodeSvg.tsx).
This is frontend/print UI only; it does not change POS scan lookup, backend,
Supabase, RLS, RPCs, inventory, or product business logic.

### Label template registry

Label designs are defined in
[`src/features/barcodes/labelTemplates.ts`](../src/features/barcodes/labelTemplates.ts).
Each template defines:

- key
- display name
- description
- width and height in millimeters
- CSS class / named page class
- render variant
- whether to show name, price, and human-readable code

Current templates:

| Key | Name | Size | Intended use |
| --- | --- | --- | --- |
| `compact` | Compact | 50mm x 25mm | Small stickers with a large barcode |
| `standard` | Standard | 60mm x 30mm | Default/current-style label with name, barcode, price, and code |
| `price` | Price focused | 60mm x 30mm | Shelf labels with larger price text |
| `large` | Large | 70mm x 40mm | Bigger packaging labels with more readable text |

Default template: `standard`.

### Barcode label components

- [`src/components/barcodes/BarcodeLabel.tsx`](../src/components/barcodes/BarcodeLabel.tsx)
  renders one label using the selected template key.
- [`src/components/barcodes/BarcodePrintSheet.tsx`](../src/components/barcodes/BarcodePrintSheet.tsx)
  accepts `product`, barcode `value`, `quantity`, and `templateKey`, then
  renders one page per label.
- Quantity is still clamped to 1-200 through `clampLabelQty`.

### Label print CSS

Label print isolation lives in
[`src/print/labels.css`](../src/print/labels.css). It follows the same
visibility pattern as receipt printing:

- hide everything during print through the shared print scaffold
- reveal `.label-print-sheet` and descendants only
- size labels through `--label-width` and `--label-height`
- use named `@page` hints for the selected template size
- remove borders/shadows from printed labels

Browser support for dynamic or named `@page` sizes varies. The label DOM always
uses the selected dimensions, but if the browser ignores the page-size hint, the
operator should choose the matching label or paper size in the print dialog.

## Manual test checklist

| Scenario | Expected |
| --- | --- |
| Confirm payment → land on `/app/sales/:saleId` | Receipt preview renders; Print + Reprint enabled |
| Click **Print** | Browser print dialog opens; preview shows only the 80mm receipt — no sidebar, no Page header, no buttons, no reprint log, no request-action cards, no modals |
| Click **Reprint** (with `receipt:reprint`) | One row appears in `reprint_logs`; print dialog opens; "Reprint count" increments |
| Double-click **Reprint** rapidly | Only one `log_receipt_reprint` row written (in-flight flag disables the button); single print dialog |
| Refresh `/app/sales/:saleId` and click **Print** | Print works exactly as before (state is loaded from the store, not the navigation memo) |
| Open the **Sales History drawer** and click **Print** | Browser prints only the receipt — drawer chrome is hidden because it isn't a descendant of `.receipt` |
| Cancel the print dialog after **Reprint** | The reprint log row was already written; cancelling doesn't roll it back (this is the documented behavior: a logged reprint is a reprint *intent*, not proof of paper output) |
| Open a sale with `RLS` blocking access | `ReceiptDetail` renders "Receipt not found"; no Print/Reprint buttons |
| Open a sale while `sale_items` is empty | Amber banner: *"Sale items are still loading or unavailable; printing is disabled until items are visible."* Print + Reprint disabled |
| Cashier prints own receipt | Works (CASHIER has `receipt:reprint` and `sales:view_own_shift`) |
| Cashier opens another cashier's saleId in URL | Store has no row (RLS blocks SELECT); "Receipt not found" shown |
| Manager / Admin print | Unchanged — same permissions hold |
| Open `/app/barcode-labels` as Admin / Manager | Page is available and product selection opens a preview modal, not browser print |
| Open `/app/barcode-labels` as Cashier / Buyer | Route guard blocks access |
| Select product with barcode rows | Preview shows `Barcode: value`; print encodes the first `product_barcodes.value` |
| Select product without barcode rows but with SKU | Preview shows `Using SKU as barcode`; print encodes `product.sku` |
| Select Compact / Standard / Price focused / Large | Live preview and print summary update to the selected design and size |
| Enter quantity below 1 or above 200 | Quantity is clamped to 1-200 before printing |
| Click **Print labels** | Browser print dialog opens and output contains labels only, using the selected template |

## Thermal printer tips

- In the OS print dialog, pick the 80 mm roll printer; the `@page` rule
  sizes the page correctly.
- For non-thermal A4 printers, the `.receipt` element keeps its 80 mm
  width and centers on the page, so you'll get a narrow print band on a
  full sheet — usable as a backup.
- Disable browser headers/footers for a cleaner thermal output.
- Disable margins where the printer dialog allows it (or set to "None").
- For barcode labels, choose the label or paper size that matches the selected
  template if the browser ignores named `@page` hints.
