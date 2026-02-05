# Mock Data Schema

The mock database lives in localStorage and is seeded on first load.

Core collections:
- `shops`
- `users`
- `categories` - Dynamic product categories (admin-managed)
- `products`
- `barcodes`
- `inventory`
- `sales`
- `saleItems`
- `shifts`
- `auditLogs`
- `refundVoidRequests`

See `src/data/seed.ts` for the full seed dataset and types in `src/types/domain.ts`.
