import { describe, expect, it } from "vitest";
import {
  BARCODE_LABEL_TEMPLATES,
  DEFAULT_BARCODE_LABEL_TEMPLATE_KEY,
  getDefaultLabelTemplate,
  getLabelTemplate,
} from "./labelTemplates";

describe("barcode label templates", () => {
  it("uses Standard as the default template", () => {
    expect(DEFAULT_BARCODE_LABEL_TEMPLATE_KEY).toBe("standard");
    expect(getDefaultLabelTemplate().key).toBe("standard");
  });

  it("defines valid positive dimensions for every template", () => {
    for (const template of BARCODE_LABEL_TEMPLATES) {
      expect(template.widthMm).toBeGreaterThan(0);
      expect(template.heightMm).toBeGreaterThan(0);
      expect(template.className).toContain(template.key);
      expect(template.pageClassName).toContain(template.key);
    }
  });

  it("keeps template keys unique", () => {
    const keys = BARCODE_LABEL_TEMPLATES.map((template) => template.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("falls back to the default template for unknown keys", () => {
    expect(getLabelTemplate("missing-template").key).toBe("standard");
    expect(getLabelTemplate(null).key).toBe("standard");
  });
});
