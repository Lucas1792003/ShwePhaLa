# 06 · UI, Printing & Hardware

## Responsive Targets

The app is designed for **tablet landscape and larger**. Viewports below
`768px` render `SmallScreenGuard` instead of the app chrome:
*"This app is optimized for tablet and desktop screens. Please use a
wider screen for POS operations."*

`AppLayout` reads `useViewportWidth()` to switch.

| Width × Height | Role | Tailwind bp | Sidebar |
| --- | --- | --- | --- |
| 1024 × 768 | Tablet landscape / old POS | `lg` | 220 px |
| 1280 × 720–800 | Minimum desktop / POS monitor | `xl` | 270 px |
| 1366 × 768 | Common POS monitor | `xl` | 270 px |
| 1440 × 900 | Laptop | `xl` | 270 px |
| 1536 × 864 | Windows scaling | `2xl` | 270 px |
| 1920 × 1080 | Main desktop target | `2xl` | 270 px |
| 2560 × 1440 | Large desktop sanity | `2xl` | 270 px (content capped at `max-w-1400`) |

Tailwind breakpoints used: `lg` 1024, `xl` 1280, `2xl` 1536.

Per-page expectations and a wide manual checklist live in
[`archive/32-responsive-testing-checklist.md`](./archive/32-responsive-testing-checklist.md).
Highlights:

- **POS** — product grid 2 / 3 / 4 columns at `lg` / `xl` / `2xl`; cart
  width `320px` below `xl`, `380px` at `xl+`. Top bar and category
  filters wrap; no horizontal scroll.
- **Tables** (Sales, Inventory, Movements, Shifts, Audit) — wrappers use
  `overflow-x-auto` with `min-w-*` so they scroll horizontally if needed
  rather than clipping.
- **Supplier Detail Page** — five summary cards, three tabs. No drawer
  horizontal scroll at 1024×768. Expanded PO line-items table is the only
  place horizontal scroll may appear, and only at very narrow widths.

## Receipt Printing

The app does **not** use a PDF generator. It uses the browser's native
print pipeline via `window.print()`, with `src/print/receipt.css` to
isolate the 80 mm `<div class="receipt">`:

- `@media print { body * { visibility: hidden; } .receipt, .receipt * { visibility: visible; } .receipt { position: absolute; top: 0; left: 0; …} }`
- `.print-hidden { display: none !important; }` for Topbar, Sidebar,
  Toasts, etc.
- `@page { size: 80mm auto; margin: 4mm; }` hints the thermal printer
  roll; A4 fallback works as a narrow band on full paper.

### Print vs Reprint

`ReceiptDetail` (used both at `/app/sales/:saleId` and inside the Sales
History drawer) exposes two buttons:

| Button | Behavior |
| --- | --- |
| **Print** | Calls `window.print()` directly. Does NOT log. Disabled when the sale has no loaded items. |
| **Reprint** | Gated by `receipt:reprint`. Sets an in-flight flag, awaits `log_receipt_reprint`, then calls `window.print()`. Double-clicks can't create duplicate log rows. RPC failure shows a toast and skips printing. |

Cancelling the print dialog after **Reprint** does not roll back the log
row — by design, a logged reprint is a reprint *intent*.

## Barcode Labels

- Route: `/app/barcode-labels`. Gated by `product:read` + role gate
  ADMIN/MANAGER.
- Flow: select active product → preview modal → set quantity (1–200) →
  pick template → **Print labels** mounts `BarcodePrintSheet` and calls
  `window.print()`. The browser print only opens from the final button.
- Barcode value resolution (single source of truth in
  `src/features/barcodes/labels.ts`):
  1. selected Product Unit barcode (`product_barcodes.product_unit_id`)
  2. for the default unit only, fall back to `products.sku`
  3. otherwise: the selected unit cannot print a scannable label
- Labels print product name, sellable unit name, selected unit price, and
  barcode/SKU. Legacy `products.pack_size` is not printed.
- Renderer: CODE128 via
  [`src/components/barcodes/BarcodeSvg.tsx`](../src/components/barcodes/BarcodeSvg.tsx).

