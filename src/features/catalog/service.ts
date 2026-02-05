import type { Product } from "../../types";

export const isLowStock = (qty: number, product: Product) => qty > 0 && qty <= product.lowStockThreshold;
