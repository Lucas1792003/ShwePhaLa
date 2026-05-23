import type { Product } from "../../types";

export const getPriceTierProductError = (productId: string, products: Product[]) => {
  if (!productId) return "Product is required.";

  const product = products.find((item) => item.id === productId);
  if (!product || !product.isActive) {
    return "Selected product is no longer available.";
  }

  return null;
};
