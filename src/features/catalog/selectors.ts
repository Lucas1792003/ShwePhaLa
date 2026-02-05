import type { Product, ProductBarcode } from "../../types";

export const findProductByBarcode = (products: Product[], barcodes: ProductBarcode[], value: string) => {
  const barcode = barcodes.find((item) => item.value === value.trim());
  return products.find((item) => item.id === barcode?.productId);
};
