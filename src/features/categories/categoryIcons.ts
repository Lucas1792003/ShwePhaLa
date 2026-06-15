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
 * Available category icons for a full convenience store (think 7-Eleven):
 * drinks, fresh/prepared food, bakery & sweets, snacks, household, personal
 * care & health, baby & pet, tech, services (gift cards / top-up) and general
 * buckets. Material Symbols lacks crisp icons for a few items, so those reuse
 * the closest available glyph. `other` is always present as the fallback.
 */
export const CATEGORY_ICONS: CategoryIcon[] = [
  // Drinks
  { key: "beer", label: "Beer", symbol: "sports_bar" },
  { key: "wine", label: "Wine", symbol: "wine_bar" },
  { key: "alcohol", label: "Alcohol / Spirits", symbol: "liquor" },
  { key: "cocktail", label: "Cocktail", symbol: "local_bar" },
  { key: "soda", label: "Soft Drink", symbol: "local_drink" },
  { key: "juice", label: "Juice", symbol: "local_cafe" },
  { key: "smoothie", label: "Smoothie / Shake", symbol: "blender" },
  { key: "water", label: "Water", symbol: "water_drop" },
  { key: "energy", label: "Energy Drink", symbol: "bolt" },
  { key: "coffee", label: "Coffee", symbol: "coffee" },
  { key: "tea", label: "Tea", symbol: "emoji_food_beverage" },
  // Food — fresh & prepared
  { key: "food", label: "Food", symbol: "fastfood" },
  { key: "meal", label: "Ready Meal", symbol: "restaurant" },
  { key: "noodle", label: "Noodles", symbol: "ramen_dining" },
  { key: "rice", label: "Rice & Grains", symbol: "rice_bowl" },
  { key: "meat", label: "Meat", symbol: "kebab_dining" },
  { key: "seafood", label: "Seafood", symbol: "set_meal" },
  { key: "fruit", label: "Fruit", symbol: "nutrition" },
  { key: "vegetable", label: "Vegetable", symbol: "eco" },
  { key: "dairy", label: "Dairy & Eggs", symbol: "egg" },
  { key: "ice", label: "Ice / Frozen", symbol: "ac_unit" },
  // Bakery, snacks & sweets
  { key: "bakery", label: "Bakery / Bread", symbol: "bakery_dining" },
  { key: "dessert", label: "Cake / Dessert", symbol: "cake" },
  { key: "candy", label: "Candy / Ice Cream", symbol: "icecream" },
  { key: "snack", label: "Snacks / Chips", symbol: "cookie" },
  // Tobacco
  { key: "tobacco", label: "Cigarettes / Tobacco", symbol: "smoking_rooms" },
  // Household & cleaning
  { key: "household", label: "Household", symbol: "home" },
  { key: "cleaning", label: "Cleaning", symbol: "cleaning_services" },
  // Personal care & health
  { key: "personal_care", label: "Personal Care", symbol: "soap" },
  { key: "health", label: "Health / Pharmacy", symbol: "medication" },
  // Baby & pet
  { key: "baby", label: "Baby", symbol: "child_care" },
  { key: "pet", label: "Pet", symbol: "pets" },
  // Tech & stationery
  { key: "electronics", label: "Electronics", symbol: "devices" },
  { key: "battery", label: "Batteries", symbol: "battery_full" },
  { key: "stationery", label: "Stationery", symbol: "edit" },
  { key: "newspaper", label: "Newspaper / Magazine", symbol: "newspaper" },
  // Services
  { key: "giftcard", label: "Gift Card / Voucher", symbol: "card_giftcard" },
  { key: "topup", label: "Mobile Top-up / SIM", symbol: "sim_card" },
  // General
  { key: "grocery", label: "Grocery", symbol: "shopping_basket" },
  { key: "package", label: "Packaged / Canned", symbol: "inventory_2" },
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
  // Drinks
  beer: "beer", beers: "beer", lager: "beer", ale: "beer", draft: "beer",
  wine: "wine", wines: "wine",
  alcohol: "alcohol", alcoholic: "alcohol", spirits: "alcohol", spirit: "alcohol",
  liquor: "alcohol", whisky: "alcohol", whiskey: "alcohol", vodka: "alcohol",
  rum: "alcohol", gin: "alcohol", brandy: "alcohol",
  cocktail: "cocktail", cocktails: "cocktail", mixer: "cocktail", mixers: "cocktail",
  soda: "soda", sodas: "soda", "soft drink": "soda", "soft drinks": "soda",
  softdrink: "soda", "soft-drink": "soda", "fizzy drink": "soda", pop: "soda",
  drink: "soda", drinks: "soda", beverage: "soda", beverages: "soda",
  juice: "juice", juices: "juice",
  smoothie: "smoothie", smoothies: "smoothie", shake: "smoothie", shakes: "smoothie", milkshake: "smoothie",
  water: "water", "mineral water": "water", "drinking water": "water",
  energy: "energy", "energy drink": "energy", "energy drinks": "energy",
  coffee: "coffee", coffees: "coffee",
  tea: "tea", teas: "tea",
  // Food — fresh & prepared
  food: "food", foods: "food",
  meal: "meal", meals: "meal", restaurant: "meal", "ready meal": "meal", "hot food": "meal",
  noodle: "noodle", noodles: "noodle", pasta: "noodle", ramen: "noodle", "instant noodle": "noodle",
  rice: "rice", grain: "rice", grains: "rice",
  meat: "meat", meats: "meat", chicken: "meat", pork: "meat", beef: "meat", sausage: "meat",
  seafood: "seafood", fish: "seafood", prawn: "seafood", shrimp: "seafood",
  fruit: "fruit", fruits: "fruit",
  vegetable: "vegetable", vegetables: "vegetable", veggie: "vegetable", veggies: "vegetable", veg: "vegetable",
  dairy: "dairy", milk: "dairy", egg: "dairy", eggs: "dairy", cheese: "dairy", butter: "dairy", yogurt: "dairy", yoghurt: "dairy",
  ice: "ice", frozen: "ice", "frozen food": "ice",
  // Bakery, snacks & sweets
  bakery: "bakery", bread: "bakery", pastry: "bakery", pastries: "bakery", bun: "bakery", buns: "bakery", toast: "bakery",
  dessert: "dessert", desserts: "dessert", cake: "dessert", cakes: "dessert",
  candy: "candy", candies: "candy", sweet: "candy", sweets: "candy", chocolate: "candy", chocolates: "candy", gum: "candy",
  "ice cream": "candy", icecream: "candy",
  snack: "snack", snacks: "snack", chips: "snack", crisps: "snack", biscuit: "snack", biscuits: "snack", nuts: "snack",
  // Tobacco
  tobacco: "tobacco", cigarette: "tobacco", cigarettes: "tobacco", cigar: "tobacco", cigars: "tobacco", smoke: "tobacco", smoking: "tobacco", vape: "tobacco", lighter: "tobacco",
  // Household & cleaning
  household: "household", home: "household", kitchenware: "household", utensil: "household", utensils: "household", tissue: "household", "paper towel": "household",
  cleaning: "cleaning", detergent: "cleaning", cleaner: "cleaning", cleaners: "cleaning", "dish soap": "cleaning", bleach: "cleaning",
  // Personal care & health
  "personal care": "personal_care", personalcare: "personal_care", toiletries: "personal_care",
  soap: "personal_care", shampoo: "personal_care", toothpaste: "personal_care", deodorant: "personal_care",
  cosmetics: "personal_care", cosmetic: "personal_care", beauty: "personal_care", razor: "personal_care",
  health: "health", medicine: "health", medical: "health", pharmacy: "health", drug: "health", drugs: "health", pill: "health", tablet: "health", vitamin: "health", vitamins: "health", "first aid": "health",
  // Baby & pet
  baby: "baby", babies: "baby", diaper: "baby", diapers: "baby", infant: "baby",
  pet: "pet", pets: "pet", "pet food": "pet", "pet care": "pet",
  // Tech & stationery
  electronics: "electronics", electronic: "electronics", gadget: "electronics", gadgets: "electronics", charger: "electronics", cable: "electronics", earphone: "electronics", earphones: "electronics", accessory: "electronics", accessories: "electronics",
  battery: "battery", batteries: "battery",
  stationery: "stationery", stationary: "stationery", "office supplies": "stationery", pen: "stationery", pens: "stationery", paper: "stationery", notebook: "stationery",
  newspaper: "newspaper", newspapers: "newspaper", magazine: "newspaper", magazines: "newspaper", news: "newspaper",
  // Services
  giftcard: "giftcard", "gift card": "giftcard", "gift cards": "giftcard", voucher: "giftcard", vouchers: "giftcard", coupon: "giftcard", coupons: "giftcard",
  topup: "topup", "top-up": "topup", "top up": "topup", sim: "topup", "sim card": "topup", recharge: "topup", mobile: "topup", "phone card": "topup",
  // General
  grocery: "grocery", groceries: "grocery",
  package: "package", packages: "package", canned: "package", can: "package", cans: "package", tin: "package", box: "package", boxes: "package",
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
