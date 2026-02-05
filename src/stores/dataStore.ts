/**
 * Data Store
 *
 * This file re-exports from the modular data store for backward compatibility.
 * The store has been split into domain-specific slices for better maintainability:
 *
 * - slices/shopSlice.ts      - Shops & Users
 * - slices/categorySlice.ts  - Product Categories
 * - slices/productSlice.ts   - Products & Barcodes
 * - slices/inventorySlice.ts - Inventory & Stock Movements
 * - slices/shiftSlice.ts     - Shifts
 * - slices/saleSlice.ts      - Sales, Refunds, Voids
 * - slices/transferSlice.ts  - Stock Transfers
 * - slices/purchaseSlice.ts  - Suppliers & Purchase Orders
 * - slices/pricingSlice.ts   - Price Tiers
 * - slices/auditSlice.ts     - Audit Logs & Reprint Logs
 */
export { useDataStore } from "./data";
export type { DataState } from "./data";
