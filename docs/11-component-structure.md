# Component Structure

## Key Directories

```text
src/
  app/
    layout/          AppLayout, Sidebar, Topbar, ShopSwitcher
    routes/          AppRouter and route guards
  components/
    ui/              Button, Card, Modal, Badge, Select, Toast
    pos/             POS-specific components
    sales/           Sales drawer, refund/void modals
    shifts/          Shift cards and detail views
    inventory/       Inventory UI components
    dashboard/       Dashboard charts and summaries
  features/
    auth/            Login route
    admin/           Admin route wrappers
    catalog/         Catalog and barcode helpers
    pos/             POS route wrapper and service helpers
    reports/         Report route wrappers
  pages/             Main page compositions used by routes
  stores/
    authStore.ts     Supabase Auth session and app user id
    appStore.ts      selected shop UI state
    languageStore.ts language preference
    toastStore.ts    toast queue
    data/            Zustand domain slices and Supabase row mappers
  lib/
    permissions.ts   central permission registry
    supabase.ts      Supabase client and write helpers
    utils.ts         formatting and shared helpers
  types/
    domain.ts        TypeScript domain model
```

## State Slices

`src/stores/data/` uses Zustand slices:

- `shopSlice.ts` - shops and users
- `categorySlice.ts` - categories
- `productSlice.ts` - products and barcode mappings
- `inventorySlice.ts` - inventory adjustments through RPC
- `shiftSlice.ts` - shift open/close through RPC
- `saleSlice.ts` - sales, refund/void requests and approvals through RPC
- `transferSlice.ts` - transfer lifecycle through RPC
- `purchaseSlice.ts` - suppliers and purchase order lifecycle
- `pricingSlice.ts` - price tiers
- `auditSlice.ts` - audit and reprint RPCs

`dataStore.ts` remains a compatibility re-export.

## Business Logic Placement

- UI primitives should not contain business logic.
- Pages compose UI and call store actions.
- Store actions call Supabase directly or through RPCs.
- Critical operational workflows must use RPCs and update local state only after
  RPC success.
- Permission strings come from `src/lib/permissions.ts`.

## Adding Features

1. Add page/component files in the relevant domain folder.
2. Add a route in `src/app/routes/AppRouter.tsx`.
3. Add a granular permission in `src/lib/permissions.ts` if needed.
4. Add a sidebar entry in `src/app/layout/Sidebar.tsx`.
5. For protected operational writes, add a database RPC and RLS verification
   docs.

