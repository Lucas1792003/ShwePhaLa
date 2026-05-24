import type { Product, ProductBarcode, ProductUnit } from "../../types";
import { getDefaultProductUnit } from "../catalog/productUnits";

export interface ProductScanMatch {
  product: Product;
  unit: ProductUnit;
  barcode?: ProductBarcode;
}

// Resolve a scanned/typed code to a product, mirroring the label printer's
// selection rule (see features/barcodes/labels.ts → getPrintableBarcodeValue):
// product_barcodes.value first, falling back to products.sku. Without this
// fallback, products with only a SKU print labels that scan as "not found".
//
// SKU is matched case-insensitively because scanners read whatever is encoded
// (always upper-case for CODE128/EAN), but manual entry may differ in case.
// product_barcodes.value is matched verbatim to preserve EAN/UPC encoding.
export const findProductForScan = (
  rawValue: string,
  products: Product[],
  productUnits: ProductUnit[],
  barcodes: ProductBarcode[]
): ProductScanMatch | undefined => {
  const value = (rawValue ?? "").trim();
  if (!value) return undefined;

  const barcode = barcodes.find((item) => item.value === value);
  if (barcode) {
    const matched = products.find((item) => item.id === barcode.productId);
    if (!matched) return undefined;
    const unit = barcode.productUnitId
      ? productUnits.find(
          (item) => item.id === barcode.productUnitId && item.productId === matched.id && item.isActive,
        )
      : getDefaultProductUnit(matched, productUnits);
    if (!unit) return undefined;
    return { product: matched, unit, barcode };
  }

  const upper = value.toUpperCase();
  const product = products.find((item) => !!item.sku && item.sku.toUpperCase() === upper);
  if (!product) return undefined;
  return { product, unit: getDefaultProductUnit(product, productUnits) };
};
