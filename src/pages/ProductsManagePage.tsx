import { useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuthStore } from "../stores/authStore";
import { useAppStore } from "../stores/appStore";
import { useDataStore } from "../stores/dataStore";
import type { ProductCategory, Category, Product, ProductBarcode } from "../types";
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
import { Modal } from "../components/ui/Modal";
import { Table, THead, TBody, TR, TH, TD } from "../components/ui/Table";
import { SearchInput } from "../components/forms/SearchInput";
import { ProductImageInput } from "../components/forms/ProductImageInput";
import { MoneyInput } from "../components/forms/MoneyInput";
import { BarcodeScanModal } from "../components/forms/BarcodeScanModal";
import { useToast } from "../components/ui/Toast";
import { Pagination } from "../components/ui/Pagination";
import { formatMmk } from "../lib/utils";
import { CATEGORY_ICONS, resolveCategoryIcon } from "../features/categories/categoryIcons";
import { getCategoryDeleteBlockMessage } from "../features/categories/categoryUsage";
import { CategoryFilter } from "../features/categories/CategoryFilter";
import {
  compareUnitTypes,
  resolveProductUnit,
} from "../features/unitTypes/unitTypeValidation";

type CategoryColor = "amber" | "red" | "green" | "blue" | "purple" | "slate" | "pink" | "teal" | "indigo" | "yellow" | "orange" | "cyan";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

interface FormValues {
  id?: string;
  sku: string;
  name: string;
  category: ProductCategory;
  unitType: string;
  priceMmk: number;
  costMmk?: number;
  packSize?: number;
  lowStockThreshold: number;
  expiryDate?: string;
  imageUrl?: string;
  isActive: boolean;
}

