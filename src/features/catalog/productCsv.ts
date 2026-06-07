import type {
  Brand,
  Category,
  PriceLevel,
  Product,
  ProductBarcode,
  ProductPurchaseType,
  ProductUnit,
  ProductUnitPrice,
  UnitType,
} from "../../types";
import type { CsvCell } from "../../lib/csv";
import {
  findBarcodeOwner,
  normalizeBarcodeKey,
  normalizeBarcodeValue,
  validateBarcodeInput,
} from "../../lib/barcodeValidation";
import {
  getDefaultProductUnit,
  makeDefaultProductUnit,
  sanitizeProductUnits,
  validateProductUnits,
} from "./productUnits";

const STATIC_HEADERS = [
  "id",
  "sku",
  "alias_code",
  "name",
  "short_name",
  "category",
  "brand",
  "brand_id",
  "unit_type",
  "default_barcode",
  "price_mmk",
  "cost_mmk",
  "pack_size",
  "low_stock_threshold",
  "max_qty",
  "is_open_price",
  "is_non_stock",
  "purchase_type",
  "expiry_date",
  "image_url",
  "is_active",
  "created_at",
] as const;

const normalizeKey = (value: string | undefined | null): string =>
  (value ?? "").trim().toLowerCase();

const normalizeHeader = (header: string): string =>
  normalizeKey(header).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

const sortedActivePriceLevels = (priceLevels: PriceLevel[]) =>
  priceLevels
    .filter((level) => level.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

export const getProductCsvPriceLevelColumn = (level: PriceLevel): string =>
  `price_level_${normalizeHeader(level.code || level.name)}`;

export const getProductCsvHeaders = (priceLevels: PriceLevel[]): string[] => [
  ...STATIC_HEADERS,
  ...sortedActivePriceLevels(priceLevels).map(getProductCsvPriceLevelColumn),
];

export interface ProductCsvContext {
  products: Product[];
  productUnits: ProductUnit[];
  barcodes: ProductBarcode[];
  categories: Category[];
  brands: Brand[];
  unitTypes: UnitType[];
  priceLevels: PriceLevel[];
  productUnitPrices: ProductUnitPrice[];
}

export interface ProductCsvImportPriceRows {
  productUnitId: string;
  prices: { priceLevelId: string; shopId?: string; priceMmk: number }[];
}

export interface ProductCsvImportItem {
  rowNumber: number;
  action: "create" | "update";
  product: Product;
  productUnits: ProductUnit[];
  barcodes: ProductBarcode[];
  unitPriceRows: ProductCsvImportPriceRows[];
}

export interface ProductCsvImportPreviewRow {
  rowNumber: number;
  action: "create" | "update" | "skip";
  sku: string;
  name: string;
  errors: string[];
  warnings: string[];
}

export interface ProductCsvImportPlan {
  items: ProductCsvImportItem[];
  previewRows: ProductCsvImportPreviewRow[];
  createCount: number;
  updateCount: number;
  errorCount: number;
}

export const buildProductCsvRows = (context: ProductCsvContext): Record<string, CsvCell>[] => {
  const activeLevels = sortedActivePriceLevels(context.priceLevels);
  const products = [...context.products].sort((a, b) => a.name.localeCompare(b.name));

  return products.map((product) => {
    const unit = getDefaultProductUnit(product, context.productUnits);
    const brand = product.brandId
      ? context.brands.find((item) => item.id === product.brandId)
      : undefined;
    const barcode = context.barcodes.find(
      (item) =>
        item.productId === product.id &&
        (!item.productUnitId || item.productUnitId === unit.id),
    );
    const row: Record<string, CsvCell> = {
      id: product.id,
      sku: product.sku ?? "",
      alias_code: product.aliasCode ?? "",
      name: product.name,
      short_name: product.shortName ?? "",
      category: product.category,
      brand: brand?.name ?? "",
      brand_id: product.brandId ?? "",
      unit_type: product.unitType,
      default_barcode: barcode?.value ?? "",
      price_mmk: product.priceMmk,
      cost_mmk: product.costMmk ?? "",
      pack_size: product.packSize ?? "",
      low_stock_threshold: product.lowStockThreshold,
      max_qty: product.maxQty ?? "",
      is_open_price: product.isOpenPrice ?? false,
      is_non_stock: product.isNonStock ?? false,
      purchase_type: product.purchaseType ?? "",
      expiry_date: product.expiryDate ?? "",
      image_url: product.imageUrl ?? "",
      is_active: product.isActive,
      created_at: product.createdAt,
    };

    for (const level of activeLevels) {
      const price = context.productUnitPrices.find(
        (item) =>
          item.productUnitId === unit.id &&
          item.priceLevelId === level.id &&
          item.shopId == null &&
          item.isActive,
      );
      row[getProductCsvPriceLevelColumn(level)] =
        price?.priceMmk ?? (level.isDefault ? unit.salePriceMmk : "");
    }

    return row;
  });
};

const normalizeRecord = (record: Record<string, string>): Record<string, string> => {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    normalized[normalizeHeader(key)] = value.trim();
  }
  return normalized;
};

