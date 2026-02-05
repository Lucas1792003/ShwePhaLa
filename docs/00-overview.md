# ShwePha La UI Overview

ShwePha La is a frontend-only POS and inventory prototype for multiple shops. It uses mock data, localStorage persistence, and role-based access to simulate production workflows without a backend.

## Key Highlights

### Core Features
- Role-aware routing, sidebar navigation, and shop scoping
- POS flow with barcode input, stock checks, receipt numbering, and reprints
- Inventory adjustments, shift lifecycle, and approvals for refunds/voids
- LocalStorage-backed mock database seeded on first load
- **Dynamic Category Management**: Admin can create, edit, and delete product categories with custom colors

### Decision-Making Dashboard
- Visual analytics with Recharts (line charts, bar charts, pie charts, area charts)
- Summary cards: Revenue, Investment, Profit, Orders, Avg Order Value
- **Profit Trend Module**: Daily profit/loss visualization with red/green bars, 7/30 day toggle
- **Goal & Target Tracking**: Revenue and profit progress rings with color-coded indicators
- **Inventory Intelligence**: Stock health summary, fast/slow movers, reorder suggestions
- Shop filter to view data by specific shop or all shops combined
- Top selling products, low stock alerts, recent sales feed

### Internationalization (i18n)
- Language switcher: English / Myanmar (မြန်မာ)
- Persistent language preference via Zustand + localStorage
- Translation coverage for sidebar, dashboard, POS, and common UI

### Modern UI/UX
- Redesigned POS with product grid layout and images
- Collapsible sidebar sections for cleaner navigation
- Sticky search and category filters in POS
- Pagination with page size selectors in inventory

## Tech Stack
- React 19 + TypeScript
- Zustand for state management
- React Router for navigation
- Recharts for data visualization
- Tailwind CSS for styling