export const ProductsManagePage = () => {
  const toast = useToast();
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentShopId = useAppStore((state) => state.currentShopId);
  const products = useDataStore((state) => state.products);
  const barcodes = useDataStore((state) => state.barcodes);
  const inventory = useDataStore((state) => state.inventory);
  const shops = useDataStore((state) => state.shops);
  const categories = useDataStore((state) => state.categories);
  const unitTypes = useDataStore((state) => state.unitTypes);
  const loadError = useDataStore((state) => state.loadError);
  const addProduct = useDataStore((state) => state.addProduct);
  const updateProduct = useDataStore((state) => state.updateProduct);
  const deleteProduct = useDataStore((state) => state.deleteProduct);
  const replaceProductBarcodes = useDataStore((state) => state.replaceProductBarcodes);
  const addCategory = useDataStore((state) => state.addCategory);
  const updateCategory = useDataStore((state) => state.updateCategory);
  const deleteCategory = useDataStore((state) => state.deleteCategory);
  const addAuditLog = useDataStore((state) => state.addAuditLog);

  // Product modal state
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // The product id used for BOTH the storage image path and the saved row.
  // Generated up-front on "Add" so the image can be uploaded before submit.
  const [formProductId, setFormProductId] = useState("");

  // Package barcode editor state — lives outside the react-hook-form schema
  // because the list is multi-row and capture is driven by a separate modal.
  const [formBarcodes, setFormBarcodes] = useState<string[]>([]);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [productSaveError, setProductSaveError] = useState<string | null>(null);
  const [isSavingProduct, setIsSavingProduct] = useState(false);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<ProductCategory | "all">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Category modal state
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState<CategoryColor>("blue");
  const [newCategoryIconKey, setNewCategoryIconKey] = useState("");

  // Get active categories
  const activeCategories = useMemo(() => {
    return categories.filter((c) => c.isActive);
  }, [categories]);

  // Active unit types feed the dropdown. Sorted by sort_order then name so
  // the order admins choose in Settings is what cashiers see here.
  const activeUnitTypes = useMemo(
    () => unitTypes.filter((u) => u.isActive).sort(compareUnitTypes),
    [unitTypes],
  );

  const schema = useMemo(() => {
    return z.object({
      sku: z.string().min(1, "SKU is required"),
      name: z.string().min(2, "Name must be at least 2 characters"),
      category: z.string().min(1, "Category is required"),
      // Dynamic registry: a non-empty string is required, and the value
      // must either match an active unit type OR be the row's existing
      // legacy value (handled at submit time — see handleSubmit).
      unitType: z.string().min(1, "Unit type is required"),
      priceMmk: z.number().min(1, "Price must be greater than 0"),
      costMmk: z.number().optional(),
      packSize: z.number().optional(),
      lowStockThreshold: z.number().min(0, "Threshold must be 0 or greater"),
      expiryDate: z.string().optional(),
      imageUrl: z.string().optional(),
      isActive: z.boolean(),
    });
  }, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      sku: "",
      name: "",
      category: activeCategories[0]?.name ?? "",
      unitType: activeUnitTypes[0]?.name ?? "",
      priceMmk: 0,
      costMmk: undefined,
      packSize: undefined,
      lowStockThreshold: 10,
      expiryDate: undefined,
      imageUrl: undefined,
      isActive: true,
    },
  });


  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, filterCategory, filterStatus]);

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch =
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        barcodes.some((b) => b.productId === product.id && b.value.includes(searchQuery));
      const matchesCategory = filterCategory === "all" || product.category === filterCategory;
      const matchesStatus =
        filterStatus === "all" ||
        (filterStatus === "active" && product.isActive) ||
        (filterStatus === "inactive" && !product.isActive);
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [products, barcodes, searchQuery, filterCategory, filterStatus]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const paginatedProducts = filteredProducts.slice((page - 1) * pageSize, page * pageSize);

  // Inventory is per-shop: stock is shown for the currently selected shop,
  // never summed into a fake global quantity. Switch shops in the sidebar to
  // see another shop's stock for the same shared product.
  const currentShopName =
    shops.find((s) => s.id === currentShopId)?.name ?? "No shop selected";
  const getProductStock = (productId: string) => {
    if (!currentShopId) return 0;
    const record = inventory.find(
      (inv) => inv.shopId === currentShopId && inv.productId === productId,
    );
    return record?.qtyBaseUnits ?? 0;
  };

  const getCategoryColor = (categoryName: string): CategoryColor => {
    const cat = categories.find((c) => c.name === categoryName);
    return cat?.color ?? "slate";
  };

  const resetBarcodeEditor = () => {
    setFormBarcodes([]);
    setScanModalOpen(false);
    setProductSaveError(null);
  };

  // Open modal for adding new product
  const handleAddProduct = () => {
    form.reset({
      sku: "",
      name: "",
      category: activeCategories[0]?.name ?? "",
      unitType: activeUnitTypes[0]?.name ?? "",
      priceMmk: 0,
      costMmk: undefined,
      packSize: undefined,
      lowStockThreshold: 10,
      expiryDate: undefined,
      imageUrl: undefined,
      isActive: true,
    });
    setEditingId(null);
    setFormProductId(`prod-${Date.now()}`);
    resetBarcodeEditor();
    setShowProductModal(true);
  };

  // Open modal for editing product
  const handleEditProduct = (product: Product) => {
    form.reset({
      id: product.id,
      sku: product.sku || "",
      name: product.name,
      category: product.category,
      unitType: product.unitType,
      priceMmk: product.priceMmk,
      costMmk: product.costMmk,
      packSize: product.packSize,
      lowStockThreshold: product.lowStockThreshold,
      expiryDate: product.expiryDate,
      imageUrl: product.imageUrl,
      isActive: product.isActive,
    });
    setEditingId(product.id);
    setFormProductId(product.id);
    resetBarcodeEditor();
    setFormBarcodes(
      barcodes
        .filter((b) => b.productId === product.id)
        .map((b) => b.value)
    );
    setShowProductModal(true);
  };

  const handleCloseProductModal = () => {
    setShowProductModal(false);
    setEditingId(null);
    resetBarcodeEditor();
    form.reset();
  };

  /**
   * Accept a normalized barcode value from the scan modal. Returns an
   * error string when the value is rejected (in-form duplicate, or
   * already linked to another product) so the modal can surface it
   * inline and keep itself open. Returns null on success.
   *
   * Validation + normalization already ran inside BarcodeScanModal; we
   * still re-check duplicates here because the parent owns the form's
   * current list and the loaded cross-product `barcodes` store.
   */
  const handleScannedBarcode = (value: string): string | null => {
    const normalized = normalizeBarcodeValue(value);
    const error = checkBarcodeAddable(normalized, formBarcodes, barcodes, editingId);
    if (error) return error;
    setFormBarcodes((list) => [...list, normalized]);
    toast({ title: "Barcode added", description: normalized, variant: "success" });
    return null;
  };

  const handleRemoveBarcode = (value: string) => {
    setFormBarcodes((list) => list.filter((item) => item !== value));
  };

  const handleDeleteProduct = async (product: Product) => {
    if (!confirm(`Permanently delete "${product.name}"? This cannot be undone.`)) return;

    try {
      await deleteProduct(product.id);
    } catch (error) {
      alert(getErrorMessage(error) || "Could not delete the product.");
      return;
    }

    void addAuditLog({
      id: `audit-${Math.random().toString(36).slice(2, 9)}`,
      actorId: currentUserId ?? "system",
      actionType: "PRODUCT_DELETE",
      message: `Deleted product ${product.name}.`,
      entityType: "Product",
      entityId: product.id,
      createdAt: new Date().toISOString(),
    });
  };

  const handleSubmit = form.handleSubmit(async (values) => {
    // Check for duplicate SKU
    const existingSku = products.find((p) => p.sku === values.sku && p.id !== editingId);
    if (existingSku) {
      form.setError("sku", { message: "SKU already exists." });
      return;
    }

    // Same id used for the storage image path (see formProductId / ProductImageInput).
    const productId = editingId || formProductId || `prod-${Date.now()}`;
    const existingProduct = editingId ? products.find((p) => p.id === editingId) : null;
    const costMmk = Number.isFinite(values.costMmk) ? values.costMmk : undefined;
    const packSize = Number.isFinite(values.packSize) ? values.packSize : undefined;

    const product = {
      id: productId,
      sku: values.sku,
      name: values.name,
      category: values.category,
      unitType: values.unitType,
      priceMmk: values.priceMmk,
      costMmk,
      packSize,
      lowStockThreshold: values.lowStockThreshold,
      expiryDate: values.expiryDate || undefined,
      imageUrl: values.imageUrl || undefined,
      isActive: values.isActive,
      createdAt: existingProduct?.createdAt ?? new Date().toISOString(),
    };

    // Pre-flight barcode duplicate check against the loaded store data so
    // we fail fast before touching the DB. The DB unique index is the
    // authoritative fallback if the local barcode list is stale.
    for (const value of formBarcodes) {
      const owner = findBarcodeOwner(value, barcodes, editingId);
      if (owner) {
        setProductSaveError(
          `${BARCODE_FORM_MESSAGES.duplicateOtherProduct} (${value})`
        );
        return;
      }
    }

    setIsSavingProduct(true);
    setProductSaveError(null);
    try {
      // Product row first (fire-and-forget like the rest of the page — the
      // image upload, audit log, and category writes all use this pattern).
      if (editingId) updateProduct(product, []);
      else addProduct(product, []);

      // Then reconcile barcode rows. This call throws on DB unique-index
      // violation so a duplicate barcode is surfaced inline; the form
      // stays open and the user can adjust.
      const nextRows: ProductBarcode[] = formBarcodes.map((value, index) => ({
        id: `bc-${productId}-${index}-${Date.now()}`,
        productId,
        value,
        type: "EAN13",
      }));
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

      handleCloseProductModal();
    } catch (error) {
      setProductSaveError(getErrorMessage(error));
    } finally {
      setIsSavingProduct(false);
    }
  });

  const generateSku = (categoryName?: string) => {
    const cat = categoryName ?? form.getValues("category");
    if (!cat) return;
    const prefix = cat.substring(0, 3).toUpperCase();
    // Find next sequential number for this category prefix
    const existing = products
      .map((p) => p.sku ?? "")
      .filter((s) => s.startsWith(prefix + "-"))
      .map((s) => parseInt(s.slice(prefix.length + 1), 10))
      .filter((n) => !isNaN(n));
    const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
    form.setValue("sku", `${prefix}-${String(next).padStart(3, "0")}`);
  };

  // Auto-generate SKU when category changes (new product only)
  const watchedCategory = form.watch("category");
  useEffect(() => {
    if (!editingId && watchedCategory) generateSku(watchedCategory);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedCategory, editingId]);

  // Category management functions
  const handleSaveCategory = () => {
    if (!newCategoryName.trim()) return;

    const categoryName = newCategoryName.trim().toLowerCase();

    // Check for duplicate
    const existing = categories.find(
      (c) => c.name.toLowerCase() === categoryName && c.id !== editingCategory?.id
    );
    if (existing) {
      alert("Category already exists");
      return;
    }

    // Block duplicate icon + color combo. Compare the *effective* icon so the
    // rule also catches matches against icon-less categories (which resolve
    // their icon from the name).
    const effectiveIconKey = resolveCategoryIcon(
      newCategoryIconKey || null,
      categoryName,
    ).key;
    const sameLook = categories.find((c) => {
      if (c.id === editingCategory?.id) return false;
      const otherIconKey = resolveCategoryIcon(c.iconKey ?? null, c.name).key;
      return otherIconKey === effectiveIconKey && c.color === newCategoryColor;
    });
    if (sameLook) {
      alert(
        `Category "${sameLook.name}" already uses this icon and color combination. Please choose a different icon or color.`,
      );
      return;
    }

    if (editingCategory) {
      updateCategory({
        ...editingCategory,
        name: categoryName,
        color: newCategoryColor,
        iconKey: newCategoryIconKey || undefined,
      });
      void addAuditLog({
        id: `audit-${Math.random().toString(36).slice(2, 9)}`,
        actorId: currentUserId ?? "system",
        actionType: "CATEGORY_EDIT",
        message: `Updated category "${categoryName}".`,
        entityType: "Category",
        entityId: editingCategory.id,
        createdAt: new Date().toISOString(),
      });
    } else {
      const newCategory: Category = {
        id: `cat-${Math.random().toString(36).slice(2, 9)}`,
        name: categoryName,
        color: newCategoryColor,
        iconKey: newCategoryIconKey || undefined,
        isActive: true,
        createdAt: new Date().toISOString(),
      };
      addCategory(newCategory);
      void addAuditLog({
        id: `audit-${Math.random().toString(36).slice(2, 9)}`,
        actorId: currentUserId ?? "system",
        actionType: "CATEGORY_CREATE",
        message: `Created category "${categoryName}".`,
        entityType: "Category",
        entityId: newCategory.id,
        createdAt: new Date().toISOString(),
      });
    }

    setShowCategoryModal(false);
    setEditingCategory(null);
    setNewCategoryName("");
    setNewCategoryColor("blue");
    setNewCategoryIconKey("");
  };

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category);
    setNewCategoryName(category.name);
    setNewCategoryColor(category.color);
    // Pre-select the explicit iconKey, or the icon resolved from the name so
    // older (icon-less) categories show their sensible default already chosen.
    setNewCategoryIconKey(category.iconKey ?? resolveCategoryIcon(null, category.name).key);
    setShowCategoryModal(true);
  };

  const handleDeleteCategory = (category: Category) => {
    // Safe delete: block while products still use this category (matched by
    // name). Products are never deleted or auto-reassigned.
    const blockMessage = getCategoryDeleteBlockMessage(products, category.name);
    if (blockMessage) {
      alert(blockMessage);
      return;
    }

    if (!confirm(`Are you sure you want to delete "${category.name}"?`)) return;

    try {
      // deleteCategory re-checks usage in the data layer and throws if unsafe.
      deleteCategory(category.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not delete the category.");
      return;
    }

    void addAuditLog({
      id: `audit-${Math.random().toString(36).slice(2, 9)}`,
      actorId: currentUserId ?? "system",
      actionType: "CATEGORY_DELETE",
      message: `Deleted category "${category.name}".`,
      entityType: "Category",
      entityId: category.id,
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <Card>
      <PageHeader
        title="Product Management"
        subtitle="Products are a shared catalog; the Stock column shows on-hand units for the selected shop only."
        actions={
          <Button onClick={handleAddProduct}>
            <span className="material-symbols-rounded mr-1 text-sm">add</span>
            Add Product
          </Button>
        }
      />

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search by name, SKU, or barcode..."
        />
        <Select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as "all" | "active" | "inactive")}
        >
          <option value="all">All Status</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-slate-500">Show:</span>
          <Select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Category filter — shared icon-chip filter (no native dropdown) */}
      <CategoryFilter
        className="mt-3"
        categories={categories}
        selectedCategory={filterCategory}
        onChange={(value) => setFilterCategory(value as ProductCategory | "all")}
      />

      {/* Products Table */}
      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200/70">
        <Table>
          <THead>
            <TR>
              <TH>Product</TH>
              <TH>Category</TH>
              <TH className="text-right">Price</TH>
              <TH className="text-right">Cost</TH>
              <TH className="text-right">
                Stock
                <span className="block text-[10px] font-normal text-slate-400">
                  {currentShopName}
                </span>
              </TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {paginatedProducts.length === 0 ? (
              <TR>
                <TD colSpan={7} className="py-8 text-center text-slate-500">
                  No products found
                </TD>
              </TR>
            ) : (
              paginatedProducts.map((product) => {
                const stock = getProductStock(product.id);
                const isLowStock = stock <= product.lowStockThreshold;
                const productBarcodes = barcodes.filter((b) => b.productId === product.id);

                return (
                  <TR
                    key={product.id}
                    className={!product.isActive ? "bg-slate-50/50 opacity-60" : "hover:bg-slate-50/50"}
                  >
                    <TD>
                      <div className="flex items-center gap-3 min-w-[200px]">
                        {/* Product Thumbnail */}
                        <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-slate-100">
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-slate-400">
                              <span className="material-symbols-rounded text-lg">inventory_2</span>
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-slate-800">{product.name}</div>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            {product.sku && <span className="font-mono">{product.sku}</span>}
                            {productBarcodes.length > 0 && (
                              <>
                                <span>•</span>
                                <span className="font-mono">{productBarcodes[0].value}</span>
                                {productBarcodes.length > 1 && (
                                  <span className="text-slate-400">+{productBarcodes.length - 1}</span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      <Badge tone={getCategoryColor(product.category)}>{product.category}</Badge>
                    </TD>
                    <TD className="text-right font-medium text-emerald-600">{formatMmk(product.priceMmk)}</TD>
                    <TD className="text-right text-slate-500">
                      {product.costMmk ? formatMmk(product.costMmk) : "-"}
                    </TD>
                    <TD className="text-right">
                      <span className={isLowStock ? "font-medium text-amber-600" : ""}>
                        {stock} {product.unitType}
                      </span>
                      {isLowStock && stock > 0 && <div className="text-xs text-amber-500">Low</div>}
                      {stock === 0 && <div className="text-xs text-red-500">Out</div>}
                    </TD>
                    <TD>
                      <Badge tone={product.isActive ? "green" : "slate"}>
                        {product.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TD>
                    <TD className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleEditProduct(product)}>
                          <span className="material-symbols-rounded text-sm">edit</span>
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void handleDeleteProduct(product)}>
                          <span className="material-symbols-rounded text-sm text-red-500">delete</span>
                        </Button>
                      </div>
                    </TD>
                  </TR>
                );
              })
            )}
          </TBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm text-slate-500">
          Showing {filteredProducts.length === 0 ? 0 : (page - 1) * pageSize + 1}-
          {Math.min(page * pageSize, filteredProducts.length)} of {filteredProducts.length} products
        </span>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </div>

      {/* Category Management Section */}
      <div className="mt-8 border-t border-slate-200 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Categories</h3>
            <p className="text-sm text-slate-500">Manage product categories.</p>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              setEditingCategory(null);
              setNewCategoryName("");
              setNewCategoryColor("blue");
              setNewCategoryIconKey("");
              setShowCategoryModal(true);
            }}
          >
            <span className="material-symbols-rounded mr-1 text-sm">add</span>
            Add Category
          </Button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {activeCategories.map((category) => {
            const productCount = products.filter((p) => p.category === category.name).length;
            const icon = resolveCategoryIcon(category.iconKey, category.name);
            // Color is now only a small accent on the icon tile.
            const accent: Record<CategoryColor, string> = {
              amber: "bg-amber-100 text-amber-600",
              red: "bg-red-100 text-red-600",
              green: "bg-green-100 text-green-600",
              blue: "bg-blue-100 text-blue-600",
              purple: "bg-purple-100 text-purple-600",
              slate: "bg-slate-100 text-slate-600",
              pink: "bg-pink-100 text-pink-600",
              teal: "bg-teal-100 text-teal-600",
              indigo: "bg-indigo-100 text-indigo-600",
              yellow: "bg-yellow-100 text-yellow-700",
              orange: "bg-orange-100 text-orange-600",
              cyan: "bg-cyan-100 text-cyan-600",
            };

            return (
              <div key={category.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${accent[category.color]}`}
                    >
                      <span className="material-symbols-rounded">{icon.symbol}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold capitalize text-slate-800">
                        {category.name}
                      </div>
                      <p className="text-xs text-slate-500">{productCount} product(s)</p>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => handleEditCategory(category)}
                      className="rounded p-1 text-slate-500 hover:bg-slate-100"
                      title="Edit"
                    >
                      <span className="material-symbols-rounded text-sm">edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(category)}
                      className="rounded p-1 text-slate-500 hover:bg-slate-100"
                      title="Delete"
                    >
                      <span className="material-symbols-rounded text-sm">delete</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Product Modal */}
      <Modal
        open={showProductModal}
        onClose={handleCloseProductModal}
        title={editingId ? "Edit Product" : "Add New Product"}
        description={editingId ? "Update the product details below." : "Fill in the details to create a new product."}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* SKU */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">SKU</label>
            <Input
              placeholder="Auto-generated from category"
              {...form.register("sku")}
              readOnly
              className="bg-slate-50 text-slate-500 cursor-not-allowed"
            />
          </div>

          {/* Name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Product Name *</label>
            <Input placeholder="e.g. Myanmar Lager Can" {...form.register("name")} />
            {form.formState.errors.name && (
              <p className="mt-1 text-xs text-red-500">{form.formState.errors.name.message}</p>
            )}
          </div>

          {/* Product Image — compressed to < 100 KB before it is stored. */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Product Image</label>
            <ProductImageInput
              productId={formProductId}
              shopId={currentShopId}
              value={form.watch("imageUrl")}
              onChange={(value) => form.setValue("imageUrl", value)}
            />
          </div>

          {/* Category & Unit Type */}
          <div className="grid gap-3 md:grid-cols-2">
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
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Unit Type *</label>
              {(() => {
                // Resolve the saved value so we can still render it for legacy
                // or deactivated rows when editing an existing product.
                const currentValue = form.watch("unitType");
                const resolved = resolveProductUnit(currentValue, unitTypes);

                if (activeUnitTypes.length === 0 && resolved.kind !== "inactive" && resolved.kind !== "legacy") {
                  // Distinguish "load failed" from "registry is genuinely
                  // empty" so the admin knows which one to fix first.
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
                      {/* Legacy / inactive entries kept selectable when editing
                          so existing products don't silently change unit. */}
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
                  </>
                );
              })()}
            </div>
          </div>

          {/* Price & Cost */}
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Selling Price (MMK) *</label>
              <Controller
                control={form.control}
                name="priceMmk"
                render={({ field }) => (
                  <MoneyInput
                    value={field.value}
                    onChange={(next) => field.onChange(next ?? 0)}
                    onBlur={field.onBlur}
                    name={field.name}
                    placeholder="0"
                  />
                )}
              />
              {form.formState.errors.priceMmk && (
                <p className="mt-1 text-xs text-red-500">{form.formState.errors.priceMmk.message}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Cost Price (MMK)</label>
              <Controller
                control={form.control}
                name="costMmk"
                render={({ field }) => (
                  <MoneyInput
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    allowEmpty
                    placeholder="0"
                  />
                )}
              />
            </div>
          </div>

          {/* Pack Size & Low Stock */}
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Pack Size</label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="e.g. 24 for a case"
                {...form.register("packSize", { valueAsNumber: true })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Low Stock Threshold *</label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="10"
                {...form.register("lowStockThreshold", { valueAsNumber: true })}
              />
            </div>
          </div>

          {/* Expiry Date & Active */}
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Expiry Date (Optional)</label>
              <Input type="date" {...form.register("expiryDate")} />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <label className="relative inline-flex cursor-pointer items-center">
                <input type="checkbox" className="peer sr-only" {...form.register("isActive")} />
                <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-2 peer-focus:ring-emerald-300"></div>
              </label>
              <span className="text-sm font-medium text-slate-700">
                {form.watch("isActive") ? "Active" : "Inactive"}
              </span>
            </div>
          </div>

          {/* Package Barcodes */}
          <div className="rounded-xl border border-slate-200/70 bg-slate-50/40 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Package Barcodes
                </label>
                <p className="mt-1 text-xs text-slate-500">
                  Scan the barcode printed on the product package. Cashiers can
                  scan this at POS to add the product to the cart.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setScanModalOpen(true)}
              >
                <span className="material-symbols-rounded mr-1 text-sm">
                  qr_code_scanner
                </span>
                Scan barcode
              </Button>
            </div>
            {formBarcodes.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {formBarcodes.map((value) => (
                  <li
                    key={value}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-mono text-slate-700"
                  >
                    <span>{value}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveBarcode(value)}
                      className="text-slate-400 hover:text-red-500"
                      title="Remove"
                    >
                      <span className="material-symbols-rounded text-xs">close</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs italic text-slate-400">
                No package barcodes yet. Click Scan barcode to add one.
              </p>
            )}
          </div>

          {productSaveError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {productSaveError}
            </div>
          )}

          {/* Submit Buttons */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handleCloseProductModal}
              disabled={isSavingProduct}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSavingProduct}>
              {isSavingProduct
                ? "Saving..."
                : editingId
                  ? "Update Product"
                  : "Create Product"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Package barcode scan modal — opened from the Product modal,
          rendered as a sibling so its own focused input doesn't compete
          with the product form's inputs. */}
      <BarcodeScanModal
        open={scanModalOpen}
        onClose={() => setScanModalOpen(false)}
        onScan={handleScannedBarcode}
      />

      {/* Category Modal */}
      <Modal
        open={showCategoryModal}
        onClose={() => {
          setShowCategoryModal(false);
          setEditingCategory(null);
          setNewCategoryName("");
          setNewCategoryColor("blue");
          setNewCategoryIconKey("");
        }}
        title={editingCategory ? "Edit Category" : "Add New Category"}
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Category Name *</label>
            <Input
              placeholder="e.g. snacks, beverages"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Icon</label>
            <div className="grid grid-cols-6 gap-2">
              {CATEGORY_ICONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  title={opt.label}
                  onClick={() => setNewCategoryIconKey(opt.key)}
                  className={`flex items-center justify-center rounded-lg border p-2 transition-colors ${
                    newCategoryIconKey === opt.key
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  <span className="material-symbols-rounded">{opt.symbol}</span>
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {newCategoryIconKey
                ? `Selected: ${CATEGORY_ICONS.find((i) => i.key === newCategoryIconKey)?.label ?? newCategoryIconKey}`
                : "Pick an icon (optional — otherwise resolved from the category name)."}
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Color Accent</label>
            <div className="flex flex-wrap gap-2">
              {(["amber", "orange", "yellow", "red", "pink", "green", "teal", "cyan", "blue", "indigo", "purple", "slate"] as CategoryColor[]).map((color) => {
                const colorStyles: Record<CategoryColor, string> = {
                  amber: "bg-amber-500",
                  orange: "bg-orange-500",
                  yellow: "bg-yellow-400",
                  red: "bg-red-500",
                  pink: "bg-pink-500",
                  green: "bg-green-500",
                  teal: "bg-teal-500",
                  cyan: "bg-cyan-500",
                  blue: "bg-blue-500",
                  indigo: "bg-indigo-500",
                  purple: "bg-purple-500",
                  slate: "bg-slate-500",
                };
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewCategoryColor(color)}
                    className={`flex h-8 w-8 items-center justify-center rounded-full ${colorStyles[color]} transition-transform ${
                      newCategoryColor === color ? "scale-110 ring-2 ring-offset-2" : "hover:scale-105"
                    }`}
                  >
                    {newCategoryColor === color && (
                      <span className="material-symbols-rounded text-sm text-white">check</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setShowCategoryModal(false);
                setEditingCategory(null);
                setNewCategoryName("");
                setNewCategoryColor("blue");
                setNewCategoryIconKey("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveCategory} disabled={!newCategoryName.trim()}>
              {editingCategory ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
};
