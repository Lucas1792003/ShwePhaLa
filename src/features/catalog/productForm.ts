import type { Product, ProductCategory } from "../../types";

export const PRODUCT_FORM_VISIBLE_FIELDS = [
  "SKU",
  "Product Name",
  "Product Image",
  "Category",
  "Base Stock Unit",
  "Low Stock Threshold",
  "Expiry Date",
  "Active",
  "Units & Prices",
] as const;

export interface ProductFormValues {
  id?: string;
  sku: string;
  name: string;
  category: ProductCategory;
  unitType: string;
  priceMmk: number;
  costMmk?: number;
  lowStockThreshold: number;
  expiryDate?: string;
  imageUrl?: string;
  isActive: boolean;
}

export const buildProductFromFormValues = (
  values: ProductFormValues,
  productId: string,
  existingProduct?: Product | null
): Product => {
  const costMmk = Number.isFinite(values.costMmk) ? values.costMmk : undefined;

  return {
    id: productId,
    sku: values.sku,
    name: values.name,
    category: values.category,
    unitType: values.unitType,
    priceMmk: values.priceMmk,
    costMmk,
    // Legacy compatibility only. The create/edit form no longer writes a new
    // package size; old rows keep their value until a Product Units migration
    // can model sellable packs properly.
    packSize: existingProduct?.packSize,
    lowStockThreshold: values.lowStockThreshold,
    expiryDate: values.expiryDate || undefined,
    imageUrl: values.imageUrl || undefined,
    isActive: values.isActive,
    createdAt: existingProduct?.createdAt ?? new Date().toISOString(),
  };
};
