import type { Product, ProductBarcode } from "../../types";

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
  barcodes: ProductBarcode[]
): Product | undefined => {
  const value = (rawValue ?? "").trim();
  if (!value) return undefined;

  const barcode = barcodes.find((item) => item.value === value);
  if (barcode) {
    const matched = products.find((item) => item.id === barcode.productId);
    if (matched) return matched;
  }

  const upper = value.toUpperCase();
  return products.find((item) => !!item.sku && item.sku.toUpperCase() === upper);
};
