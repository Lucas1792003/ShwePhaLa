import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { useDataStore } from "../stores/dataStore";
import { PageHeader } from "../components/layout/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { SearchInput } from "../components/forms/SearchInput";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { CategoryFilter } from "../features/categories/CategoryFilter";
import { resolveCategoryIcon } from "../features/categories/categoryIcons";
import { BarcodeLabel } from "../components/barcodes/BarcodeLabel";
import { BarcodePrintSheet } from "../components/barcodes/BarcodePrintSheet";
import {
  clampLabelQty,
  getPrintableBarcodeValue,
  MAX_LABEL_QTY,
  MIN_LABEL_QTY,
  type PrintableBarcode,
} from "../features/barcodes/labels";
import {
  BARCODE_LABEL_TEMPLATES,
  DEFAULT_BARCODE_LABEL_TEMPLATE_KEY,
  getLabelTemplate,
  getLabelTemplateSizeText,
  type BarcodeLabelTemplate,
  type BarcodeLabelTemplateKey,
} from "../features/barcodes/labelTemplates";
import { cn, formatMmk, normalizeAmountInput } from "../lib/utils";
import type { Product, ProductUnit } from "../types";
import { getActiveProductUnits, getDefaultProductUnit } from "../features/catalog/productUnits";

type PrintJob = {
  product: Product;
  unit: ProductUnit;
  value: string;
  quantity: number;
  templateKey: BarcodeLabelTemplateKey;
};

type PreviewFrameStyle = CSSProperties & {
  width: string;
  height: string;
};

const PREVIEW_STRIP_LIMIT = 4;
const MINI_PREVIEW_SCALE = 0.42;

const templateIcons: Record<BarcodeLabelTemplateKey, string> = {
  compact: "view_compact_alt",
  standard: "view_comfy_alt",
  price: "sell",
  large: "featured_play_list",
};

const getPreviewFrameStyle = (template: BarcodeLabelTemplate, scale: number): PreviewFrameStyle => ({
  width: `${template.widthMm * scale}mm`,
  height: `${template.heightMm * scale}mm`,
});

const getScaledLabelStyle = (scale: number): CSSProperties => ({
  transform: `scale(${scale})`,
  transformOrigin: "top left",
});

