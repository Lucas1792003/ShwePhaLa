/**
 * Central category icon registry.
 *
 * Shared by the POS category filter buttons and the Product/Admin category
 * management UI so categories look identical everywhere.
 *
 * NOTE ON THE ICON LIBRARY: this project does not depend on `lucide-react`.
 * The whole app renders icons with the Material Symbols web font
 * (`<span className="material-symbols-rounded">name</span>`), and the POS
 * category buttons already do. So the registry stores Material Symbols
 * ligature names (strings) as `symbol` — that is the app's existing icon
 * system, used here for consistency and zero new dependencies.
 */

export interface CategoryIcon {
  /** Stable key persisted on `Category.iconKey`. */
  key: string;
  /** Human label shown in the icon picker. */
  label: string;
  /** Material Symbols ligature name (render in a `material-symbols-rounded` span). */
  symbol: string;
}

/**
 * Available category icons. Material Symbols lacks crisp distinct icons for a
 * few of the requested categories (milk, can, separate "cup"); those are
 * folded into the closest available icon (e.g. Soft Drink / Cocktail).
 */
export const CATEGORY_ICONS: CategoryIcon[] = [
  { key: "beer", label: "Beer", symbol: "sports_bar" },
  { key: "wine", label: "Wine", symbol: "wine_bar" },
  { key: "alcohol", label: "Alcohol", symbol: "liquor" },
  { key: "cocktail", label: "Cocktail", symbol: "local_bar" },
  { key: "juice", label: "Juice", symbol: "local_cafe" },
  { key: "soda", label: "Soft Drink", symbol: "local_drink" },
  { key: "water", label: "Water", symbol: "water_drop" },
  { key: "coffee", label: "Coffee", symbol: "coffee" },
  { key: "tea", label: "Tea", symbol: "emoji_food_beverage" },
  { key: "energy", label: "Energy Drink", symbol: "bolt" },
  { key: "ice", label: "Ice", symbol: "ac_unit" },
  { key: "snack", label: "Snack", symbol: "cookie" },
  { key: "food", label: "Food", symbol: "fastfood" },
  { key: "grocery", label: "Grocery", symbol: "shopping_basket" },
  { key: "package", label: "Package", symbol: "inventory_2" },
  { key: "promo", label: "Promotion", symbol: "local_offer" },
  { key: "special", label: "Special", symbol: "star" },
  { key: "other", label: "Other", symbol: "category" },
];

/** Key of the fallback icon — always present in `CATEGORY_ICONS`. */
export const DEFAULT_CATEGORY_ICON_KEY = "other";

const ICONS_BY_KEY = new Map(CATEGORY_ICONS.map((icon) => [icon.key, icon]));

/** The default fallback icon. */
export const DEFAULT_CATEGORY_ICON: CategoryIcon =
  ICONS_BY_KEY.get(DEFAULT_CATEGORY_ICON_KEY)!;

/**
 * Normalized category NAME → registry key. Lets old categories that have no
 * `iconKey` still resolve to a sensible icon by their name.
 */
const NAME_ALIASES: Record<string, string> = {
  beer: "beer", beers: "beer", lager: "beer", ale: "beer", draft: "beer",
  wine: "wine", wines: "wine",
  alcohol: "alcohol", alcoholic: "alcohol", spirits: "alcohol", spirit: "alcohol",
  liquor: "alcohol", whisky: "alcohol", whiskey: "alcohol", vodka: "alcohol",
  rum: "alcohol", gin: "alcohol", brandy: "alcohol",
  cocktail: "cocktail", cocktails: "cocktail", mixer: "cocktail", mixers: "cocktail",
  juice: "juice", juices: "juice",
  soda: "soda", sodas: "soda", "soft drink": "soda", "soft drinks": "soda",
  softdrink: "soda", "soft-drink": "soda", "fizzy drink": "soda", pop: "soda",
  water: "water", "mineral water": "water", "drinking water": "water",
  coffee: "coffee", coffees: "coffee",
  tea: "tea", teas: "tea",
  energy: "energy", "energy drink": "energy", "energy drinks": "energy",
  ice: "ice", "ice cream": "ice", icecream: "ice", frozen: "ice",
  snack: "snack", snacks: "snack", chips: "snack", crisps: "snack",
  food: "food", foods: "food", meal: "food", meals: "food",
  grocery: "grocery", groceries: "grocery",
  package: "package", packages: "package", box: "package", boxes: "package",
  carton: "package", cartons: "package", bundle: "package",
  promo: "promo", promotion: "promo", promotions: "promo",
  offer: "promo", offers: "promo", sale: "promo", discount: "promo",
  special: "special", specials: "special", featured: "special", premium: "special",
  other: "other", others: "other", misc: "other", general: "other", uncategorized: "other",
};

/**
 * Resolve the icon for a category:
 *   1. an explicit, known `iconKey`;
 *   2. else a match on the category NAME (exact key or a known alias);
 *   3. else the default icon.
 * Always returns a valid `CategoryIcon` — never throws.
 */
export function resolveCategoryIcon(
  iconKey?: string | null,
  categoryName?: string | null,
): CategoryIcon {
  if (iconKey) {
    const byKey = ICONS_BY_KEY.get(iconKey);
    if (byKey) return byKey;
  }
  if (categoryName) {
    const norm = categoryName.trim().toLowerCase();
    const key = ICONS_BY_KEY.has(norm) ? norm : NAME_ALIASES[norm];
    if (key) {
      const byName = ICONS_BY_KEY.get(key);
      if (byName) return byName;
    }
  }
  return DEFAULT_CATEGORY_ICON;
}

/** Convenience: just the Material Symbols ligature name for a category. */
export function resolveCategoryIconSymbol(
  iconKey?: string | null,
  categoryName?: string | null,
): string {
  return resolveCategoryIcon(iconKey, categoryName).symbol;
}

/** Look up a registry entry by key (e.g. to validate a stored `iconKey`). */
export function getCategoryIconByKey(key: string): CategoryIcon | undefined {
  return ICONS_BY_KEY.get(key);
}
