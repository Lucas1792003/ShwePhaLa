import type { Product, ProductCategory, ProductPurchaseType } from "../../types";

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
  aliasCode?: string;
  name: string;
  shortName?: string;
  category: ProductCategory;
  brandId?: string;
  unitType: string;
  priceMmk: number;
  costMmk?: number;
  lowStockThreshold: number;
  maxQty?: number;
  isOpenPrice: boolean;
  isNonStock: boolean;
  purchaseType?: ProductPurchaseType | "";
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
  const maxQty =
    typeof values.maxQty === "number" && Number.isFinite(values.maxQty) && values.maxQty >= 0
      ? Math.trunc(values.maxQty)
      : undefined;
  const purchaseType: ProductPurchaseType | undefined =
    values.purchaseType === "COD" || values.purchaseType === "CREDIT"
      ? values.purchaseType
      : undefined;

  return {
    id: productId,
    sku: values.sku,
    aliasCode: values.aliasCode?.trim() || undefined,
    name: values.name,
    shortName: values.shortName?.trim() || undefined,
    category: values.category,
    brandId: values.brandId || undefined,
    unitType: values.unitType,
    priceMmk: values.priceMmk,
    costMmk,
    // Legacy compatibility only. The create/edit form no longer writes a new
    // package size; old rows keep their value until a Product Units migration
    // can model sellable packs properly.
    packSize: existingProduct?.packSize,
    lowStockThreshold: values.lowStockThreshold,
    maxQty,
    isOpenPrice: values.isOpenPrice,
    isNonStock: values.isNonStock,
    purchaseType,
    expiryDate: values.expiryDate || undefined,
    imageUrl: values.imageUrl || undefined,
    isActive: values.isActive,
    createdAt: existingProduct?.createdAt ?? new Date().toISOString(),
  };
};
