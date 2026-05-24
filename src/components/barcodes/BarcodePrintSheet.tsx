import type { CSSProperties } from "react";
import type { Product } from "../../types";
import { clampLabelQty } from "../../features/barcodes/labels";
import {
  getLabelTemplate,
  type BarcodeLabelTemplate,
  type BarcodeLabelTemplateKey,
} from "../../features/barcodes/labelTemplates";
import { BarcodeLabel } from "./BarcodeLabel";

interface BarcodePrintSheetProps {
  product: Pick<Product, "name" | "priceMmk">;
  unitName?: string;
  unitPriceMmk?: number;
  value: string;
  quantity: number;
  templateKey?: BarcodeLabelTemplateKey | string;
}

type PrintStyle = CSSProperties & {
  "--label-width": string;
  "--label-height": string;
};

const getPrintStyle = (template: BarcodeLabelTemplate): PrintStyle => ({
  "--label-width": `${template.widthMm}mm`,
  "--label-height": `${template.heightMm}mm`,
});

/**
 * The off-screen print sheet that `window.print()` outputs. It is the only
 * element revealed by print CSS, and each label gets the selected template's
 * millimeter dimensions and named-page hint.
 */
export const BarcodePrintSheet = ({ product, unitName, unitPriceMmk, value, quantity, templateKey }: BarcodePrintSheetProps) => {
  const template = getLabelTemplate(templateKey);
  const safeQuantity = clampLabelQty(quantity);

  return (
    <div className="label-print-sheet" data-template={template.key} style={getPrintStyle(template)}>
      {Array.from({ length: safeQuantity }).map((_, index) => (
        <div key={index} className={`label-print-page ${template.pageClassName}`}>
          <BarcodeLabel
            product={product}
            unitName={unitName}
            unitPriceMmk={unitPriceMmk}
            value={value}
            templateKey={template.key}
          />
        </div>
      ))}
    </div>
  );
};