### Templates

`src/features/barcodes/labelTemplates.ts`:

| Key | Name | Size | Use |
| --- | --- | --- | --- |
| `compact` | Compact | 50mm × 25mm | Small stickers with a large barcode |
| `standard` | Standard | 60mm × 30mm | Default — name, barcode, price, code |
| `price` | Price focused | 60mm × 30mm | Shelf labels with larger price text |
| `large` | Large | 70mm × 40mm | Bigger packaging labels |

Print isolation: `src/print/labels.css` follows the same pattern as the
receipt CSS, sizing labels through `--label-width` / `--label-height` and
named `@page` hints per template. Browser support for dynamic `@page`
varies; operators may still need to choose the matching label stock in
the print dialog.

## Barcode Scanner Behavior

- The scanner is a keyboard-emulating HID device. The barcode input
  receives keystrokes and an Enter at the end of each scan.
- POS resolves the scanned code via the **same** rule the label printer
  uses: unit-linked `product_barcodes.value` first, then `products.sku`
  fallback to the default Product Unit. A package barcode adds that exact
  Product Unit; a SKU-source label scans back as the default unit. See
  [04-features-workflows.md](./04-features-workflows.md).
- The input refocuses after every scan (success or failure), so the next
  Enter-terminated burst always lands there even if a click stole focus.
- A toast confirms each successful add: `Added <product name> - <unit>`.
  Misses show `Barcode not found`. Stock guards show
  `Only X in stock for this shop.`

## Product Image Upload / Storage

- Compressed to **`<= 100 KB`** via `compressProductImage` (WebP/JPEG).
- Uploaded to the public Supabase Storage bucket **`product-images`**.
- The row stores only the public URL in `products.image_url` — never
  base64.
- Display is a plain `<img src={imageUrl}>`. Timestamped path means
  replacing an image always creates a fresh object, so a changed image is
  never hidden by browser/CDN caching.

### Phone QR upload

A QR-based phone upload flow exists for desktop product forms (when the
desktop user does not have a webcam image):

1. Desktop clicks **Upload from phone**.
2. `create_product_image_upload_session(...)` creates a session.
3. Desktop attaches a pre-scoped signed upload token to that session's
   storage path via `attach_product_image_upload_session_token(...)`.
4. The QR modal shows a QR for `/phone-upload/product-image/:token` (the
   route is unauthenticated but token-gated).
5. The phone validates the raw token via
   `get_product_image_upload_session_by_token(...)`, takes/picks a photo,
   compresses to `<= 100 KB`, uploads to
   `product-images/temp/<sessionId>/...`, then calls
   `complete_product_image_upload_session(...)`.
6. The desktop polls `get_product_image_upload_session_status(...)`,
   receives the public URL, updates the preview.

Security:

- Sessions expire after 10 minutes.
- The raw token is returned only once (the QR URL).
- The database stores only `sha256(token)`.
- A session can be completed only once.
- The phone can upload only to the session's pre-created path.
- Completion rejects wrong storage paths, > 100 KB files, unsupported
  MIME types, `data:` URLs, or URLs outside `product-images`.

## Known Storage Follow-ups

- Replacing or removing a product image does not delete the previous
  Storage object yet. Same for cancelled phone uploads. Orphan cleanup is
  a recommended follow-up (scheduled job listing `product-images` and
  deleting objects with no referencing `products.image_url` + old
  `product-images/temp/*` whose sessions are expired/canceled).

## Future Desktop Wrapper / Hardware

Currently the app is a browser SPA. A future desktop wrapper (e.g.
Electron) could:

- Drive a USB ESC/POS thermal printer directly instead of relying on the
  browser's print dialog.
- Offer offline POS mode with sync (sales queued while the network is
  down).
- Talk to OPOS / JavaPOS cash drawers and barcode scanners with native
  drivers instead of HID keyboard emulation.

These are not implemented and are in the roadmap, not the current code
path. See [09-roadmap-todo.md](./09-roadmap-todo.md).