const readField = (record: Record<string, string>, key: string): string =>
  record[normalizeHeader(key)] ?? "";

const hasField = (record: Record<string, string>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(record, normalizeHeader(key));

const parseInteger = (
  raw: string,
  fieldLabel: string,
  errors: string[],
  options: { required?: boolean; min?: number; fallback?: number | undefined } = {},
): number | undefined => {
  if (raw === "") {
    if (options.fallback !== undefined) return options.fallback;
    if (options.required) errors.push(`${fieldLabel} is required.`);
    return undefined;
  }
  if (!/^-?\d+$/.test(raw)) {
    errors.push(`${fieldLabel} must be a whole number.`);
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) {
    errors.push(`${fieldLabel} is too large.`);
    return undefined;
  }
  if (options.min !== undefined && parsed < options.min) {
    errors.push(`${fieldLabel} must be at least ${options.min}.`);
    return undefined;
  }
  return parsed;
};

const parseBoolean = (
  raw: string,
  fieldLabel: string,
  errors: string[],
  fallback: boolean,
): boolean => {
  if (raw === "") return fallback;
  const value = normalizeKey(raw);
  if (["true", "yes", "y", "1", "active"].includes(value)) return true;
  if (["false", "no", "n", "0", "inactive"].includes(value)) return false;
  errors.push(`${fieldLabel} must be true/false, yes/no, 1/0, active/inactive.`);
  return fallback;
};

const normalizeOptional = (raw: string): string | undefined => {
  const value = raw.trim();
  return value ? value : undefined;
};

const makeGeneratedProductId = (rowNumber: number): string =>
  `prod-import-${Date.now()}-${rowNumber}-${Math.random().toString(36).slice(2, 7)}`;

const makeGeneratedBarcodeId = (productId: string, rowNumber: number): string =>
  `bc-import-${productId}-${rowNumber}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export const buildProductCsvImportPlan = (
  rawRecords: Record<string, string>[],
  context: ProductCsvContext,
): ProductCsvImportPlan => {
  const productsById = new Map(context.products.map((product) => [product.id, product]));
  const productsBySku = new Map(
    context.products
      .filter((product) => product.sku)
      .map((product) => [normalizeKey(product.sku), product]),
  );
  const productsByAlias = new Map(
    context.products
      .filter((product) => product.aliasCode)
      .map((product) => [normalizeKey(product.aliasCode), product]),
  );
  const activeCategories = context.categories.filter((category) => category.isActive);
  const categoriesByName = new Map(
    activeCategories.map((category) => [normalizeKey(category.name), category]),
  );
  const activeBrands = context.brands.filter((brand) => brand.isActive);
  const brandsById = new Map(activeBrands.map((brand) => [brand.id, brand]));
  const activeUnitTypes = context.unitTypes.filter((unitType) => unitType.isActive);
  const unitTypesByName = new Map(
    activeUnitTypes.map((unitType) => [normalizeKey(unitType.name), unitType]),
  );
  const activeLevels = sortedActivePriceLevels(context.priceLevels);
  const defaultLevel = activeLevels.find((level) => level.isDefault) ?? activeLevels[0];

  const seenIds = new Set<string>();
  const seenSkus = new Set<string>();
  const seenAliases = new Set<string>();
  const seenBarcodes = new Set<string>();

  const items: ProductCsvImportItem[] = [];
  const previewRows: ProductCsvImportPreviewRow[] = [];

  rawRecords.forEach((rawRecord, index) => {
    const rowNumber = index + 2;
    const record = normalizeRecord(rawRecord);
    const errors: string[] = [];
    const warnings: string[] = [];

    const idInput = readField(record, "id");
    const sku = readField(record, "sku");
    const skuKey = normalizeKey(sku);
    const aliasCode = normalizeOptional(readField(record, "alias_code"));
    const aliasKey = normalizeKey(aliasCode);

    if (!sku) errors.push("SKU is required.");
    if (idInput) {
      if (seenIds.has(idInput)) errors.push(`Duplicate id in CSV: ${idInput}.`);
      seenIds.add(idInput);
    }
    if (skuKey) {
      if (seenSkus.has(skuKey)) errors.push(`Duplicate SKU in CSV: ${sku}.`);
      seenSkus.add(skuKey);
    }
    if (aliasKey) {
      if (seenAliases.has(aliasKey)) errors.push(`Duplicate alias_code in CSV: ${aliasCode}.`);
      seenAliases.add(aliasKey);
    }

    const productById = idInput ? productsById.get(idInput) : undefined;
    const productBySku = skuKey ? productsBySku.get(skuKey) : undefined;
    if (productById && productBySku && productById.id !== productBySku.id) {
      errors.push("id and sku refer to different existing products.");
    }
    const existingProduct = productById ?? productBySku;
    const action: "create" | "update" = existingProduct ? "update" : "create";
    const productId = (existingProduct?.id ?? idInput) || makeGeneratedProductId(rowNumber);

    if (aliasKey) {
      const aliasOwner = productsByAlias.get(aliasKey);
      if (aliasOwner && aliasOwner.id !== productId) {
        errors.push(`Alias code is already used by ${aliasOwner.sku ?? aliasOwner.name}.`);
      }
    }

    const name = readField(record, "name") || existingProduct?.name || "";
    if (!name) errors.push("Name is required.");

    const categoryInput = readField(record, "category") || existingProduct?.category || "";
    const category = categoriesByName.get(normalizeKey(categoryInput));
    if (!category) errors.push(`Category "${categoryInput || "(blank)"}" is not active or does not exist.`);

    const brandsForCategory = category
      ? activeBrands.filter((brand) => brand.categoryId === category.id)
      : [];
    const brandIdInput = readField(record, "brand_id");
    const brandNameInput = readField(record, "brand");
    let brandId: string | undefined;

    if (brandIdInput) {
      const brand = brandsById.get(brandIdInput);
      if (!brand) {
        errors.push(`Brand id "${brandIdInput}" is not active or does not exist.`);
      } else if (category && brand.categoryId !== category.id) {
        errors.push(`Brand "${brand.name}" does not belong to category "${category.name}".`);
      } else {
        brandId = brand.id;
      }
    } else if (brandNameInput && category) {
      const brand = brandsForCategory.find(
        (item) => normalizeKey(item.name) === normalizeKey(brandNameInput),
      );
      if (!brand) {
        errors.push(`Brand "${brandNameInput}" does not belong to category "${category.name}".`);
      } else {
        brandId = brand.id;
      }
    } else if (existingProduct && existingProduct.brandId && category) {
      const existingBrand = brandsById.get(existingProduct.brandId);
      if (existingBrand?.categoryId === category.id) brandId = existingBrand.id;
    }

    if (action === "create" && brandsForCategory.length > 0 && !brandId) {
      errors.push(`Brand is required for new products in category "${category?.name ?? categoryInput}".`);
    }

    const unitTypeInput = readField(record, "unit_type") || existingProduct?.unitType || "";
    if (!unitTypeInput) errors.push("Unit type is required.");
    const activeUnitType = unitTypesByName.get(normalizeKey(unitTypeInput));
    const unitType =
      activeUnitType?.name ??
      (existingProduct && normalizeKey(existingProduct.unitType) === normalizeKey(unitTypeInput)
        ? existingProduct.unitType
        : unitTypeInput);
    if (unitTypeInput && activeUnitTypes.length > 0 && !activeUnitType) {
      warnings.push(`Unit type "${unitTypeInput}" is not active in Settings and will be saved as a legacy value.`);
    }

    const existingDefaultUnit = existingProduct
      ? getDefaultProductUnit(existingProduct, context.productUnits)
      : undefined;
    const priceMmk = parseInteger(readField(record, "price_mmk"), "price_mmk", errors, {
      required: true,
      min: 1,
      fallback: existingProduct?.priceMmk ?? existingDefaultUnit?.salePriceMmk,
    });
    const costMmk = parseInteger(readField(record, "cost_mmk"), "cost_mmk", errors, {
      min: 0,
      fallback: undefined,
    });
    const packSize = parseInteger(readField(record, "pack_size"), "pack_size", errors, {
      min: 0,
      fallback: undefined,
    });
    const lowStockThreshold = parseInteger(
      readField(record, "low_stock_threshold"),
      "low_stock_threshold",
      errors,
      { required: true, min: 0, fallback: existingProduct?.lowStockThreshold ?? 10 },
    );
    const maxQty = parseInteger(readField(record, "max_qty"), "max_qty", errors, {
      min: 0,
      fallback: undefined,
    });
    if (
      maxQty !== undefined &&
      lowStockThreshold !== undefined &&
      maxQty < lowStockThreshold
    ) {
      errors.push("max_qty must be greater than or equal to low_stock_threshold.");
    }

    const isOpenPrice = parseBoolean(
      readField(record, "is_open_price"),
      "is_open_price",
      errors,
      existingProduct?.isOpenPrice ?? false,
    );
    const isNonStock = parseBoolean(
      readField(record, "is_non_stock"),
      "is_non_stock",
      errors,
      existingProduct?.isNonStock ?? false,
    );
    const isActive = parseBoolean(
      readField(record, "is_active"),
      "is_active",
      errors,
      existingProduct?.isActive ?? true,
    );

    const purchaseRaw = readField(record, "purchase_type").toUpperCase();
    let purchaseType: ProductPurchaseType | undefined;
    if (purchaseRaw === "COD" || purchaseRaw === "CREDIT") {
      purchaseType = purchaseRaw;
    } else if (purchaseRaw) {
      errors.push("purchase_type must be COD, CREDIT, or blank.");
    }

    const expiryDate = normalizeOptional(readField(record, "expiry_date"));
    if (expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
      errors.push("expiry_date must use YYYY-MM-DD.");
    }

    const createdAtInput = normalizeOptional(readField(record, "created_at"));
    const createdAt = existingProduct?.createdAt ?? createdAtInput ?? new Date().toISOString();
    const defaultBarcodeWasProvided = hasField(record, "default_barcode");
    const defaultBarcode = normalizeBarcodeValue(readField(record, "default_barcode"));
    const existingBarcodes = context.barcodes.filter((barcode) => barcode.productId === productId);
    let nextBarcodes = [...existingBarcodes];
    let barcodeKey = "";

    if (defaultBarcodeWasProvided) {
      const existingDefaultBarcode = existingBarcodes.find(
        (barcode) => !barcode.productUnitId || barcode.productUnitId === existingDefaultUnit?.id,
      );
      const nonDefaultBarcodes = existingBarcodes.filter(
        (barcode) => barcode.productUnitId && barcode.productUnitId !== existingDefaultUnit?.id,
      );

      if (defaultBarcode) {
        const barcodeError = validateBarcodeInput(defaultBarcode);
        if (barcodeError) errors.push(`default_barcode: ${barcodeError}`);
        const owner = findBarcodeOwner(defaultBarcode, context.barcodes, productId);
        if (owner) errors.push(`default_barcode is already linked to another product (${owner.productId}).`);
        barcodeKey = normalizeBarcodeKey(defaultBarcode);
        if (barcodeKey) {
          if (seenBarcodes.has(barcodeKey)) {
            errors.push(`Duplicate default_barcode in CSV: ${defaultBarcode}.`);
          }
          seenBarcodes.add(barcodeKey);
        }
        nextBarcodes = [
          ...nonDefaultBarcodes,
          {
            id: existingDefaultBarcode?.id ?? makeGeneratedBarcodeId(productId, rowNumber),
            productId,
            productUnitId: undefined,
            value: defaultBarcode,
            type: existingDefaultBarcode?.type ?? "EAN13",
          },
        ];
      } else {
        nextBarcodes = nonDefaultBarcodes;
      }
    }

    if (
      errors.length > 0 ||
      !category ||
      priceMmk === undefined ||
      lowStockThreshold === undefined ||
      !unitType
    ) {
      previewRows.push({
        rowNumber,
        action,
        sku,
        name,
        errors,
        warnings,
      });
      return;
    }

    const product: Product = {
      id: productId,
      sku,
      aliasCode,
      name,
      shortName: normalizeOptional(readField(record, "short_name")),
      category: category.name,
      brandId,
      unitType,
      priceMmk,
      costMmk,
      packSize,
      lowStockThreshold,
      maxQty,
      isOpenPrice,
      isNonStock,
      purchaseType,
      expiryDate,
      imageUrl: normalizeOptional(readField(record, "image_url")),
      isActive,
      createdAt,
    };

    const now = new Date().toISOString();
    const persistedUnits = context.productUnits.filter((unit) => unit.productId === productId);
    const defaultUnit: ProductUnit = {
      ...(existingDefaultUnit ?? makeDefaultProductUnit(productId, unitType, priceMmk, costMmk, now)),
      productId,
      name: unitType,
      baseQuantity: 1,
      salePriceMmk: priceMmk,
      purchasePriceMmk: costMmk,
      isDefault: true,
      isActive: true,
      createdAt: existingDefaultUnit?.createdAt ?? now,
      updatedAt: now,
    };
    const nextUnits = sanitizeProductUnits(
      [
        defaultUnit,
        ...persistedUnits.filter((unit) => unit.id !== defaultUnit.id),
      ],
      productId,
    );
    const unitValidation = validateProductUnits(nextUnits);
    if (!unitValidation.valid) {
      previewRows.push({
        rowNumber,
        action,
        sku,
        name,
        errors: [unitValidation.error ?? "Product units are invalid."],
        warnings,
      });
      return;
    }

    const priceRows: { priceLevelId: string; shopId?: string; priceMmk: number }[] = [];
    const existingPriceRows = context.productUnitPrices.filter(
      (price) => price.productUnitId === defaultUnit.id && price.isActive,
    );
    for (const level of activeLevels) {
      const column = getProductCsvPriceLevelColumn(level);
      const raw = readField(record, column);
      const existingGlobalPrice = existingPriceRows.find(
        (price) => price.priceLevelId === level.id && price.shopId == null,
      );
      const parsed = parseInteger(raw, column, errors, {
        min: 0,
        fallback: existingGlobalPrice?.priceMmk ?? (level.id === defaultLevel?.id ? priceMmk : undefined),
      });
      if (parsed !== undefined) {
        priceRows.push({ priceLevelId: level.id, priceMmk: parsed });
      }
    }
    for (const price of existingPriceRows.filter((row) => row.shopId)) {
      priceRows.push({
        priceLevelId: price.priceLevelId,
        shopId: price.shopId,
        priceMmk: price.priceMmk,
      });
    }

    if (errors.length > 0) {
      previewRows.push({
        rowNumber,
        action,
        sku,
        name,
        errors,
        warnings,
      });
      return;
    }

    const item: ProductCsvImportItem = {
      rowNumber,
      action,
      product,
      productUnits: nextUnits,
      barcodes: nextBarcodes,
      unitPriceRows: [{ productUnitId: defaultUnit.id, prices: priceRows }],
    };
    items.push(item);
    previewRows.push({
      rowNumber,
      action,
      sku,
      name,
      errors: [],
      warnings,
    });
  });

  return {
    items,
    previewRows,
    createCount: items.filter((item) => item.action === "create").length,
    updateCount: items.filter((item) => item.action === "update").length,
    errorCount: previewRows.filter((row) => row.errors.length > 0).length,
  };
};
