import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Product } from "../../types";
import { BarcodeLabel } from "./BarcodeLabel";
import { BarcodePrintSheet } from "./BarcodePrintSheet";

const product = {
  name: "Test Product",
  priceMmk: 2500,
};

describe("BarcodeLabel", () => {
  it("renders the selected template key for preview labels", () => {
    const markup = renderToStaticMarkup(
      <BarcodeLabel product={product} value="SKU-001" templateKey="price" />
    );

    expect(markup).toContain('data-template="price"');
    expect(markup).toContain("barcode-label--price");
    expect(markup).toContain("--label-width:60mm");
    expect(markup).toContain("--label-height:30mm");
  });

  it("falls back to the Standard template", () => {
    const markup = renderToStaticMarkup(
      <BarcodeLabel product={product} value="SKU-001" templateKey="unknown" />
    );

    expect(markup).toContain('data-template="standard"');
    expect(markup).toContain("barcode-label--standard");
  });

  it("does not render legacy packSize data", () => {
    const legacyProduct: Product = {
      id: "prod-legacy",
      name: "Legacy Case Product",
      category: "Drinks",
      unitType: "Can",
      priceMmk: 2500,
      lowStockThreshold: 5,
      packSize: 24,
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    const markup = renderToStaticMarkup(
      <BarcodeLabel product={legacyProduct} value="SKU-001" templateKey="standard" />
    );

    expect(markup).not.toContain("24");
    expect(markup).not.toContain("Pack");
  });

  it("renders selected sellable unit name and price", () => {
    const markup = renderToStaticMarkup(
      <BarcodeLabel product={product} unitName="Case" unitPriceMmk={55000} value="CASE-001" templateKey="standard" />
    );

    expect(markup).toContain("Test Product - Case");
    expect(markup).toContain("55,000");
  });
});

describe("BarcodePrintSheet", () => {
  it("renders the selected template key and page class for print jobs", () => {
    const markup = renderToStaticMarkup(
      <BarcodePrintSheet product={product} value="SKU-001" quantity={2} templateKey="large" />
    );

    expect(markup).toContain('data-template="large"');
    expect(markup).toContain("label-print-page--large");
    expect(markup.match(/class="label-print-page /g)).toHaveLength(2);
  });

  it("clamps print quantity to the existing 1-200 range", () => {
    const markup = renderToStaticMarkup(
      <BarcodePrintSheet product={product} value="SKU-001" quantity={205} templateKey="compact" />
    );

    expect(markup.match(/class="label-print-page /g)).toHaveLength(200);
  });
});
