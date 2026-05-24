import type { CSSProperties } from "react";
import type { Product } from "../../types";
import { cn, formatMmk } from "../../lib/utils";
import {
  getLabelTemplate,
  type BarcodeLabelTemplate,
  type BarcodeLabelTemplateKey,
} from "../../features/barcodes/labelTemplates";
import { BarcodeSvg } from "./BarcodeSvg";

interface BarcodeLabelProps {
  product: Pick<Product, "name" | "priceMmk">;
  unitName?: string;
  unitPriceMmk?: number;
  value: string;
  templateKey?: BarcodeLabelTemplateKey | string;
}

type LabelStyle = CSSProperties & {
  "--label-width": string;
  "--label-height": string;
};

const getBarcodeConfig = (template: BarcodeLabelTemplate) => {
  switch (template.variant) {
    case "compact":
      return { width: 1.45, height: 38, fontSize: 9, displayValue: template.showCode };
    case "price":
      return { width: 1.35, height: 28, fontSize: 9, displayValue: template.showCode };
    case "large":
      return { width: 1.9, height: 54, fontSize: 13, displayValue: template.showCode };
    case "standard":
    default:
      return { width: 1.6, height: 36, fontSize: 11, displayValue: template.showCode };
  }
};

const getLabelStyle = (template: BarcodeLabelTemplate): LabelStyle => ({
  "--label-width": `${template.widthMm}mm`,
  "--label-height": `${template.heightMm}mm`,
});

const LabelBarcode = ({ value, template }: { value: string; template: BarcodeLabelTemplate }) => {
  const barcode = getBarcodeConfig(template);
  return (
    <BarcodeSvg
      value={value}
      width={barcode.width}
      height={barcode.height}
      fontSize={barcode.fontSize}
      displayValue={barcode.displayValue}
      className="barcode-label__svg"
    />
  );
};

/**
 * Single barcode label. Used both in preview and inside the print sheet:
 * same DOM, same selected template, same millimeter dimensions.
 */
export const BarcodeLabel = ({ product, unitName, unitPriceMmk, value, templateKey }: BarcodeLabelProps) => {
  const template = getLabelTemplate(templateKey);
  const labelName = unitName ? `${product.name} - ${unitName}` : product.name;
  const price = formatMmk(unitPriceMmk ?? product.priceMmk);

  if (template.variant === "compact") {
    return (
      <div
        className={cn("barcode-label flex flex-col border border-slate-300 bg-white text-slate-950", template.className)}
        data-template={template.key}
        style={getLabelStyle(template)}
      >
        <div className="px-1.5 pt-1">
          {template.showName && (
            <div className="truncate text-[8px] font-semibold leading-none text-slate-900">{labelName}</div>
          )}
        </div>
        <div className="flex flex-1 items-center justify-center px-1">
          <LabelBarcode value={value} template={template} />
        </div>
        {template.showPrice && (
          <div className="px-1.5 pb-1 text-right text-[8px] font-semibold leading-none text-emerald-700">{price}</div>
        )}
      </div>
    );
  }

  if (template.variant === "price") {
    return (
      <div
        className={cn(
          "barcode-label flex flex-col items-stretch border border-slate-300 bg-white text-slate-950",
          template.className
        )}
        data-template={template.key}
        style={getLabelStyle(template)}
      >
        <div className="px-2 pt-1 text-center">
          {template.showName && <div className="truncate text-[9px] font-semibold leading-tight">{labelName}</div>}
          {template.showPrice && <div className="mt-0.5 text-base font-black leading-none text-slate-950">{price}</div>}
        </div>
        <div className="flex flex-1 items-end justify-center px-1 pb-1">
          <LabelBarcode value={value} template={template} />
        </div>
      </div>
    );
  }

  if (template.variant === "large") {
    return (
      <div
        className={cn(
          "barcode-label flex flex-col items-stretch justify-between border border-slate-300 bg-white text-slate-950",
          template.className
        )}
        data-template={template.key}
        style={getLabelStyle(template)}
      >
        <div className="px-3 pt-2 text-center">
          {template.showName && <div className="line-clamp-2 text-xs font-bold leading-tight">{labelName}</div>}
          {template.showPrice && (
            <div className="mt-0.5 text-sm font-extrabold leading-none text-emerald-700">{price}</div>
          )}
        </div>
        <div className="flex justify-center px-2 pb-2">
          <LabelBarcode value={value} template={template} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "barcode-label flex flex-col items-stretch justify-between border border-slate-300 bg-white text-slate-950",
        template.className
      )}
      data-template={template.key}
      style={getLabelStyle(template)}
    >
      <div className="px-2 pt-1 text-[10px] font-semibold leading-tight text-slate-900">
        {template.showName && <div className="line-clamp-2">{labelName}</div>}
        {template.showPrice && <div className="text-emerald-700">{price}</div>}
      </div>
      <div className="flex justify-center px-1 pb-1">
        <LabelBarcode value={value} template={template} />
      </div>
    </div>
  );
};
