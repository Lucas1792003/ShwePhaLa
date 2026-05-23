export type BarcodeLabelTemplateKey = "compact" | "standard" | "price" | "large";
export type BarcodeLabelVariant = BarcodeLabelTemplateKey;

export interface BarcodeLabelTemplate {
  key: BarcodeLabelTemplateKey;
  displayName: string;
  description: string;
  widthMm: number;
  heightMm: number;
  className: string;
  pageClassName: string;
  variant: BarcodeLabelVariant;
  showName: boolean;
  showPrice: boolean;
  showCode: boolean;
}

export const DEFAULT_BARCODE_LABEL_TEMPLATE_KEY: BarcodeLabelTemplateKey = "standard";

export const BARCODE_LABEL_TEMPLATES: readonly BarcodeLabelTemplate[] = [
  {
    key: "compact",
    displayName: "Compact",
    description: "50mm x 25mm small-sticker layout with a large barcode.",
    widthMm: 50,
    heightMm: 25,
    className: "barcode-label--compact",
    pageClassName: "label-print-page--compact",
    variant: "compact",
    showName: true,
    showPrice: true,
    showCode: false,
  },
  {
    key: "standard",
    displayName: "Standard",
    description: "60mm x 30mm default layout with name, barcode, price, and code.",
    widthMm: 60,
    heightMm: 30,
    className: "barcode-label--standard",
    pageClassName: "label-print-page--standard",
    variant: "standard",
    showName: true,
    showPrice: true,
    showCode: true,
  },
  {
    key: "price",
    displayName: "Price focused",
    description: "60mm x 30mm shelf label with a bold price and barcode below.",
    widthMm: 60,
    heightMm: 30,
    className: "barcode-label--price",
    pageClassName: "label-print-page--price",
    variant: "price",
    showName: true,
    showPrice: true,
    showCode: false,
  },
  {
    key: "large",
    displayName: "Large",
    description: "70mm x 40mm packaging label with larger readable text.",
    widthMm: 70,
    heightMm: 40,
    className: "barcode-label--large",
    pageClassName: "label-print-page--large",
    variant: "large",
    showName: true,
    showPrice: true,
    showCode: true,
  },
] as const;

export const getDefaultLabelTemplate = () => getLabelTemplate(DEFAULT_BARCODE_LABEL_TEMPLATE_KEY);

export const getLabelTemplate = (key?: string | null): BarcodeLabelTemplate => {
  return (
    BARCODE_LABEL_TEMPLATES.find((template) => template.key === key) ??
    BARCODE_LABEL_TEMPLATES.find((template) => template.key === DEFAULT_BARCODE_LABEL_TEMPLATE_KEY) ??
    BARCODE_LABEL_TEMPLATES[0]
  );
};

export const getLabelTemplateSizeText = (template: Pick<BarcodeLabelTemplate, "widthMm" | "heightMm">) =>
  `${template.widthMm}mm x ${template.heightMm}mm`;
