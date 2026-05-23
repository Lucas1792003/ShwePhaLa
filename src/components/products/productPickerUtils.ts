import type { Category, Product, ProductBarcode } from "../../types";
import { resolveCategoryIcon } from "../../features/categories/categoryIcons";

export const getProductPickerCategory = (product: Product, categories: Category[] = []) =>
  categories.find((category) => category.name === product.category);

export const getProductPickerCategoryIcon = (product: Product, categories: Category[] = []) => {
  const category = getProductPickerCategory(product, categories);
  return resolveCategoryIcon(category?.iconKey, category?.name ?? product.category);
};

const normalizeSearch = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

export const productMatchesPickerSearch = (
  product: Product,
  query: string,
  categories: Category[] = [],
  barcodes: ProductBarcode[] = [],
) => {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return true;

  const category = getProductPickerCategory(product, categories);
  const searchableValues = [
    product.name,
    product.sku,
    product.category,
    category?.name,
  ];

  const matchesProductFields = searchableValues.some((value) =>
    value ? normalizeSearch(value).includes(normalizedQuery) : false,
  );

  const matchesBarcode = barcodes.some(
    (barcode) =>
      barcode.productId === product.id &&
      normalizeSearch(barcode.value).includes(normalizedQuery),
  );

  return matchesProductFields || matchesBarcode;
};

export const filterProductPickerOptions = (
  products: Product[],
  query: string,
  categories: Category[] = [],
  barcodes: ProductBarcode[] = [],
) =>
  products.filter((product) =>
    productMatchesPickerSearch(product, query, categories, barcodes),
  );

export const getSelectedProduct = (products: Product[], productId: string) =>
  products.find((product) => product.id === productId);
