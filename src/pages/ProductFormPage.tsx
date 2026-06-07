import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuthStore } from "../stores/authStore";
import { useAppStore } from "../stores/appStore";
import { useDataStore } from "../stores/dataStore";
import type { Brand, ProductBarcode, ProductUnit } from "../types";
import {
  checkBarcodeAddable,
  findBarcodeOwner,
  normalizeBarcodeValue,
  BARCODE_FORM_MESSAGES,
} from "../lib/barcodeValidation";
import { getErrorMessage } from "../lib/errors";
import { PageHeader } from "../components/layout/PageHeader";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { ProductImageInput } from "../components/forms/ProductImageInput";
import { MoneyInput } from "../components/forms/MoneyInput";
import { BarcodeScanModal } from "../components/forms/BarcodeScanModal";
import { useToast } from "../components/ui/Toast";
import {
  compareUnitTypes,
  resolveProductUnit,
} from "../features/unitTypes/unitTypeValidation";
import {
  buildProductFromFormValues,
  type ProductFormValues as FormValues,
} from "../features/catalog/productForm";
import {
  makeDefaultProductUnit,
  sanitizeProductUnits,
  validateProductUnits,
} from "../features/catalog/productUnits";
import { getActivePriceLevels } from "../features/pricing/priceLevels";

const PRODUCTS_ROUTE = "/app/admin/products";

const getPriceLevelFormLabel = (code: string, name: string): string => {
  const normalized = code.toLowerCase();
  if (normalized === "retail") return `${name} Price (Sale 1)`;
  if (normalized === "wholesale") return `${name} Price (Sale 2)`;
  if (normalized === "special") return `${name} Price (Sale 3)`;
  return `${name} Price`;
};