export const BarcodeLabelsPage = () => {
  const products = useDataStore((state) => state.products);
  const categories = useDataStore((state) => state.categories);
  const barcodes = useDataStore((state) => state.barcodes);
  const productUnits = useDataStore((state) => state.productUnits);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<Product | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<ProductUnit | null>(null);
  const [qtyInput, setQtyInput] = useState("1");
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<BarcodeLabelTemplateKey>(
    DEFAULT_BARCODE_LABEL_TEMPLATE_KEY
  );
  const [printing, setPrinting] = useState<PrintJob | null>(null);

  const activeCategories = useMemo(
    () => categories.filter((c) => c.isActive),
    [categories]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => p.isActive)
      .filter((p) => category === "all" || p.category === category)
      .filter((p) => {
        if (!q) return true;
        if (p.name.toLowerCase().includes(q)) return true;
        if (p.sku?.toLowerCase().includes(q)) return true;
        const ownBarcodes = barcodes.filter((b) => b.productId === p.id);
        return ownBarcodes.some((b) => b.value.toLowerCase().includes(q));
      });
  }, [products, barcodes, search, category]);

  const selectedBarcode: PrintableBarcode | null = useMemo(() => {
    if (!selected || !selectedUnit) return null;
    return getPrintableBarcodeValue(selected, barcodes, selectedUnit);
  }, [selected, selectedUnit, barcodes]);

  const selectedUnits = useMemo(() => {
    if (!selected) return [];
    const active = getActiveProductUnits(selected.id, productUnits);
    return active.length > 0 ? active : [getDefaultProductUnit(selected, productUnits)];
  }, [selected, productUnits]);

  const qty = clampLabelQty(Number(qtyInput));
  const selectedTemplate = getLabelTemplate(selectedTemplateKey);
  const selectedTemplateSize = getLabelTemplateSizeText(selectedTemplate);
  const stripPreviewCount = Math.min(qty, PREVIEW_STRIP_LIMIT);

  const openModal = (product: Product) => {
    setSelected(product);
    setSelectedUnit(getDefaultProductUnit(product, productUnits));
    setQtyInput("1");
    setSelectedTemplateKey(DEFAULT_BARCODE_LABEL_TEMPLATE_KEY);
  };

  const closeModal = () => {
    setSelected(null);
    setSelectedUnit(null);
    setQtyInput("1");
    setSelectedTemplateKey(DEFAULT_BARCODE_LABEL_TEMPLATE_KEY);
  };

  const handlePrint = () => {
    if (!selected || !selectedUnit || !selectedBarcode) return;
    const template = getLabelTemplate(selectedTemplateKey);
    setPrinting({
      product: selected,
      unit: selectedUnit,
      value: selectedBarcode.value,
      quantity: qty,
      templateKey: template.key,
    });
    closeModal();
    requestAnimationFrame(() => {
      window.print();
      setPrinting(null);
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Barcode Labels"
        subtitle="Print product barcode labels for scanning at POS."
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, SKU, or barcode" />
        </div>
        <div className="mt-4">
          <CategoryFilter
            categories={activeCategories}
            selectedCategory={category}
            onChange={setCategory}
            variant="chips"
          />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
              No products found.
            </div>
          )}
          {filtered.map((product) => {
            const defaultUnit = getDefaultProductUnit(product, productUnits);
            const printable = getPrintableBarcodeValue(product, barcodes, defaultUnit);
            const disabled = !printable;
            const iconSymbol = resolveCategoryIcon(undefined, product.category).symbol;
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => !disabled && openModal(product)}
                disabled={disabled}
                className="flex flex-col items-stretch overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="relative h-28 w-full bg-gradient-to-br from-slate-100 to-slate-50">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <span className="material-symbols-rounded text-4xl text-slate-300">{iconSymbol}</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <div className="line-clamp-2 text-sm font-semibold text-slate-800">{product.name}</div>
                  <div className="text-xs text-slate-500">SKU {product.sku ?? "-"}</div>
                  {printable ? (
                    <div className="mt-auto pt-1 text-xs text-slate-600">
                      {printable.source === "barcode" ? `Barcode: ${printable.value}` : "Using SKU as barcode"}
                    </div>
                  ) : (
                    <div className="mt-auto pt-1 text-xs text-amber-700">No barcode/SKU</div>
                  )}
                  <div className="text-sm font-bold text-emerald-700">{formatMmk(defaultUnit.priceMmk)}</div>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <Modal
        open={!!selected}
        onClose={closeModal}
        title="Preview barcode labels"
        description={selected?.name}
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button onClick={handlePrint} disabled={!selectedBarcode}>
              Print labels
            </Button>
          </>
        }
      >
        {selected && selectedUnit && (
          <div className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 text-sm">
                    <div className="text-xs uppercase tracking-wide text-slate-500">Product</div>
                    <div className="mt-0.5 line-clamp-2 font-semibold text-slate-900">{selected.name}</div>
                    <div className="mt-2 text-xs uppercase tracking-wide text-slate-500">Sellable unit</div>
                    <div className="mt-0.5 font-medium text-slate-800">{selectedUnit.name}</div>
                    <div className="mt-2 text-xs uppercase tracking-wide text-slate-500">SKU</div>
                    <div className="mt-0.5 font-medium text-slate-800">{selected.sku ?? "-"}</div>
                    <div className="mt-2 text-xs uppercase tracking-wide text-slate-500">Price</div>
                    <div className="mt-0.5 font-bold text-emerald-700">{formatMmk(selectedUnit.priceMmk)}</div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 text-sm">
                    <div className="text-xs uppercase tracking-wide text-slate-500">Barcode source</div>
                    {selectedBarcode ? (
                      <>
                        <div className="mt-0.5 font-medium text-slate-900">
                          {selectedBarcode.source === "barcode" ? "Barcode" : "Using SKU as barcode"}
                        </div>
                        <div className="mt-1 break-all font-mono text-sm text-slate-800">{selectedBarcode.value}</div>
                      </>
                    ) : (
                      <div className="mt-1 text-amber-700">No barcode or SKU available.</div>
                    )}
                    <div className="mt-3 text-xs uppercase tracking-wide text-slate-500">Format</div>
                    <div className="mt-0.5 font-medium text-slate-800">CODE128</div>
                  </div>
                </div>

                {selectedUnits.length > 1 && (
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">Sellable unit</span>
                    <Select
                      value={selectedUnit.id}
                      onChange={(event) => {
                        const next = selectedUnits.find((unit) => unit.id === event.target.value);
                        if (next) setSelectedUnit(next);
                      }}
                    >
                      {selectedUnits.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.name} - {formatMmk(unit.priceMmk)}
                        </option>
                      ))}
                    </Select>
                  </label>
                )}

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Quantity ({MIN_LABEL_QTY}-{MAX_LABEL_QTY})
                  </span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={qtyInput}
                    onChange={(event) => setQtyInput(normalizeAmountInput(event.target.value))}
                    onBlur={() => {
                      setQtyInput(qtyInput === "" ? "1" : String(clampLabelQty(Number(qtyInput))));
                    }}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    {qty} {qty === 1 ? "label" : "labels"} will be prepared for this print job.
                  </p>
                </label>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Design</div>
                      <div className="text-xs text-slate-500">Standard 60mm x 30mm is the default.</div>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {BARCODE_LABEL_TEMPLATES.map((template) => {
                      const selectedTemplateCard = template.key === selectedTemplate.key;
                      return (
                        <button
                          key={template.key}
                          type="button"
                          aria-pressed={selectedTemplateCard}
                          onClick={() => setSelectedTemplateKey(template.key)}
                          className={cn(
                            "rounded-2xl border p-3 text-left transition",
                            selectedTemplateCard
                              ? "border-emerald-500 bg-emerald-50 shadow-sm shadow-emerald-100"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className={cn(
                                "material-symbols-rounded mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl text-xl",
                                selectedTemplateCard ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"
                              )}
                            >
                              {templateIcons[template.key]}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-slate-900">{template.displayName}</span>
                                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                  {getLabelTemplateSizeText(template)}
                                </span>
                              </span>
                              <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                                {template.description}
                              </span>
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Live preview</div>
                      <div className="text-xs text-slate-500">{selectedTemplate.displayName} - {selectedTemplateSize}</div>
                    </div>
                  </div>
                  <div className="flex min-h-[190px] items-center justify-center overflow-auto rounded-xl bg-slate-100 p-4">
                    {selectedBarcode ? (
                      <BarcodeLabel
                        product={selected}
                        unitName={selectedUnit.name}
                        unitPriceMmk={selectedUnit.priceMmk}
                        value={selectedBarcode.value}
                        templateKey={selectedTemplate.key}
                      />
                    ) : (
                      <div className="text-xs text-amber-700">No barcode or SKU available.</div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm">
                  <div className="font-semibold text-slate-900">Print summary</div>
                  <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-3 gap-y-2 text-xs">
                    <dt className="text-slate-500">Product</dt>
                    <dd className="text-right font-medium text-slate-900">{selected.name}</dd>
                    <dt className="text-slate-500">Unit</dt>
                    <dd className="text-right font-medium text-slate-900">{selectedUnit.name}</dd>
                    <dt className="text-slate-500">Quantity</dt>
                    <dd className="text-right font-medium text-slate-900">{qty}</dd>
                    <dt className="text-slate-500">Label size</dt>
                    <dd className="text-right font-medium text-slate-900">{selectedTemplateSize}</dd>
                    <dt className="text-slate-500">Design</dt>
                    <dd className="text-right font-medium text-slate-900">{selectedTemplate.displayName}</dd>
                  </dl>
                </div>
              </div>
            </div>

            {selectedBarcode && qty > 1 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-900">First labels preview</div>
                  <div className="text-xs text-slate-500">
                    Showing {stripPreviewCount} of {qty}
                  </div>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {Array.from({ length: stripPreviewCount }).map((_, index) => (
                    <div
                      key={index}
                      className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-2"
                      style={getPreviewFrameStyle(selectedTemplate, MINI_PREVIEW_SCALE)}
                    >
                      <div style={getScaledLabelStyle(MINI_PREVIEW_SCALE)}>
                        <BarcodeLabel
                          product={selected}
                          unitName={selectedUnit.name}
                          unitPriceMmk={selectedUnit.priceMmk}
                          value={selectedBarcode.value}
                          templateKey={selectedTemplate.key}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
              The selected label dimensions are applied to the print sheet. If the browser ignores the page-size hint,
              choose the matching label or paper size in the print dialog.
            </p>
          </div>
        )}
      </Modal>

      {printing && (
        <BarcodePrintSheet
          product={printing.product}
          unitName={printing.unit.name}
          unitPriceMmk={printing.unit.priceMmk}
          value={printing.value}
          quantity={printing.quantity}
          templateKey={printing.templateKey}
        />
      )}
    </div>
  );
};
