/**
 * Category usage / safe-delete helpers.
 *
 * A category may only be deleted when no products reference it. Products
 * reference a category by NAME (`product.category` is the category name
 * string — there is no category_id foreign key), so usage is counted by name.
 *
 * Shared by the UI (`handleDeleteCategory`) and the data layer
 * (`deleteCategory` store action) so the rule is enforced in one place.
 */
import type { Product } from "../../types";

/** How many products currently reference a category (matched by name). */
export function countProductsUsingCategory(
  products: Product[],
  categoryName: string,
): number {
  return products.filter((p) => p.category === categoryName).length;
}

/**
 * Returns a friendly block message if the category cannot be deleted (because
 * products still use it), or `null` if deletion is safe.
 */
export function getCategoryDeleteBlockMessage(
  products: Product[],
  categoryName: string,
): string | null {
  const count = countProductsUsingCategory(products, categoryName);
  if (count > 0) {
    return `This category is used by ${count} product(s). Move or edit those products before deleting the category.`;
  }
  return null;
}
