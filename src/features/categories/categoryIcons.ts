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
  { key: "bakery", label: "Bakery", symbol: "bakery_dining" },
  { key: "dairy", label: "Dairy & Eggs", symbol: "egg" },
  { key: "fruit", label: "Fruit", symbol: "nutrition" },
  { key: "vegetable", label: "Vegetable", symbol: "eco" },
  { key: "meat", label: "Meat", symbol: "kebab_dining" },
  { key: "seafood", label: "Seafood", symbol: "set_meal" },
  { key: "rice", label: "Rice & Grains", symbol: "rice_bowl" },
  { key: "dessert", label: "Dessert", symbol: "cake" },
  { key: "candy", label: "Sweets", symbol: "icecream" },
  { key: "grocery", label: "Grocery", symbol: "shopping_basket" },
  { key: "household", label: "Household", symbol: "home" },
  { key: "cleaning", label: "Cleaning", symbol: "cleaning_services" },
  { key: "personal_care", label: "Personal Care", symbol: "soap" },
  { key: "health", label: "Health", symbol: "medical_services" },
  { key: "baby", label: "Baby", symbol: "child_care" },
  { key: "pet", label: "Pet", symbol: "pets" },
  { key: "tobacco", label: "Tobacco", symbol: "smoking_rooms" },
  { key: "stationery", label: "Stationery", symbol: "edit" },
  { key: "electronics", label: "Electronics", symbol: "devices" },
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
  bakery: "bakery", bread: "bakery", pastry: "bakery", pastries: "bakery", bun: "bakery",
  dairy: "dairy", milk: "dairy", egg: "dairy", eggs: "dairy", cheese: "dairy", butter: "dairy", yogurt: "dairy",
  fruit: "fruit", fruits: "fruit",
  vegetable: "vegetable", vegetables: "vegetable", veggie: "vegetable", veggies: "vegetable", veg: "vegetable",
  meat: "meat", meats: "meat", chicken: "meat", pork: "meat", beef: "meat",
  seafood: "seafood", fish: "seafood", prawn: "seafood", shrimp: "seafood",
  rice: "rice", grain: "rice", grains: "rice", noodle: "rice", noodles: "rice", pasta: "rice",
  dessert: "dessert", desserts: "dessert", cake: "dessert", cakes: "dessert",
  candy: "candy", candies: "candy", sweet: "candy", sweets: "candy", chocolate: "candy",
  grocery: "grocery", groceries: "grocery",
  household: "household", home: "household", kitchenware: "household", utensil: "household", utensils: "household",
  cleaning: "cleaning", detergent: "cleaning", soap: "cleaning", cleaner: "cleaning", cleaners: "cleaning",
  "personal care": "personal_care", personalcare: "personal_care", toiletries: "personal_care",
  shampoo: "personal_care", cosmetics: "personal_care", cosmetic: "personal_care", beauty: "personal_care",
  health: "health", medicine: "health", medical: "health", pharmacy: "health", drug: "health", drugs: "health",
  baby: "baby", babies: "baby", diaper: "baby", diapers: "baby", infant: "baby",
  pet: "pet", pets: "pet", "pet food": "pet", "pet care": "pet",
  tobacco: "tobacco", cigarette: "tobacco", cigarettes: "tobacco", cigar: "tobacco", smoke: "tobacco", smoking: "tobacco",
  stationery: "stationery", stationary: "stationery", "office supplies": "stationery", pen: "stationery", pens: "stationery", paper: "stationery",
  electronics: "electronics", electronic: "electronics", gadget: "electronics", gadgets: "electronics", battery: "electronics", batteries: "electronics",
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
