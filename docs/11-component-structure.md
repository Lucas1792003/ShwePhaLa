# Component Structure

## Key Directories

```
src/
├── app/                    # App shell
│   ├── layout/             # AppLayout, Sidebar, Topbar, ShopSwitcher
│   └── routes/             # AppRouter, guards (RequireAuth, RequireRole)
├── components/             # Shared components
│   ├── dashboard/          # ProfitTrendChart, GoalTracker, InventoryIntelligence
│   ├── layout/             # LanguageSwitcher
│   ├── pos/                # ProductFinder, CartPanel, CartItemRow
│   └── ui/                 # Button, Card, Modal, Badge, Select, etc.
├── features/               # Domain-specific features
│   ├── admin/              # Admin pages (shops, users, products, etc.)
│   ├── auth/               # LoginPage
│   ├── inventory/          # InventoryPage
│   ├── pos/                # PosPage wrapper
│   ├── reports/            # ShopReports, GlobalReports, ProfitReports
│   ├── sales/              # SalesListPage, SaleDetailPage
│   ├── shifts/             # ShiftsPage
│   └── ...
├── hooks/                  # Custom hooks
│   ├── useTranslation.ts   # i18n hook
│   └── useDashboardInsights.ts # Dashboard business logic (stock health, fast/slow movers, profit calculations)
├── i18n/                   # Internationalization
│   └── translations.ts     # EN/MY translation strings
├── pages/                  # Standalone pages
│   ├── DashboardPage.tsx   # Decision-making dashboard with analytics
│   ├── PosPage.tsx         # POS interface
│   ├── ProductsManagePage.tsx # Product & category management
│   └── NotFoundPage.tsx
├── stores/                 # Zustand stores
│   ├── appStore.ts         # Current shop selection
│   ├── authStore.ts        # Current user
│   ├── languageStore.ts    # Language preference (en/my)
│   ├── toastStore.ts       # Toast notifications
│   ├── dataStore.ts        # Re-export for backward compatibility
│   └── data/               # Modular data store (slice pattern)
│       ├── index.ts        # Store composition & persistence
│       ├── types.ts        # All state & input types
│       ├── utils.ts        # ID generators, helpers
│       └── slices/         # Domain-specific state slices
│           ├── shopSlice.ts      # Shops & Users
│           ├── categorySlice.ts  # Product Categories
│           ├── productSlice.ts   # Products & Barcodes
│           ├── inventorySlice.ts # Inventory & Stock Movements
│           ├── shiftSlice.ts     # Shifts
│           ├── saleSlice.ts      # Sales, Refunds, Voids
│           ├── transferSlice.ts  # Stock Transfers
│           ├── purchaseSlice.ts  # Suppliers & Purchase Orders
│           ├── pricingSlice.ts   # Price Tiers
│           └── auditSlice.ts     # Audit & Reprint Logs
├── lib/                    # Utilities
│   └── utils.ts            # formatMmk, cn, etc.
├── shared/                 # Shared utilities
│   └── utils/permissions.ts # Permission helpers
└── types/
    └── domain.ts           # TypeScript interfaces
```

## Key Files

### Layout
- `src/app/layout/Sidebar.tsx` - Navigation with collapsible sections
- `src/app/layout/AppLayout.tsx` - Main layout wrapper
- `src/components/layout/LanguageSwitcher.tsx` - EN/MY toggle

### Pages
- `src/pages/DashboardPage.tsx` - Decision-making dashboard with profit trends, goal tracking, inventory intelligence
- `src/pages/PosPage.tsx` - Point of Sale with grid layout
- `src/pages/ProductsManagePage.tsx` - Product CRUD with dynamic category management

### Dashboard Components
- `src/components/dashboard/ProfitTrendChart.tsx` - Bar chart showing daily profit/loss (red/green)
- `src/components/dashboard/GoalTracker.tsx` - Progress rings for revenue and profit targets
- `src/components/dashboard/InventoryIntelligence.tsx` - Stock health, fast/slow movers, reorder suggestions

### State Management
- `src/stores/languageStore.ts` - i18n state with localStorage persistence
- `src/stores/data/` - Modular data store using Zustand slice pattern
  - Each slice handles one domain (shop, product, sale, etc.)
  - `types.ts` defines all state interfaces and input types
  - `utils.ts` provides shared helpers (ID generation, date keys)
  - Slices are composed in `index.ts` with localStorage persistence

### Internationalization
- `src/i18n/translations.ts` - All translation strings
- `src/hooks/useTranslation.ts` - Hook returning `{ t, language, setLanguage }`

## Adding New Features

1. Create folder under `src/features/<feature>` with `pages/` and `components/`
2. Add route in `src/app/routes/AppRouter.tsx`
3. Update permissions in `src/shared/utils/permissions.ts` if needed
4. Add sidebar entry in `src/app/layout/Sidebar.tsx` (navSections array)
5. Add translations to `src/i18n/translations.ts` for both `en` and `my`

## Adding Translations

```typescript
// In your component
import { useTranslation } from "../hooks/useTranslation";

const MyComponent = () => {
  const { t } = useTranslation();
  return <h1>{t("section", "key")}</h1>;
};

// In translations.ts, add to both en and my objects:
// section: { key: "English text" }
// section: { key: "မြန်မာစာ" }
```
