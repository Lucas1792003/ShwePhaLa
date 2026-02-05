# Shwe Pha La - Retail POS System

A modern Point of Sale and Inventory Management system for small retail businesses (alcohol, drinks, FMCG). Frontend-only with localStorage persistence.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **State Management**: Zustand (modular slice pattern with persistence)
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **Forms**: React Hook Form + Zod
- **Routing**: React Router DOM
- **i18n**: Custom translation system (English + Myanmar)

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Demo Accounts

Login with any password using these email patterns:

| Role | Email Pattern | Example | Start Page |
|------|---------------|---------|------------|
| Admin | `*@admin.com` | `nandar@admin.com` | Dashboard |
| Manager | `*@manager.com` | `kozaw@manager.com` | POS |
| Cashier | `*@staff.com` | `ayeaye@staff.com` | POS |
| Buyer | `*@buyer.com` | `buyer@buyer.com` | Catalog |

Demo users are created automatically on first login.

## Features

### Dashboard

Decision-making view for shop owners with:

- **KPI Summary Cards** - Revenue, Investment, Profit, Orders, Avg Order Value
- **Shop Filter** - Admin can filter by all shops or individual shops
- **Profit Trend Chart** - Daily profit/loss with 7-day or 30-day view
- **Monthly Goal Tracker** - Progress rings for revenue and profit targets
- **Inventory Intelligence** - Stock health, fast/slow movers, reorder suggestions
- **Sales Trend Chart** - Revenue, investment, profit over time
- **Sales by Category** - Donut chart showing revenue distribution
- **Top Selling Products** - With revenue, cost, and profit breakdown
- **Low Stock Alert** - Products below threshold with days until stockout
- **Recent Sales** - Last 5 transactions with profit per sale

### Core Modules

- **POS (Point of Sale)** - Grid layout, barcode scanning (F3), cart management, checkout
- **Sales History** - View transactions, refunds, voids, receipt reprinting
- **Shifts** - Opening/closing cash, shift summaries, variance tracking
- **Inventory** - Stock levels, movements, adjustments with reasons
- **Transfers** - Inter-shop stock transfers with approval workflow
- **Purchases** - Purchase orders, supplier management
- **Reports** - Profit reports, global analytics

### Admin Features

- **Shops** - Multi-shop management
- **Users** - User management with role assignment
- **Products** - Product catalog with dynamic category management
- **Categories** - Add, edit, delete categories with custom colors
- **Barcodes** - Barcode management
- **Suppliers** - Supplier directory
- **Pricing** - Price tier management
- **Audit Log** - Action tracking

## Project Structure

```
src/
├── components/
│   ├── ui/                 # Design system (Button, Modal, Badge, etc.)
│   ├── layout/             # Shell, navigation, guards
│   ├── dashboard/          # Analytics components
│   │   ├── ProfitTrendChart.tsx
│   │   ├── GoalTracker.tsx
│   │   └── InventoryIntelligence.tsx
│   ├── pos/                # POS UI components
│   ├── inventory/          # Inventory UI components
│   ├── sales/              # Sales UI components
│   └── shifts/             # Shift UI components
├── features/
│   ├── auth/               # Authentication
│   ├── catalog/            # Product & barcode helpers
│   ├── pos/                # Cart calculations
│   ├── inventory/          # Inventory helpers
│   ├── sales/              # Refund/void logic
│   └── admin/              # Admin pages
├── pages/                  # Route-level compositions
├── stores/                 # Zustand stores
│   ├── authStore.ts        # Current user session
│   ├── appStore.ts         # Shop context
│   ├── languageStore.ts    # i18n preference
│   ├── toastStore.ts       # Notifications
│   └── data/               # Modular data store (slice pattern)
│       ├── index.ts        # Store composition & persistence
│       ├── types.ts        # All state interfaces & input types
│       ├── utils.ts        # ID generators, helpers
│       └── slices/         # Domain-specific state slices
│           ├── shopSlice.ts
│           ├── categorySlice.ts
│           ├── productSlice.ts
│           ├── inventorySlice.ts
│           ├── shiftSlice.ts
│           ├── saleSlice.ts
│           ├── transferSlice.ts
│           ├── purchaseSlice.ts
│           ├── pricingSlice.ts
│           └── auditSlice.ts
├── hooks/                  # Custom hooks
│   ├── useTranslation.ts
│   └── useDashboardInsights.ts
├── i18n/                   # Translations (English + Myanmar)
├── data/                   # Seed data
├── types/                  # TypeScript types
├── print/                  # Receipt printing
└── lib/                    # Utilities (formatMmk, cn, etc.)
```

## Routes

### Main Routes
- `/login` - Login page
- `/app/dashboard` - Analytics dashboard
- `/app/pos` - Point of Sale
- `/app/sales` - Sales history
- `/app/shifts` - Shift management
- `/app/inventory` - Stock levels
- `/app/transfers` - Inter-shop transfers
- `/app/purchases` - Purchase orders
- `/app/approvals` - Refund/void approvals
- `/app/catalog` - Product catalog (Buyer)

### Admin Routes
- `/app/admin/shops` - Shop management
- `/app/admin/users` - User management
- `/app/admin/products` - Product & category management
- `/app/admin/barcodes` - Barcode management
- `/app/admin/suppliers` - Supplier management
- `/app/admin/pricing` - Pricing tiers
- `/app/admin/audit` - Audit logs
- `/app/admin/reports` - Global reports

## User Roles

| Role | Permissions |
|------|-------------|
| **Admin** | Full access, all shops, all settings. Starts at Dashboard. |
| **Manager** | Shop-level access, reports, approvals |
| **Cashier** | POS, shifts, basic sales |
| **Buyer** | Purchase orders, suppliers, catalog |

## Translations

The app supports English and Myanmar (Burmese). Toggle language from the sidebar.

| English | Myanmar |
|---------|---------|
| Dashboard | ဒက်ရှ်ဘုတ် |
| Total Revenue | စုစုပေါင်းဝင်ငွေ |
| Total Profit | စုစုပေါင်းအမြတ် |
| Inventory Intelligence | ကုန်ပစ္စည်းထိန်းချုပ်မှု |
| Low Stock Alert | ကုန်ပစ္စည်းနည်းနေသည် |

## Data Persistence

All data is stored in browser localStorage using Zustand persist middleware:
- `shwephala-db` - Main data store (products, sales, inventory, etc.)
- `pos-auth` - Authentication state
- `pos-app` - App state (selected shop)
- `pos-language` - Language preference

## Documentation

See [/docs](/docs) folder for detailed documentation:

- [Overview](docs/00-overview.md)
- [Roles & Permissions](docs/01-roles-permissions.md)
- [Architecture](docs/17-architecture.md)
- [Data Model](docs/13-data-model.md)
- [Contributing](docs/19-contributing.md)

## License

Private - Shwe Pha La Co., Ltd.
