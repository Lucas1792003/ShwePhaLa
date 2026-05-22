import { describe, it, expect } from "vitest";
import {
  CATEGORY_ICONS,
  DEFAULT_CATEGORY_ICON,
  DEFAULT_CATEGORY_ICON_KEY,
  resolveCategoryIcon,
  resolveCategoryIconSymbol,
  getCategoryIconByKey,
} from "./categoryIcons";

describe("category icon registry", () => {
  it("has unique keys and a label + symbol for every entry", () => {
    const keys = CATEGORY_ICONS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const icon of CATEGORY_ICONS) {
      expect(icon.key).toBeTruthy();
      expect(icon.label).toBeTruthy();
      expect(icon.symbol).toBeTruthy();
    }
  });

  it("includes the default icon", () => {
    expect(getCategoryIconByKey(DEFAULT_CATEGORY_ICON_KEY)).toBeDefined();
    expect(DEFAULT_CATEGORY_ICON.key).toBe(DEFAULT_CATEGORY_ICON_KEY);
  });
});

describe("resolveCategoryIcon", () => {
  it("resolves an explicit, known iconKey", () => {
    expect(resolveCategoryIcon("beer").key).toBe("beer");
    expect(resolveCategoryIcon("beer").symbol).toBe("sports_bar");
    expect(resolveCategoryIcon("coffee").key).toBe("coffee");
  });

  it("iconKey takes precedence over the category name", () => {
    // explicit "wine" key wins even though the name would map to beer
    expect(resolveCategoryIcon("wine", "Beer").key).toBe("wine");
  });

  it("falls back to the category name when iconKey is missing", () => {
    expect(resolveCategoryIcon(undefined, "Beer").key).toBe("beer");
    expect(resolveCategoryIcon(undefined, "juice").key).toBe("juice");
  });

  it("matches name aliases and plurals (Beers, Soft Drinks, Spirits)", () => {
    expect(resolveCategoryIcon(undefined, "Beers").key).toBe("beer");
    expect(resolveCategoryIcon(undefined, "Soft Drinks").key).toBe("soda");
    expect(resolveCategoryIcon(undefined, "Spirits").key).toBe("alcohol");
    expect(resolveCategoryIcon(null, "  WATER  ").key).toBe("water");
  });

  it("returns the default icon for an unknown iconKey AND unknown name", () => {
    expect(resolveCategoryIcon("not-a-real-key").key).toBe(DEFAULT_CATEGORY_ICON_KEY);
    expect(resolveCategoryIcon(undefined, "Mystery Stuff").key).toBe(DEFAULT_CATEGORY_ICON_KEY);
    expect(resolveCategoryIcon(undefined, undefined).key).toBe(DEFAULT_CATEGORY_ICON_KEY);
  });

  it("an unknown iconKey still falls through to a name match", () => {
    // a stale/legacy iconKey must not block name resolution
    expect(resolveCategoryIcon("legacy-bad-key", "Coffee").key).toBe("coffee");
  });

  it("a legacy category with no iconKey still renders a real icon", () => {
    // mimics a pre-migration row: iconKey undefined
    const icon = resolveCategoryIcon(undefined, "alcohol");
    expect(icon.symbol).toBe("liquor");
    expect(icon.symbol).toBeTruthy();
  });

  it("resolveCategoryIconSymbol returns the symbol string", () => {
    expect(resolveCategoryIconSymbol("beer")).toBe("sports_bar");
    expect(resolveCategoryIconSymbol(undefined, "totally-unknown")).toBe(
      DEFAULT_CATEGORY_ICON.symbol,
    );
  });
});
