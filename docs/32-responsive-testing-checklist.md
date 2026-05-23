# Responsive Testing Checklist

The app is built for **tablet landscape and larger** — POS counters,
laptops, and desktops. Phones are explicitly **not** supported: viewports
below `768px` render a `SmallScreenGuard` (see
[src/app/layout/SmallScreenGuard.tsx](../src/app/layout/SmallScreenGuard.tsx))
instead of the app chrome.

## Target sizes

| Width × Height | Role | Tailwind bp | Sidebar | Notes |
| --- | --- | --- | --- | --- |
| 1024 × 768 | Tablet landscape / old POS | `lg` | 220 px | Tightest supported size — POS must stay usable here |
| 1280 × 720 | Minimum desktop / POS monitor | `xl` | 270 px | First "comfortable" size; sidebar switches to full width |
| 1280 × 800 | Small laptop | `xl` | 270 px |  |
| 1366 × 768 | Common POS monitor | `xl` | 270 px |  |
| 1440 × 900 | Laptop | `xl` | 270 px |  |
| 1536 × 864 | Windows scaling | `2xl` | 270 px |  |
| 1920 × 1080 | Main desktop target | `2xl` | 270 px | Primary design target |
| 2560 × 1440 | Large desktop sanity check | `2xl` | 270 px | `app-content` capped at `max-w-1400` for readability |

Tailwind breakpoints used: `lg` 1024, `xl` 1280, `2xl` 1536.

## Small-screen guard (< 768 px)

- The `AppLayout` reads `useViewportWidth()` and renders
  `<SmallScreenGuard />` when the viewport is below 768 px.
- Copy: *"This app is optimized for tablet and desktop screens. Please use a
  wider screen for POS operations."*
- The CSS `@media (max-width: 767px)` stacks the sidebar above content as a
  belt-and-braces fallback (e.g. for print).

## Per-page expectations

### POS (`/app/pos`)
- Top bar (Point of Sale + shift badge + barcode toggle + shop chip) fits on
  one row at 1024 +. Items may wrap on extremely narrow widths.
- Product grid: `2 cols` at `lg`, `3 cols` at `xl`, `4 cols` at `2xl`.
- Cart panel: fixed-width column, `320 px` below `xl`, `380 px` at `xl+`.
  Always visible and scrollable independently of the product grid.
- Category filter wraps via `flex-wrap`; never overflows horizontally.
- Verify keyboard shortcuts (F2 confirm, F3 barcode, Esc close modals) at
  every size.

### Payment modal
- `max-h-[90vh]`, body scrolls; footer buttons stay visible.
- Amount-received card and breakdown stack cleanly at 1024.
- Modal default size `max-w-xl` (~576 px) — fits comfortably with sidebar.

### Receipt page (`/app/sales/:saleId`)
- Centered `80mm` receipt card (`.receipt { width: 80mm; margin: 0 auto }`)
  preserves the print-fidelity layout at all sizes.
- Print/Reprint buttons sit in the PageHeader actions; wraps if header is
  narrow.

### Sales history (`/app/sales`)
- `SalesTable` wrapper switched to `overflow-x-auto` with `min-w-[720px]` —
  at 1024 the table can scroll horizontally if needed instead of clipping.
- `SaleDetailDrawer`: `w-full` on small viewports, `max-w-lg` (~512 px) at
  `sm+`. Sticky header + sticky footer + scrolling body.
- Inside the drawer the same `ReceiptDetail` body renders, with the page
  header replaced by a compact toolbar (`variant="drawer"`).

### Inventory (`/app/inventory`)
- `InventoryTable` and `MovementsTable` use `overflow-x-auto` +
  `min-w-[640–720px]`.
- Adjust modal opens via standard `Modal` primitive (`max-h-[90vh]`).

### Shifts (`/app/shifts`)
- `ShiftTable` `min-w-[560px]` with horizontal scroll fallback.
- Manager `ShiftDetail` modal uses the shared breakdown helper; payment
  breakdown + cash reconciliation cards are 2 col on `md+`, 1 col below.
- Cashier `ShiftSummary` mirrors the same layout in 2 col on `md+`.

### Purchases / Transfers
- Item grids in detail modals use `grid grid-cols-2 gap-4`; no fixed widths.

### Dashboard
- Top stat row: `sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5` — five-card
  layout only appears at 1280 + so the 1024 tablet doesn't crush cards.
- Trend cards and lower grids use `lg:grid-cols-2 / lg:grid-cols-3` and
  stack at narrower widths.

### Audit log
- `AuditTable` wrapper switched to `overflow-x-auto` + `min-w-[720px]`.

## Manual QA matrix

For each target size, exercise:

- [ ] Sidebar fully visible; no horizontal scroll on body
- [ ] POS: product grid, cart, totals, F2/F3 shortcuts
- [ ] PaymentModal: open, type amount received (starts at 0), confirm
- [ ] Receipt page: print preview centers the 80mm card
- [ ] Sales history: row "View receipt" opens drawer; "Open full receipt"
      navigates; tables scroll horizontally only if the underlying min-width
      exceeds the viewport
- [ ] Inventory: table; Adjust modal
- [ ] Shift summary: open shift live expected cash; close-shift flow
- [ ] Dashboard: all card rows responsive
- [ ] Below 768 px: `SmallScreenGuard` renders

## Adding new pages

1. Avoid hard-coded widths (`w-[400px]`, etc.). Prefer `max-w-*` /
   `min-w-*` + flex/grid.
2. For tables, wrap in `overflow-x-auto` and put a sensible `min-w-*` on
   the `<Table>` so columns stay readable when they have to scroll.
3. For modals/drawers, rely on the `Modal` and `Drawer` primitives — they
   already implement `max-h-[90vh]`, sticky header/footer, and responsive
   widths.
4. For grids, step columns up at `lg` → `xl` → `2xl`, not at `sm` / `md`,
   so the layout at the 1024 tablet target stays roomy.