export const ProductFormPage = () => {
  const navigate = useNavigate();
  const { productId: routeProductId } = useParams<{ productId?: string }>();
  const toast = useToast();
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentShopId = useAppStore((state) => state.currentShopId);

  const products = useDataStore((state) => state.products);
  const productUnits = useDataStore((state) => state.productUnits);
  const barcodes = useDataStore((state) => state.barcodes);
  const categories = useDataStore((state) => state.categories);
  const brands = useDataStore((state) => state.brands);
  const unitTypes = useDataStore((state) => state.unitTypes);
  const purchaseOrders = useDataStore((state) => state.purchaseOrders);
  const purchaseOrderItems = useDataStore((state) => state.purchaseOrderItems);
  const suppliers = useDataStore((state) => state.suppliers);
  const loadError = useDataStore((state) => state.loadError);
  const addProduct = useDataStore((state) => state.addProduct);
  const updateProduct = useDataStore((state) => state.updateProduct);
  const replaceProductUnits = useDataStore((state) => state.replaceProductUnits);
  const priceLevels = useDataStore((state) => state.priceLevels);
  const productUnitPrices = useDataStore((state) => state.productUnitPrices);
  const replaceProductUnitPrices = useDataStore((state) => state.replaceProductUnitPrices);
  const replaceProductBarcodes = useDataStore((state) => state.replaceProductBarcodes);
  const addAuditLog = useDataStore((state) => state.addAuditLog);

  const editingProduct = useMemo(
    () => (routeProductId ? products.find((p) => p.id === routeProductId) : undefined),
    [products, routeProductId],
  );
  const isEditing = Boolean(routeProductId);

  const activeCategories = useMemo(() => categories.filter((c) => c.isActive), [categories]);
  const activeUnitTypes = useMemo(
    () => unitTypes.filter((u) => u.isActive).sort(compareUnitTypes),
    [unitTypes],
  );
  const activeBrands = useMemo(
    () => brands.filter((b) => b.isActive).sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    ),
    [brands],
  );
  const brandsByCategory = useMemo(() => {
    const map = new Map<string, Brand[]>();
    for (const brand of activeBrands) {
      const list = map.get(brand.categoryId) ?? [];
      list.push(brand);
      map.set(brand.categoryId, list);
    }
    return map;
  }, [activeBrands]);
  const activePriceLevels = useMemo(() => getActivePriceLevels(priceLevels), [priceLevels]);
  const defaultPriceLevel = useMemo(
    () => activePriceLevels.find((level) => level.isDefault) ?? activePriceLevels[0],
    [activePriceLevels],
  );

  // Last supplier for the editing product. Reads the newest non-CANCELED
  // purchase order line that referenced this product and returns the
  // supplier on that PO. Read-only display; never written back.
  const lastSupplierForProduct = useMemo(() => {
    if (!routeProductId) return null;
    // Map productId → most-recent PO datestamp + supplier id. POs sorted
    // newest-first so the first hit per product wins.
    const sortedOrders = [...purchaseOrders]
      .filter((po) => po.status !== "CANCELED")
      .sort((a, b) => {
        const aDate = a.receivedAt ?? a.approvedAt ?? a.createdAt;
        const bDate = b.receivedAt ?? b.approvedAt ?? b.createdAt;
        return bDate.localeCompare(aDate);
      });
    for (const po of sortedOrders) {
      const item = purchaseOrderItems.find(
        (it) => it.purchaseOrderId === po.id && it.productId === routeProductId,
      );
      if (!item) continue;
      const supplier = suppliers.find((s) => s.id === po.supplierId);
      if (!supplier) continue;
      return {
        supplier,
        orderNo: po.orderNo,
        when: po.receivedAt ?? po.approvedAt ?? po.createdAt,
      };
    }
    return null;
  }, [routeProductId, purchaseOrders, purchaseOrderItems, suppliers]);

  // Stable productId for the storage image path. Edit mode reuses the
  // existing id; create mode mints one up-front so the image upload can
  // happen before submit lands the row.
  const [formProductId, setFormProductId] = useState<string>(
    () => routeProductId ?? `prod-${Date.now()}`,
  );

  const previousUnitTypeRef = useRef<string>("");
  const [formUnits, setFormUnits] = useState<ProductUnit[]>([]);
  const [unitBarcodes, setUnitBarcodes] = useState<Record<string, string>>({});
  const [formUnitLevelPrices, setFormUnitLevelPrices] = useState<Record<string, Record<string, string>>>({});
  const [scanUnitId, setScanUnitId] = useState<string | null>(null);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [productSaveError, setProductSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // Marker so the URL-driven `routeProductId → formProductId` hydration
  // only runs once per mount. Without this, re-renders of `products` on
  // the same edit page would constantly reset state.
  const hydratedRef = useRef<string | null>(null);

  const schema = useMemo(() => {
    return z.object({
      sku: z.string().min(1, "SKU is required"),
      aliasCode: z.string().optional(),
      name: z.string().min(2, "Name must be at least 2 characters"),
      shortName: z.string().optional(),
      category: z.string().min(1, "Category is required"),
      brandId: z.string().optional(),
      unitType: z.string().min(1, "Unit type is required"),
      priceMmk: z.number().min(0, "Price must be 0 or greater"),
      costMmk: z.number().optional(),
      lowStockThreshold: z.number().min(0, "Threshold must be 0 or greater"),
      maxQty: z.number().min(0, "MaxQty must be 0 or greater").optional(),
      isOpenPrice: z.boolean(),
      isNonStock: z.boolean(),
      // Empty string maps to "unspecified" — keeps the <select> controlled.
      purchaseType: z.union([z.literal("COD"), z.literal("CREDIT"), z.literal("")]).optional(),
      expiryDate: z.string().optional(),
      imageUrl: z.string().optional(),
      isActive: z.boolean(),
    });
  }, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      sku: "",
      aliasCode: "",
      name: "",
      shortName: "",
      category: activeCategories[0]?.name ?? "",
      brandId: undefined,
      unitType: activeUnitTypes[0]?.name ?? "",
      priceMmk: 0,
      costMmk: undefined,
      lowStockThreshold: 10,
      maxQty: undefined,
      isOpenPrice: false,
      isNonStock: false,
      purchaseType: "",
      expiryDate: undefined,
      imageUrl: undefined,
      isActive: true,
    },
  });

  const buildInitialUnit = (
    productId: string,
    unitType: string,
    salePriceMmk: number,
    purchasePriceMmk?: number,
  ) =>
    makeDefaultProductUnit(
      productId,
      unitType || activeUnitTypes[0]?.name || "Piece",
      salePriceMmk,
      purchasePriceMmk,
    );

  // Hydrate form/units from the route on mount. Edit mode waits for the
  // store to have loaded the product; create mode seeds an empty form.
  useEffect(() => {
    const hydrationKey = routeProductId ?? "__new__";
    if (hydratedRef.current === hydrationKey) return;

    if (routeProductId) {
      if (!editingProduct) {
        // Store still loading; skip until the product appears.
        return;
      }
      hydratedRef.current = hydrationKey;
      form.reset({
        id: editingProduct.id,
        sku: editingProduct.sku || "",
        aliasCode: editingProduct.aliasCode ?? "",
        name: editingProduct.name,
        shortName: editingProduct.shortName ?? "",
        category: editingProduct.category,
        brandId: editingProduct.brandId,
        unitType: editingProduct.unitType,
        priceMmk: editingProduct.priceMmk,
        costMmk: editingProduct.costMmk,
        lowStockThreshold: editingProduct.lowStockThreshold,
        maxQty: editingProduct.maxQty,
        isOpenPrice: editingProduct.isOpenPrice ?? false,
        isNonStock: editingProduct.isNonStock ?? false,
        purchaseType: editingProduct.purchaseType ?? "",
        expiryDate: editingProduct.expiryDate,
        imageUrl: editingProduct.imageUrl,
        isActive: editingProduct.isActive,
      });
      setFormProductId(editingProduct.id);
      previousUnitTypeRef.current = editingProduct.unitType;
      const savedUnits = productUnits
        .filter((unit) => unit.productId === editingProduct.id)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
      const units = savedUnits.length > 0
        ? savedUnits
        : [buildInitialUnit(editingProduct.id, editingProduct.unitType, editingProduct.priceMmk, editingProduct.costMmk)];
      setFormUnits(units);
      setUnitBarcodes(Object.fromEntries(
        units.map((unit) => {
          const barcode = barcodes.find((b) =>
            b.productId === editingProduct.id &&
            (unit.isDefault ? !b.productUnitId : b.productUnitId === unit.id),
          );
          return [unit.id, barcode?.value ?? ""];
        })
      ));
      const nextLevelPrices: Record<string, Record<string, string>> = {};
      for (const unit of units) {
        const perLevel: Record<string, string> = {};
        for (const level of priceLevels) {
          const row = productUnitPrices.find(
            (p) =>
              p.productUnitId === unit.id &&
              p.priceLevelId === level.id &&
              p.shopId == null &&
              p.isActive,
          );
          perLevel[level.id] = row ? String(row.priceMmk) : level.isDefault ? String(unit.salePriceMmk || "") : "";
        }
        nextLevelPrices[unit.id] = perLevel;
      }
      setFormUnitLevelPrices(nextLevelPrices);
    } else {
      hydratedRef.current = hydrationKey;
      const initialUnitType = activeUnitTypes[0]?.name ?? "Piece";
      const seedProductId = `prod-${Date.now()}`;
      form.reset({
        sku: "",
        aliasCode: "",
        name: "",
        shortName: "",
        category: activeCategories[0]?.name ?? "",
        brandId: undefined,
        unitType: initialUnitType,
        priceMmk: 0,
        costMmk: undefined,
        lowStockThreshold: 10,
        maxQty: undefined,
        isOpenPrice: false,
        isNonStock: false,
        purchaseType: "",
        expiryDate: undefined,
        imageUrl: undefined,
        isActive: true,
      });
      setFormProductId(seedProductId);
      previousUnitTypeRef.current = initialUnitType;
      const seedUnit = buildInitialUnit(seedProductId, initialUnitType, 0, undefined);
      setFormUnits([seedUnit]);
      setFormUnitLevelPrices({
        [seedUnit.id]: Object.fromEntries(activePriceLevels.map((level) => [level.id, ""])),
      });
      setUnitBarcodes({});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeProductId, editingProduct]);

  // Editing a product that doesn't exist in the store → bounce back to the
  // list. Happens if the user lands here via a stale URL or after deletion.
  useEffect(() => {
    if (!routeProductId) return;
    if (editingProduct) return;
    if (loadError) return; // wait for retry; don't bounce on transient error
    // Allow the store one tick to populate before declaring it missing.
    const timeout = window.setTimeout(() => {
      if (!useDataStore.getState().products.find((p) => p.id === routeProductId)) {
        navigate(PRODUCTS_ROUTE, { replace: true });
      }
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [routeProductId, editingProduct, loadError, navigate]);

  // ============================================================
  // Form sub-handlers
  // ============================================================

  const handleScannedBarcode = (value: string): string | null => {
    if (!scanUnitId) return "Choose a sellable unit before scanning.";
    const normalized = normalizeBarcodeValue(value);
    const currentValues = Object.entries(unitBarcodes)
      .filter(([unitId]) => unitId !== scanUnitId)
      .map(([, barcode]) => barcode)
      .filter(Boolean);
    const error = checkBarcodeAddable(normalized, currentValues, barcodes, routeProductId ?? null);
    if (error) return error;
    setUnitBarcodes((list) => ({ ...list, [scanUnitId]: normalized }));
    toast({ title: "Barcode added", description: normalized, variant: "success" });
    return null;
  };

  const handleRemoveBarcode = (unitId: string) => {
    setUnitBarcodes((list) => ({ ...list, [unitId]: "" }));
  };

  const updateFormUnit = (unitId: string, patch: Partial<ProductUnit>) => {
    setFormUnits((units) =>
      units.map((unit) => (unit.id === unitId ? { ...unit, ...patch } : unit))
    );
  };

  const updateUnitLevelPrice = (unitId: string, priceLevelId: string, rawValue: string) => {
    const next = rawValue.replace(/[^\d]/g, "");
    const isDefaultLevel = defaultPriceLevel?.id === priceLevelId;
    const unit = formUnits.find((row) => row.id === unitId);

    setFormUnitLevelPrices((prev) => ({
      ...prev,
      [unitId]: { ...(prev[unitId] ?? {}), [priceLevelId]: next },
    }));

    if (!isDefaultLevel) return;

    const parsed = Number(next || 0);
    const salePriceMmk = Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
    updateFormUnit(unitId, { salePriceMmk });
    if (unit?.isDefault) {
      form.setValue("priceMmk", salePriceMmk, { shouldValidate: true });
    }
  };

  const updateUnitPurchaseCost = (unitId: string, value: number | undefined) => {
    const unit = formUnits.find((row) => row.id === unitId);
    const purchasePriceMmk =
      value === undefined || value === null || !Number.isFinite(value)
        ? undefined
        : Math.max(0, Math.trunc(value));
    updateFormUnit(unitId, { purchasePriceMmk });
    if (unit?.isDefault) {
      form.setValue("costMmk", purchasePriceMmk, { shouldValidate: true });
    }
  };

  const addSellableUnit = () => {
    const id = `unit-${formProductId || Date.now()}-${Date.now()}`;
    const now = new Date().toISOString();
    setFormUnits((units) => [
      ...units,
      {
        id,
        productId: formProductId,
        name: "",
        baseQuantity: 1,
        salePriceMmk: 0,
        purchasePriceMmk: undefined,
        isDefault: false,
        isActive: true,
        sortOrder: units.length,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    setFormUnitLevelPrices((prev) => ({
      ...prev,
      [id]: Object.fromEntries(activePriceLevels.map((level) => [level.id, ""])),
    }));
  };

  const deactivateSellableUnit = (unitId: string) => {
    setFormUnits((units) => {
      const next = units.map((unit) => (unit.id === unitId ? { ...unit, isActive: false, isDefault: false } : unit));
      if (!next.some((unit) => unit.isActive && unit.isDefault)) {
        const firstActive = next.find((unit) => unit.isActive);
        return firstActive
          ? next.map((unit) => ({ ...unit, isDefault: unit.id === firstActive.id }))
          : next;
      }
      return next;
    });
  };

  const setDefaultSellableUnit = (unitId: string) => {
    setFormUnits((units) =>
      units.map((unit) => ({
        ...unit,
        isDefault: unit.id === unitId,
        isActive: unit.id === unitId ? true : unit.isActive,
        baseQuantity: unit.id === unitId ? 1 : unit.baseQuantity,
      }))
    );
    const nextDefault = formUnits.find((unit) => unit.id === unitId);
    if (nextDefault) {
      form.setValue("priceMmk", nextDefault.salePriceMmk, { shouldValidate: true });
      form.setValue("costMmk", nextDefault.purchasePriceMmk, { shouldValidate: true });
    }
  };

  const openUnitScanModal = (unitId: string) => {
    setScanUnitId(unitId);
    setScanModalOpen(true);
  };

  const generateSku = (categoryName?: string) => {
    const cat = categoryName ?? form.getValues("category");
    if (!cat) return;
    const prefix = cat.substring(0, 3).toUpperCase();
    const existing = products
      .map((p) => p.sku ?? "")
      .filter((s) => s.startsWith(prefix + "-"))
      .map((s) => parseInt(s.slice(prefix.length + 1), 10))
      .filter((n) => !isNaN(n));
    const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
    form.setValue("sku", `${prefix}-${String(next).padStart(3, "0")}`);
  };

  const watchedCategory = form.watch("category");
  const watchedUnitType = form.watch("unitType");
  const watchedBrandId = form.watch("brandId");

  useEffect(() => {
    if (isEditing) return;
    if (watchedCategory) generateSku(watchedCategory);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedCategory, isEditing]);

  useEffect(() => {
    if (!watchedBrandId) return;
    const cat = activeCategories.find((c) => c.name === watchedCategory);
    if (!cat) return;
    const allowed = brandsByCategory.get(cat.id) ?? [];
    if (!allowed.some((b) => b.id === watchedBrandId)) {
      form.setValue("brandId", undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedCategory, watchedBrandId]);

  const brandsForFormCategory = useMemo(() => {
    const cat = activeCategories.find((c) => c.name === watchedCategory);
    if (!cat) return [] as Brand[];
    return brandsByCategory.get(cat.id) ?? [];
  }, [activeCategories, brandsByCategory, watchedCategory]);

  useEffect(() => {
    const nextUnitType = watchedUnitType || "";
    const previousUnitType = previousUnitTypeRef.current;
    previousUnitTypeRef.current = nextUnitType || previousUnitType;
    if (!nextUnitType) return;

    setFormUnits((units) =>
      units.map((unit, index) => {
        if (!unit.isDefault) return unit;
        const nameWasUntouched =
          !unit.name ||
          unit.name === previousUnitType ||
          (!previousUnitType && index === 0);
        if (!nameWasUntouched) return unit;
        return { ...unit, name: nextUnitType, baseQuantity: 1 };
      })
    );
  }, [watchedUnitType]);

  // ============================================================
  // Submit
  // ============================================================

  const handleSubmit = form.handleSubmit(async (values) => {
    const editingId = routeProductId ?? null;
    const existingSku = products.find((p) => p.sku === values.sku && p.id !== editingId);
    if (existingSku) {
      form.setError("sku", { message: "SKU already exists." });
      return;
    }

    // Alias code is optional but must be unique across products when set.
    // Case + whitespace insensitive — matches the DB lookup index.
    const aliasTrimmed = values.aliasCode?.trim() ?? "";
    if (aliasTrimmed) {
      const aliasClash = products.find(
        (p) =>
          p.id !== editingId &&
          (p.aliasCode ?? "").trim().toLowerCase() === aliasTrimmed.toLowerCase(),
      );
      if (aliasClash) {
        form.setError("aliasCode", { message: "Alias code is already used by another product." });
        return;
      }
    }

    // Sanity check on the reorder ceiling. The DB allows max < threshold
    // (legitimate when admins are mid-change), but warn at submit so the
    // typical mistake (swapped values) gets caught.
    if (
      typeof values.maxQty === "number" &&
      Number.isFinite(values.maxQty) &&
      values.maxQty < values.lowStockThreshold
    ) {
      form.setError("maxQty", {
        message: `Max Qty must be ≥ Low Stock Threshold (${values.lowStockThreshold}).`,
      });
      return;
    }

    const categoryRow = activeCategories.find((c) => c.name === values.category);
    const brandsForCategory = categoryRow ? brandsByCategory.get(categoryRow.id) ?? [] : [];
    if (!editingId && brandsForCategory.length > 0 && !values.brandId) {
      form.setError("brandId", { message: "Brand is required for this category." });
      return;
    }
    if (values.brandId && !brandsForCategory.some((b) => b.id === values.brandId)) {
      form.setError("brandId", { message: "Selected brand is not part of the chosen category." });
      return;
    }

    const productId = editingId || formProductId || `prod-${Date.now()}`;
    const existingProduct = editingId ? products.find((p) => p.id === editingId) : null;
    const rawUnits = sanitizeProductUnits(formUnits.length > 0
      ? formUnits
      : [buildInitialUnit(productId, values.unitType, values.priceMmk, values.costMmk)], productId);
    const nextUnits = defaultPriceLevel
      ? rawUnits.map((unit) => {
          const raw = formUnitLevelPrices[unit.id]?.[defaultPriceLevel.id];
          if (raw === undefined || raw === "") return unit;
          const retailPrice = Number(raw);
          return Number.isFinite(retailPrice)
            ? { ...unit, salePriceMmk: Math.max(0, Math.trunc(retailPrice)) }
            : unit;
        })
      : rawUnits;
    const unitValidation = validateProductUnits(nextUnits);
    if (!unitValidation.valid) {
      setProductSaveError(unitValidation.error ?? "Units & Prices are invalid.");
      return;
    }
    const defaultUnit = nextUnits.find((unit) => unit.isActive && unit.isDefault) ?? nextUnits[0];

    if (defaultPriceLevel) {
      for (const unit of nextUnits.filter((row) => row.isActive)) {
        const raw = formUnitLevelPrices[unit.id]?.[defaultPriceLevel.id];
        const retailPrice = raw === undefined || raw === "" ? unit.salePriceMmk : Number(raw);
        if (!Number.isFinite(retailPrice) || retailPrice <= 0) {
          setProductSaveError(`${getPriceLevelFormLabel(defaultPriceLevel.code, defaultPriceLevel.name)} is required for ${unit.name || "each active unit"}.`);
          return;
        }
      }
    }

    const product = buildProductFromFormValues(
      {
        ...values,
        priceMmk: defaultUnit?.salePriceMmk ?? values.priceMmk,
        costMmk: defaultUnit?.purchasePriceMmk,
      },
      productId,
      existingProduct,
    );

    const barcodeValues = nextUnits
      .map((unit) => normalizeBarcodeValue(unitBarcodes[unit.id] ?? ""))
      .filter(Boolean);
    if (new Set(barcodeValues.map((value) => value.toLowerCase())).size !== barcodeValues.length) {
      setProductSaveError(BARCODE_FORM_MESSAGES.duplicateInForm);
      return;
    }
    for (const value of barcodeValues) {
      const owner = findBarcodeOwner(value, barcodes, editingId);
      if (owner) {
        setProductSaveError(
          `${BARCODE_FORM_MESSAGES.duplicateOtherProduct} (${value})`
        );
        return;
      }
    }

    setIsSaving(true);
    setProductSaveError(null);
    try {
      if (editingId) await updateProduct(product, []);
      else await addProduct(product, []);

      await replaceProductUnits(productId, nextUnits);

      const defaultLevel = activePriceLevels.find((pl) => pl.isDefault) ?? activePriceLevels[0];
      for (const unit of nextUnits) {
        const perLevel = formUnitLevelPrices[unit.id] ?? {};
        const rows: { priceLevelId: string; shopId?: string; priceMmk: number }[] = [];
        for (const level of activePriceLevels) {
          const raw = perLevel[level.id];
          const isDefault = defaultLevel && level.id === defaultLevel.id;
          if (raw === undefined || raw === "") {
            if (isDefault) rows.push({ priceLevelId: level.id, priceMmk: unit.salePriceMmk });
            continue;
          }
          const n = Number(raw);
          if (!Number.isFinite(n) || n < 0) {
            setProductSaveError(`Invalid ${level.name} price for ${unit.name}.`);
            throw new Error("invalid price-level input");
          }
          rows.push({ priceLevelId: level.id, priceMmk: Math.trunc(n) });
        }
        await replaceProductUnitPrices(unit.id, rows);
      }

      const nextRows: ProductBarcode[] = nextUnits
        .flatMap((unit, index): ProductBarcode[] => {
          const value = normalizeBarcodeValue(unitBarcodes[unit.id] ?? "");
          if (!value) return [];
          return [{
            id: `bc-${productId}-${unit.id}-${index}-${Date.now()}`,
            productId,
            productUnitId: unit.isDefault ? undefined : unit.id,
            value,
            type: "EAN13" as const,
          }];
        });
      await replaceProductBarcodes(productId, nextRows);

      void addAuditLog({
        id: `audit-${Math.random().toString(36).slice(2, 9)}`,
        actorId: currentUserId ?? "system",
        actionType: editingId ? "PRODUCT_EDIT" : "PRODUCT_CREATE",
        message: `${editingId ? "Updated" : "Created"} product ${values.name}.`,
        entityType: "Product",
        entityId: productId,
        createdAt: new Date().toISOString(),
      });

      navigate(PRODUCTS_ROUTE);
    } catch (error) {
      setProductSaveError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  });

  const handleCancel = () => navigate(PRODUCTS_ROUTE);

  // ============================================================
  // Render
  // ============================================================

  return (
    <Card>
      <PageHeader
        title={isEditing ? "Edit Product" : "Add New Product"}
        subtitle={
          isEditing
            ? "Update product identity, stock, units, and prices."
            : "Fill in the details to create a new product."
        }
        actions={
          <Button type="button" variant="secondary" onClick={handleCancel}>
            <span className="material-symbols-rounded mr-1 text-sm">arrow_back</span>
            Back to Products
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* Left column — Identity & stock */}
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Identity
            </h3>

            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">SKU</label>
                  <Input
                    placeholder="Auto-generated from category"
                    {...form.register("sku")}
                    readOnly
                    className="bg-slate-50 text-slate-500 cursor-not-allowed"
                  />
                  {form.formState.errors.sku && (
                    <p className="mt-1 text-xs text-red-500">
                      {form.formState.errors.sku.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Alias Code</label>
                  <Input
                    placeholder="Optional alternate code"
                    {...form.register("aliasCode")}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Product Name *</label>
                  <Input placeholder="e.g. Myanmar Lager Can" {...form.register("name")} />
                  {form.formState.errors.name && (
                    <p className="mt-1 text-xs text-red-500">{form.formState.errors.name.message}</p>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Short Name</label>
                  <Input
                    placeholder="Optional, e.g. Lager Can"
                    {...form.register("shortName")}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Used on POS tiles and receipts when full name is too long.
                  </p>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Product Image</label>
                <ProductImageInput
                  productId={formProductId}
                  shopId={currentShopId}
                  value={form.watch("imageUrl")}
                  onChange={(value) => form.setValue("imageUrl", value)}
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Classification
            </h3>

            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Category *</label>
                <Select {...form.register("category")}>
                  {activeCategories.map((cat) => (
                    <option key={cat.id} value={cat.name}>
                      {cat.name.charAt(0).toUpperCase() + cat.name.slice(1)}
                    </option>
                  ))}
                </Select>
              </div>

              {brandsForFormCategory.length > 0 && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Brand {isEditing ? "" : "*"}
                  </label>
                  <Select
                    value={form.watch("brandId") ?? ""}
                    onChange={(event) =>
                      form.setValue(
                        "brandId",
                        event.target.value || undefined,
                        { shouldValidate: true },
                      )
                    }
                  >
                    <option value="">Select a brand…</option>
                    {brandsForFormCategory.map((brand) => (
                      <option key={brand.id} value={brand.id}>
                        {brand.name}
                      </option>
                    ))}
                  </Select>
                  {form.formState.errors.brandId && (
                    <p className="mt-1 text-xs text-red-500">
                      {form.formState.errors.brandId.message}
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Base Stock Unit *</label>
                {(() => {
                  const currentValue = form.watch("unitType");
                  const resolved = resolveProductUnit(currentValue, unitTypes);

                  if (activeUnitTypes.length === 0 && resolved.kind !== "inactive" && resolved.kind !== "legacy") {
                    return (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        {loadError ? (
                          <>Unit types could not be loaded ({loadError}). Refresh and try again.</>
                        ) : (
                          <>
                            No unit types found.{" "}
                            <a className="font-medium underline" href="/app/admin/unit-types">
                              Add unit types in Settings
                            </a>{" "}
                            first.
                          </>
                        )}
                      </div>
                    );
                  }

                  return (
                    <>
                      <Select {...form.register("unitType")}>
                        {resolved.kind === "legacy" && resolved.value.length > 0 && (
                          <option value={resolved.value}>
                            Current: {resolved.value} (legacy)
                          </option>
                        )}
                        {resolved.kind === "inactive" && (
                          <option value={resolved.unitType.name}>
                            Current: {resolved.unitType.name} (inactive)
                          </option>
                        )}
                        {activeUnitTypes.map((unit) => (
                          <option key={unit.id} value={unit.name}>
                            {unit.name}
                            {unit.abbreviation ? ` (${unit.abbreviation})` : ""}
                          </option>
                        ))}
                      </Select>
                      {form.formState.errors.unitType && (
                        <p className="mt-1 text-xs text-red-500">
                          {form.formState.errors.unitType.message}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-slate-500">
                        Choose the smallest unit you count in inventory, such as Can, Bottle, or Sachet.
                      </p>
                    </>
                  );
                })()}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Default Purchase Terms</label>
                <Select {...form.register("purchaseType")}>
                  <option value="">Ask each time</option>
                  <option value="COD">COD (Cash on Delivery)</option>
                  <option value="CREDIT">Credit</option>
                </Select>
                <p className="mt-1 text-xs text-slate-500">
                  Pre-selected when creating a new purchase order for this product.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Stock & status
            </h3>

            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Low Stock Threshold *</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="10"
                    {...form.register("lowStockThreshold", { valueAsNumber: true })}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Max Qty (Reorder ceiling)</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="Optional"
                    {...form.register("maxQty", {
                      setValueAs: (v) => {
                        if (v === "" || v === null || v === undefined) return undefined;
                        const n = Number(v);
                        return Number.isFinite(n) ? n : undefined;
                      },
                    })}
                  />
                  {form.formState.errors.maxQty && (
                    <p className="mt-1 text-xs text-red-500">
                      {form.formState.errors.maxQty.message}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Expiry Date (Optional)</label>
                <Input type="date" {...form.register("expiryDate")} />
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Behaviour flags
                </span>
                <div className="mt-2 space-y-2">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      {...form.register("isOpenPrice")}
                    />
                    <span className="text-sm text-slate-700">
                      <span className="font-medium">Open Price</span>
                      <span className="block text-xs text-slate-500">
                        Cashier enters the price at the till — no fixed sale price.
                      </span>
                    </span>
                  </label>

                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      {...form.register("isNonStock")}
                    />
                    <span className="text-sm text-slate-700">
                      <span className="font-medium">Non-Stock Item</span>
                      <span className="block text-xs text-slate-500">
                        Skip inventory tracking — useful for services or pass-through items.
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="relative inline-flex cursor-pointer items-center">
                  <input type="checkbox" className="peer sr-only" {...form.register("isActive")} />
                  <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-2 peer-focus:ring-emerald-300"></div>
                </label>
                <span className="text-sm font-medium text-slate-700">
                  {form.watch("isActive") ? "Active" : "Inactive"}
                </span>
              </div>

              {isEditing && (
                <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
                  <div className="font-semibold uppercase tracking-wide text-slate-500">
                    Last supplier
                  </div>
                  {lastSupplierForProduct ? (
                    <>
                      <div className="mt-1 text-sm font-medium text-slate-800">
                        {lastSupplierForProduct.supplier.name}
                      </div>
                      <div className="text-xs text-slate-500">
                        PO {lastSupplierForProduct.orderNo} ·{" "}
                        {new Date(lastSupplierForProduct.when).toLocaleDateString()}
                      </div>
                    </>
                  ) : (
                    <p className="mt-1 italic text-slate-400">
                      No purchase order for this product yet.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column — Units & Prices */}
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Units & Prices
                </h3>
                <p className="mt-2 text-xs text-slate-500">
                  Set how this product is counted, bought, and sold. Stock is stored in base units.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Base unit: {form.watch("unitType") || "base unit"}. Larger units like Package or Case convert back to {form.watch("unitType") || "the base unit"}.
                </p>
              </div>
              <Button type="button" variant="secondary" onClick={addSellableUnit} className="min-h-10">
                <span className="material-symbols-rounded mr-1 text-sm">add</span>
                Add Unit
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {formUnits.map((unit, index) => {
                const baseUnitName = form.watch("unitType") || "base unit";
                const unitName = unit.name.trim() || "New unit";
                const isBaseUnit = unit.isDefault;
                const activeUnitCount = formUnits.filter((row) => row.isActive).length;
                const canDeactivate = !unit.isDefault && (!unit.isActive || activeUnitCount > 1);
                const duplicateBaseName =
                  !unit.isDefault &&
                  unit.name.trim().toLowerCase() === baseUnitName.trim().toLowerCase() &&
                  unit.baseQuantity !== 1;

                return (
                  <div
                    key={unit.id}
                    className={`rounded-xl border bg-white p-4 shadow-sm ${
                      unit.isActive ? "border-slate-200" : "border-slate-200 opacity-75"
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-semibold text-slate-800">{unitName}</h4>
                          {unit.isDefault && <Badge tone="green">Default POS unit</Badge>}
                          {unit.isActive ? <Badge tone="blue">Active</Badge> : <Badge tone="slate">Inactive</Badge>}
                          {isBaseUnit && <Badge tone="slate">Base unit</Badge>}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          1 {unitName} equals {isBaseUnit ? 1 : unit.baseQuantity || 1} {baseUnitName}.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={!unit.isActive || unit.isDefault}
                          onClick={() => setDefaultSellableUnit(unit.id)}
                        >
                          Set Default
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={!canDeactivate}
                          onClick={() => {
                            if (unit.isActive) deactivateSellableUnit(unit.id);
                            else updateFormUnit(unit.id, { isActive: true });
                          }}
                        >
                          {unit.isActive ? "Deactivate" : "Reactivate"}
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-slate-500">Unit name</span>
                          <Input
                            value={unit.name}
                            onChange={(event) => updateFormUnit(unit.id, { name: event.target.value })}
                            placeholder={index === 0 ? baseUnitName : "Package, Case, 6 Pack"}
                          />
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-slate-500">Base quantity</span>
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={isBaseUnit ? 1 : unit.baseQuantity}
                            readOnly={isBaseUnit}
                            className={isBaseUnit ? "bg-slate-50 text-slate-500 cursor-not-allowed" : undefined}
                            onChange={(event) => {
                              if (isBaseUnit) return;
                              updateFormUnit(unit.id, {
                                baseQuantity: Math.max(1, Number(event.target.value.replace(/\D/g, "") || 1)),
                              });
                            }}
                            placeholder="1"
                          />
                          <p className="mt-1 text-xs text-slate-500">
                            {isBaseUnit
                              ? `Base unit always equals 1 ${baseUnitName}.`
                              : `POS deducts ${unit.baseQuantity || 1} ${baseUnitName} per ${unitName}.`}
                          </p>
                        </label>
                      </div>

                      {duplicateBaseName && (
                        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          This unit has the same name as the base unit but does not equal 1 {baseUnitName}. Rename it to avoid cashier confusion.
                        </p>
                      )}

                      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Pricing
                          </span>
                          <span className="text-xs text-slate-500">
                            Blank Wholesale/Special uses {defaultPriceLevel?.name ?? "Retail"} price.
                          </span>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-slate-500">Purchase Cost</span>
                            <MoneyInput
                              value={unit.purchasePriceMmk}
                              onChange={(next) => updateUnitPurchaseCost(unit.id, next ?? undefined)}
                              allowEmpty
                              placeholder="Optional"
                            />
                          </label>

                          {activePriceLevels.length > 0 ? (
                            activePriceLevels.map((level) => {
                              const raw = formUnitLevelPrices[unit.id]?.[level.id] ?? "";
                              const isDefaultLevel = defaultPriceLevel?.id === level.id;
                              return (
                                <label key={level.id} className="block">
                                  <span className="mb-1 block text-xs font-medium text-slate-500">
                                    {getPriceLevelFormLabel(level.code, level.name)}
                                  </span>
                                  <Input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder={isDefaultLevel ? "Required" : "Use Retail"}
                                    value={raw}
                                    onChange={(event) => updateUnitLevelPrice(unit.id, level.id, event.target.value)}
                                  />
                                </label>
                              );
                            })
                          ) : (
                            <label className="block">
                              <span className="mb-1 block text-xs font-medium text-slate-500">Retail Price (Sale 1)</span>
                              <MoneyInput
                                value={unit.salePriceMmk}
                                onChange={(next) => {
                                  const salePriceMmk = next ?? 0;
                                  updateFormUnit(unit.id, { salePriceMmk });
                                  if (unit.isDefault) form.setValue("priceMmk", salePriceMmk, { shouldValidate: true });
                                }}
                                placeholder="Required"
                              />
                            </label>
                          )}
                        </div>
                      </div>

                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-slate-500">Barcode for this unit</span>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Input
                            value={unitBarcodes[unit.id] ?? ""}
                            onChange={(event) => setUnitBarcodes((rows) => ({
                              ...rows,
                              [unit.id]: normalizeBarcodeValue(event.target.value),
                            }))}
                            placeholder={unit.isDefault ? "Optional, SKU fallback" : "Optional unit barcode"}
                          />
                          <Button type="button" variant="secondary" onClick={() => openUnitScanModal(unit.id)} className="min-h-10">
                            <span className="material-symbols-rounded mr-1 text-sm">qr_code_scanner</span>
                            Scan
                          </Button>
                          {unitBarcodes[unit.id] && (
                            <Button type="button" variant="secondary" onClick={() => handleRemoveBarcode(unit.id)} className="min-h-10">
                              Clear
                            </Button>
                          )}
                        </div>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer spans both columns */}
        <div className="lg:col-span-2">
          {productSaveError && (
            <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {productSaveError}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={handleCancel} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving
                ? "Saving..."
                : isEditing
                  ? "Update Product"
                  : "Create Product"}
            </Button>
          </div>
        </div>
      </form>

      <BarcodeScanModal
        open={scanModalOpen}
        onClose={() => {
          setScanModalOpen(false);
          setScanUnitId(null);
        }}
        onScan={handleScannedBarcode}
      />
    </Card>
  );
};
