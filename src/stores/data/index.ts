import { create } from "zustand";
import { persist } from "zustand/middleware";
import { seedData } from "../../data/seed";
import type { DataState } from "./types";

// Import all slices
import { createShopSlice } from "./slices/shopSlice";
import { createCategorySlice } from "./slices/categorySlice";
import { createProductSlice } from "./slices/productSlice";
import { createInventorySlice } from "./slices/inventorySlice";
import { createShiftSlice } from "./slices/shiftSlice";
import { createSaleSlice } from "./slices/saleSlice";
import { createTransferSlice } from "./slices/transferSlice";
import { createPurchaseSlice } from "./slices/purchaseSlice";
import { createPricingSlice } from "./slices/pricingSlice";
import { createAuditSlice } from "./slices/auditSlice";

// Default categories if not in seed data
const defaultCategories = [
  { id: "cat-beer", name: "beer", color: "amber" as const, isActive: true, createdAt: new Date().toISOString() },
  { id: "cat-alcohol", name: "alcohol", color: "red" as const, isActive: true, createdAt: new Date().toISOString() },
  { id: "cat-juice", name: "juice", color: "green" as const, isActive: true, createdAt: new Date().toISOString() },
];

export const useDataStore = create<DataState>()(
  persist(
    (...args) => ({
      // Combine all slices
      ...createShopSlice(...args),
      ...createCategorySlice(...args),
      ...createProductSlice(...args),
      ...createInventorySlice(...args),
      ...createShiftSlice(...args),
      ...createSaleSlice(...args),
      ...createTransferSlice(...args),
      ...createPurchaseSlice(...args),
      ...createPricingSlice(...args),
      ...createAuditSlice(...args),

      // Initialize with seed data
      ...seedData,

      // Override with defaults for new collections
      categories: seedData.categories ?? defaultCategories,
      suppliers: seedData.suppliers ?? [],
      purchaseOrders: seedData.purchaseOrders ?? [],
      purchaseOrderItems: seedData.purchaseOrderItems ?? [],
      stockTransfers: seedData.stockTransfers ?? [],
      stockTransferItems: seedData.stockTransferItems ?? [],
      priceTiers: seedData.priceTiers ?? [],
    }),
    { name: "shwephala-db" }
  )
);

// Re-export types for convenience
export type { DataState } from "./types";
