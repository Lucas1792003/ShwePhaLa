# Architecture

## Folder structure
```
src/
  components/
    ui/           # design system primitives (Button, Modal, Badge, etc.)
    layout/       # shell, nav, guards, headers
    dashboard/    # analytics components (charts, goal tracker)
    pos/          # POS UI building blocks
    inventory/    # inventory UI building blocks
    sales/        # sales UI building blocks
    shifts/       # shift UI building blocks
    audit/        # audit UI building blocks
  features/
    auth/         # auth pages and services
    catalog/      # product + barcode helpers
    pos/          # cart math helpers
    inventory/    # inventory helpers
    sales/        # refund/void helpers
    shifts/       # shift summaries
    audit/        # audit filters
    admin/        # admin pages (shops, users, products, etc.)
    reports/      # reporting pages
  pages/          # thin route-level compositions
  stores/         # zustand stores (see State Architecture below)
  data/           # mock seed data
  hooks/          # custom hooks (useTranslation, useDashboardInsights)
  i18n/           # internationalization (translations.ts)
  print/          # print CSS + formatter helpers
  lib/            # utilities (formatMmk, cn, etc.)
```

## Component rules
- UI primitives live in `src/components/ui` and **never** contain business logic.
- Feature components (POS, inventory, sales) compose UI primitives and accept data via props.
- Pages compose feature components and call store actions, keeping page logic small.

## State strategy
- `authStore`: current user session
- `appStore`: admin-selected shop context
- `languageStore`: i18n language preference
- `toastStore`: toast notification queue
- `dataStore`: all domain data and business actions (modular slice pattern)
- All stores persisted to `localStorage` for quick refresh + demo continuity.

## Data Store Architecture

The main data store uses Zustand's **slice pattern** to keep domain logic modular and maintainable:

```
stores/data/
  index.ts        # Combines slices, adds persistence
  types.ts        # All state interfaces & input types
  utils.ts        # Shared helpers (ID generation, date keys)
  slices/
    shopSlice.ts      # Shops & Users CRUD
    categorySlice.ts  # Product Categories
    productSlice.ts   # Products & Barcodes
    inventorySlice.ts # Inventory levels & stock movements
    shiftSlice.ts     # Shift management
    saleSlice.ts      # Sales, refunds, voids (~200 lines)
    transferSlice.ts  # Inter-shop transfers (~220 lines)
    purchaseSlice.ts  # Suppliers & POs (~140 lines)
    pricingSlice.ts   # Price tier logic
    auditSlice.ts     # Audit & reprint logs
```

Each slice is a `StateCreator` that receives `(set, get)` and returns state + actions for its domain. Slices are composed in `index.ts`:

```typescript
export const useDataStore = create<DataState>()(
  persist(
    (...args) => ({
      ...createShopSlice(...args),
      ...createCategorySlice(...args),
      ...createProductSlice(...args),
      // ... other slices
    }),
    { name: "shwephala-db" }
  )
);
```

**Why slices?**
- Single-domain files are easier to navigate and test
- Changes to one domain don't affect others
- New features can add slices without touching existing code
- `dataStore.ts` remains as a re-export for backward compatibility

## Why this design
- Feature modules keep domain logic reusable.
- Component-first approach reduces duplication.
- Thin pages keep routing and view composition clean.
