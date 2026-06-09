import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { useAppStore } from "../stores/appStore";
import { useDataStore } from "../stores/dataStore";
import type { ProductCategory, Brand, Category, Product } from "../types";
import { getErrorMessage } from "../lib/errors";
import { hasPermission } from "../lib/permissions";
import { PageHeader } from "../components/layout/PageHeader";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { Table, THead, TBody, TR, TH, TD } from "../components/ui/Table";
import { SearchInput } from "../components/forms/SearchInput";
import { Pagination } from "../components/ui/Pagination";
import { formatMmk } from "../lib/utils";
import { downloadCsv, parseCsvRecords } from "../lib/csv";
import { CATEGORY_ICONS, resolveCategoryIcon } from "../features/categories/categoryIcons";
import { getCategoryDeleteBlockMessage } from "../features/categories/categoryUsage";
import { CategoryFilter } from "../features/categories/CategoryFilter";
import {
  buildProductCsvImportPlan,
  buildProductCsvRows,
  getProductCsvHeaders,
  type ProductCsvImportPlan,
} from "../features/catalog/productCsv";

type CategoryColor = "amber" | "red" | "green" | "blue" | "purple" | "slate" | "pink" | "teal" | "indigo" | "yellow" | "orange" | "cyan";

const PAGE_SIZE = 10;

export const ProductsManagePage = () => {
  const navigate = useNavigate();
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentShopId = useAppStore((state) => state.currentShopId);
  const currentUser = useDataStore((state) => state.users.find((u) => u.id === currentUserId));
  // Route guard already requires `product:read`. These per-action gates
  // hide Create / Delete affordances from roles (Manager) that can only
  // update. Buttons stay rendered for admins, who hold every permission.
  const canCreateProducts = hasPermission(currentUser, "product:create");
  const canDeleteProducts = hasPermission(currentUser, "product:delete");
  const products = useDataStore((state) => state.products);
  const productUnits = useDataStore((state) => state.productUnits);
  const barcodes = useDataStore((state) => state.barcodes);
  const inventory = useDataStore((state) => state.inventory);
  const shops = useDataStore((state) => state.shops);
  const categories = useDataStore((state) => state.categories);
  const unitTypes = useDataStore((state) => state.unitTypes);
  const priceLevels = useDataStore((state) => state.priceLevels);
  const productUnitPrices = useDataStore((state) => state.productUnitPrices);
  const addProduct = useDataStore((state) => state.addProduct);
  const updateProduct = useDataStore((state) => state.updateProduct);
  const deleteProduct = useDataStore((state) => state.deleteProduct);
  const replaceProductUnits = useDataStore((state) => state.replaceProductUnits);
  const replaceProductUnitPrices = useDataStore((state) => state.replaceProductUnitPrices);
  const addCategory = useDataStore((state) => state.addCategory);
  const updateCategory = useDataStore((state) => state.updateCategory);
  const deleteCategory = useDataStore((state) => state.deleteCategory);
  const brands = useDataStore((state) => state.brands);
  const addBrand = useDataStore((state) => state.addBrand);
  const updateBrand = useDataStore((state) => state.updateBrand);
  const deactivateBrand = useDataStore((state) => state.deactivateBrand);
  const addAuditLog = useDataStore((state) => state.addAuditLog);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<ProductCategory | "all">("all");
  // Brand sub-filter, scoped to the currently picked category. Reset to ""
  // (meaning "all brands in this category") whenever the category changes
  // — same contract as the POS finder so users get consistent behaviour.
  const [filterBrandId, setFilterBrandId] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");

  // Pagination state
  const [page, setPage] = useState(1);

  // Category modal state
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState<CategoryColor>("blue");
  const [newCategoryIconKey, setNewCategoryIconKey] = useState("");

  // Brand modal state. `targetCategoryId` carries the category the new brand
  // will belong to (locked when adding via a category card's + button).
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [newBrandName, setNewBrandName] = useState("");
  const [newBrandCategoryId, setNewBrandCategoryId] = useState<string>("");
  const [brandSaveError, setBrandSaveError] = useState<string | null>(null);
  // The "Brands" button on each category card opens this modal pointing
  // at the picked category. Null means the modal is closed. Replaced the
  // earlier inline expand-strip per UX request — a modal scales better
  // when a category has many brands and keeps the card grid stable.
  const [brandsListCategoryId, setBrandsListCategoryId] = useState<string | null>(null);

  // CSV import state. Selecting a file only builds this dry-run plan; rows
  // are written after the user reviews the preview and clicks Import.
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importPlan, setImportPlan] = useState<ProductCsvImportPlan | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Get active categories
  const activeCategories = useMemo(() => {
    return categories.filter((c) => c.isActive);
  }, [categories]);

  // Active brands feed the per-category brand counts and the inline brand
  // list on each Category card.
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

  const productCsvContext = useMemo(
    () => ({
      products,
      productUnits,
      barcodes,
      categories,
      brands,
      unitTypes,
      priceLevels,
      productUnitPrices,
    }),
    [
      products,
      productUnits,
      barcodes,
      categories,
      brands,
      unitTypes,
      priceLevels,
      productUnitPrices,
    ],
  );

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, filterCategory, filterBrandId, filterStatus]);

  // Drop the brand filter whenever the category changes — a brand selection
  // from "Whisky" should never silently constrain results in "Beers".
  useEffect(() => {
    setFilterBrandId("");
  }, [filterCategory]);

  // Brands that belong to the currently picked category. Empty means the
  // category has no brands configured yet OR "All Categories" is active;
  // the brand sub-bar then renders nothing (matches the POS rule).
  const filterBrandsForCategory = useMemo(() => {
    if (filterCategory === "all") return [] as Brand[];
    const cat = activeCategories.find((c) => c.name === filterCategory);
    if (!cat) return [] as Brand[];
    return brandsByCategory.get(cat.id) ?? [];
  }, [activeCategories, brandsByCategory, filterCategory]);

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch =
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        barcodes.some((b) => b.productId === product.id && b.value.includes(searchQuery));
      const matchesCategory = filterCategory === "all" || product.category === filterCategory;
      const matchesBrand = !filterBrandId || product.brandId === filterBrandId;
      const matchesStatus =
        filterStatus === "all" ||
        (filterStatus === "active" && product.isActive) ||
        (filterStatus === "inactive" && !product.isActive);
      return matchesSearch && matchesCategory && matchesBrand && matchesStatus;
    });
  }, [products, barcodes, searchQuery, filterCategory, filterBrandId, filterStatus]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const paginatedProducts = filteredProducts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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

  // Navigate to the dedicated Add/Edit Product page. The form lives at
  // /app/admin/products/new and /app/admin/products/:productId/edit so it
  // has the full viewport instead of being squeezed into a modal.
  const handleAddProduct = () => {
    navigate("/app/admin/products/new");
  };

  const handleEditProduct = (product: Product) => {
    navigate(`/app/admin/products/${product.id}/edit`);
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

  const handleExportProducts = () => {
    const headers = getProductCsvHeaders(priceLevels);
    const rows = buildProductCsvRows(productCsvContext);
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`products_${dateStamp}.csv`, rows, headers);
  };

  const resetImportState = () => {
    setImportModalOpen(false);
    setImportFileName("");
    setImportPlan(null);
    setImportError(null);
    setIsImporting(false);
  };

  const handleProductCsvSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    setImportFileName(file.name);
    setImportError(null);
    setImportPlan(null);
    setImportModalOpen(true);

    try {
      const text = await file.text();
      const records = parseCsvRecords(text);
      if (records.length === 0) {
        setImportError("The CSV file has no product rows.");
        return;
      }
      setImportPlan(buildProductCsvImportPlan(records, productCsvContext));
    } catch (error) {
      setImportError(getErrorMessage(error) || "Could not read the CSV file.");
    }
  };

  const handleApplyProductImport = async () => {
    if (!importPlan || importPlan.errorCount > 0 || importPlan.items.length === 0) return;

    setIsImporting(true);
    setImportError(null);
    try {
      for (const item of importPlan.items) {
        if (item.action === "update") {
          await updateProduct(item.product, item.barcodes);
        } else {
          await addProduct(item.product, item.barcodes);
        }
        await replaceProductUnits(item.product.id, item.productUnits);
        for (const priceGroup of item.unitPriceRows) {
          await replaceProductUnitPrices(priceGroup.productUnitId, priceGroup.prices);
        }
      }

      void addAuditLog({
        id: `audit-${Math.random().toString(36).slice(2, 9)}`,
        actorId: currentUserId ?? "system",
        actionType: "PRODUCT_IMPORT",
        message: `Imported ${importPlan.items.length} product(s) from ${importFileName || "CSV"}.`,
        entityType: "Product",
        entityId: "bulk-import",
        createdAt: new Date().toISOString(),
      });
      alert(`Imported ${importPlan.items.length} product(s).`);
      resetImportState();
    } catch (error) {
      setImportError(getErrorMessage(error) || "Product import failed.");
    } finally {
      setIsImporting(false);
    }
  };

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

  // ============================================================
  // Brand management
  // ============================================================

  const openBrandModalForNew = (categoryId: string) => {
    setEditingBrand(null);
    setNewBrandName("");
    setNewBrandCategoryId(categoryId);
    setBrandSaveError(null);
    // Close the list modal so the add/edit modal is the only popup on
    // screen. handleSaveBrand re-opens the list pointing at the same
    // category, so the user lands back where they started.
    setBrandsListCategoryId(null);
    setShowBrandModal(true);
  };

  const handleAddBrandToCategory = (categoryId: string) => {
    openBrandModalForNew(categoryId);
  };

  const handleEditBrand = (brand: Brand) => {
    setEditingBrand(brand);
    setNewBrandName(brand.name);
    setNewBrandCategoryId(brand.categoryId);
    setBrandSaveError(null);
    setBrandsListCategoryId(null);
    setShowBrandModal(true);
  };

  const handleSaveBrand = async () => {
    const trimmed = newBrandName.trim();
    if (!trimmed) {
      setBrandSaveError("Brand name is required.");
      return;
    }
    if (!newBrandCategoryId) {
      setBrandSaveError("Category is required.");
      return;
    }
    // Mirror category duplicate guard — case + whitespace insensitive,
    // scoped to the chosen category. The DB has the same unique index but
    // catching it here gives a friendlier message.
    const duplicate = activeBrands.find(
      (b) =>
        b.categoryId === newBrandCategoryId &&
        b.name.trim().toLowerCase() === trimmed.toLowerCase() &&
        b.id !== editingBrand?.id,
    );
    if (duplicate) {
      setBrandSaveError("A brand with this name already exists in this category.");
      return;
    }

    try {
      if (editingBrand) {
        await updateBrand({
          ...editingBrand,
          name: trimmed,
          categoryId: newBrandCategoryId,
          updatedAt: new Date().toISOString(),
        });
      } else {
        const now = new Date().toISOString();
        await addBrand({
          id: `brand-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          categoryId: newBrandCategoryId,
          name: trimmed,
          isActive: true,
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        });
      }
      // Capture target before resetting state so the user lands on the
      // affected category's brand list right after creating a brand.
      const targetCategoryId = newBrandCategoryId;
      setShowBrandModal(false);
      setEditingBrand(null);
      setNewBrandName("");
      setNewBrandCategoryId("");
      // Re-open the brands list pointing at the affected category so the
      // newly created brand is visible without a second click.
      setBrandsListCategoryId(targetCategoryId);
    } catch (error) {
      setBrandSaveError(getErrorMessage(error) || "Could not save the brand.");
    }
  };

  const handleDeactivateBrand = async (brand: Brand) => {
    if (!confirm(`Deactivate "${brand.name}"? It will be hidden from new products.`)) return;
    try {
      await deactivateBrand(brand.id);
    } catch (error) {
      alert(getErrorMessage(error) || "Could not deactivate the brand.");
    }
  };

  return (
    <Card>
      <input
        ref={importFileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(event) => void handleProductCsvSelected(event)}
      />
      <PageHeader
        title="Product Management"
        subtitle="Products are a shared catalog; the Stock column shows on-hand units for the selected shop only."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={handleExportProducts}>
              <span className="material-symbols-rounded mr-1 text-sm">download</span>
              Export CSV
            </Button>
            {canCreateProducts && (
              <Button
                variant="secondary"
                onClick={() => importFileInputRef.current?.click()}
              >
                <span className="material-symbols-rounded mr-1 text-sm">upload</span>
                Import CSV
              </Button>
            )}
            {canCreateProducts && (
              <Button onClick={handleAddProduct}>
                <span className="material-symbols-rounded mr-1 text-sm">add</span>
                Add Product
              </Button>
            )}
          </div>
        }
      />

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search by name, SKU, or barcode..."
          className="min-w-64 flex-1 md:w-96 md:flex-none"
        />
        <Select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as "all" | "active" | "inactive")}
          className="min-w-44 flex-1 md:w-auto md:flex-none"
        >
          <option value="all">All Status</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
        </Select>
      </div>

      {/* Category filter — shared icon-chip filter (no native dropdown) */}
      <CategoryFilter
        className="mt-3"
        categories={categories}
        selectedCategory={filterCategory}
        onChange={(value) => setFilterCategory(value as ProductCategory | "all")}
      />

      {/* Brand sub-filter — appears only when a specific category with at
          least one brand is selected. Mirrors the POS finder so the two
          surfaces behave identically. "All Categories" hides it by design. */}
      {filterBrandsForCategory.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Brand
          </span>
          <button
            type="button"
            onClick={() => setFilterBrandId("")}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filterBrandId === ""
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All
          </button>
          <select
            value={filterBrandId}
            onChange={(event) => setFilterBrandId(event.target.value)}
            className="min-h-9 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Select a brand…</option>
            {filterBrandsForCategory.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
          {filterBrandId && (
            <Badge tone="green">
              {filterBrandsForCategory.find((b) => b.id === filterBrandId)?.name ?? "Brand"}
            </Badge>
          )}
        </div>
      )}

      {/* Products Table */}
      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200/70">
        <Table className="min-w-[980px]">
          <THead>
            <TR>
              <TH>Product</TH>
              <TH>Category</TH>
              <TH className="text-right">Price</TH>
              <TH className="text-right">Cost</TH>
              <TH className="text-right">GP %</TH>
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
                <TD colSpan={8} className="py-8 text-center text-slate-500">
                  No products found
                </TD>
              </TR>
            ) : (
              paginatedProducts.map((product) => {
                const stock = getProductStock(product.id);
                const isLowStock = stock <= product.lowStockThreshold;
                const productBarcodes = barcodes.filter((b) => b.productId === product.id);
                // Gross profit % on the default (POS) unit: (price - cost) / price.
                // `-` when either price is 0 or cost is missing — avoids surfacing
                // a misleading "100%" for products without a cost recorded.
                const gpPct =
                  product.priceMmk > 0 && product.costMmk && product.costMmk > 0
                    ? ((product.priceMmk - product.costMmk) / product.priceMmk) * 100
                    : null;

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
                      {gpPct === null ? (
                        <span className="text-slate-400">-</span>
                      ) : (
                        <span
                          className={
                            gpPct < 0
                              ? "font-medium text-rose-600"
                              : gpPct < 10
                                ? "text-amber-600"
                                : "text-slate-700"
                          }
                        >
                          {gpPct.toFixed(1)}%
                        </span>
                      )}
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
                        {canDeleteProducts && (
                          <Button variant="ghost" size="sm" onClick={() => void handleDeleteProduct(product)}>
                            <span className="material-symbols-rounded text-sm text-red-500">delete</span>
                          </Button>
                        )}
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
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-slate-500">
          Showing {filteredProducts.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}-
          {Math.min(page * PAGE_SIZE, filteredProducts.length)} of {filteredProducts.length} products
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
          {canCreateProducts && (
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
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {activeCategories.map((category) => {
            const productCount = products.filter((p) => p.category === category.name).length;
            const icon = resolveCategoryIcon(category.iconKey, category.name);
            const brandsHere = brandsByCategory.get(category.id) ?? [];
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
                      <p className="text-xs text-slate-500">
                        {productCount} product(s) · {brandsHere.length} brand(s)
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 gap-1">
                    {canCreateProducts && (
                      <button
                        type="button"
                        onClick={() => handleEditCategory(category)}
                        className="rounded p-1 text-slate-500 hover:bg-slate-100"
                        title="Edit"
                      >
                        <span className="material-symbols-rounded text-sm">edit</span>
                      </button>
                    )}
                    {canCreateProducts && (
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(category)}
                        className="rounded p-1 text-slate-500 hover:bg-slate-100"
                        title="Delete"
                      >
                        <span className="material-symbols-rounded text-sm">delete</span>
                      </button>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setBrandsListCategoryId(category.id)}
                  className="mt-3 flex w-full items-center justify-between rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  <span>Brands ({brandsHere.length})</span>
                  <span className="material-symbols-rounded text-sm">open_in_new</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>


      {/* Product CSV Import Modal */}
      <Modal
        open={importModalOpen}
        onClose={() => {
          if (!isImporting) resetImportState();
        }}
        title="Import Products CSV"
        description="Review the dry-run result before writing products."
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={resetImportState} disabled={isImporting}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleApplyProductImport()}
              disabled={
                isImporting ||
                !importPlan ||
                importPlan.errorCount > 0 ||
                importPlan.items.length === 0
              }
            >
              {isImporting ? "Importing..." : "Import Products"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium text-slate-800">
                {importFileName || "No file selected"}
              </div>
              <p className="text-xs text-slate-500">
                Export CSV first to get the supported product columns and active price-level columns.
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => importFileInputRef.current?.click()}
              disabled={isImporting}
            >
              Choose CSV
            </Button>
          </div>

          {importError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {importError}
            </div>
          )}

          {importPlan && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <div className="text-xs uppercase text-slate-500">Valid Rows</div>
                  <div className="text-lg font-semibold text-slate-800">{importPlan.items.length}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <div className="text-xs uppercase text-slate-500">Create</div>
                  <div className="text-lg font-semibold text-emerald-700">{importPlan.createCount}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <div className="text-xs uppercase text-slate-500">Update</div>
                  <div className="text-lg font-semibold text-blue-700">{importPlan.updateCount}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <div className="text-xs uppercase text-slate-500">Errors</div>
                  <div className="text-lg font-semibold text-rose-700">{importPlan.errorCount}</div>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="max-h-96 overflow-auto">
                  <Table className="min-w-[720px]">
                    <THead>
                      <TR>
                        <TH>Row</TH>
                        <TH>Status</TH>
                        <TH>SKU</TH>
                        <TH>Name</TH>
                        <TH>Details</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {importPlan.previewRows.slice(0, 50).map((row) => {
                        const hasErrors = row.errors.length > 0;
                        const hasWarnings = row.warnings.length > 0;
                        return (
                          <TR key={row.rowNumber}>
                            <TD>{row.rowNumber}</TD>
                            <TD>
                              <Badge tone={hasErrors ? "red" : hasWarnings ? "amber" : "green"}>
                                {hasErrors ? "Error" : row.action}
                              </Badge>
                            </TD>
                            <TD className="font-mono text-xs">{row.sku || "-"}</TD>
                            <TD>{row.name || "-"}</TD>
                            <TD className="min-w-[260px] text-sm">
                              {hasErrors ? (
                                <span className="text-rose-700">{row.errors.join(" ")}</span>
                              ) : hasWarnings ? (
                                <span className="text-amber-700">{row.warnings.join(" ")}</span>
                              ) : (
                                <span className="text-slate-500">Ready</span>
                              )}
                            </TD>
                          </TR>
                        );
                      })}
                    </TBody>
                  </Table>
                </div>
              </div>
              {importPlan.previewRows.length > 50 && (
                <p className="text-xs text-slate-500">
                  Showing first 50 rows of {importPlan.previewRows.length}. Fix any errors, then choose the file again.
                </p>
              )}
            </>
          )}

          {!importPlan && !importError && (
            <p className="text-sm text-slate-500">Reading CSV...</p>
          )}
        </div>
      </Modal>

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
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {CATEGORY_ICONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  title={opt.label}
                  onClick={() => setNewCategoryIconKey(opt.key)}
                  className={`flex min-h-11 items-center justify-center rounded-lg border p-2 transition-colors ${
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
            {/* Compute which colors are already paired with the
                currently-picked icon by another active category. Same
                icon + same color is blocked at submit time too — this
                just surfaces the constraint up-front so users don't
                pick a swatch only to get rejected. */}
            {(() => {
              const effectiveIconKey = resolveCategoryIcon(
                newCategoryIconKey || null,
                newCategoryName,
              ).key;
              const usedColorsForIcon = new Set<CategoryColor>(
                categories
                  .filter((c) => c.isActive && c.id !== editingCategory?.id)
                  .filter(
                    (c) =>
                      resolveCategoryIcon(c.iconKey ?? null, c.name).key === effectiveIconKey,
                  )
                  .map((c) => c.color),
              );
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
                <>
                  <div className="flex flex-wrap gap-2">
                    {(["amber", "orange", "yellow", "red", "pink", "green", "teal", "cyan", "blue", "indigo", "purple", "slate"] as CategoryColor[]).map((color) => {
                      const taken = usedColorsForIcon.has(color);
                      const selected = newCategoryColor === color;
                      return (
                        <button
                          key={color}
                          type="button"
                          disabled={taken && !selected}
                          onClick={() => setNewCategoryColor(color)}
                          title={taken ? "Already used with this icon by another category" : undefined}
                          className={`flex h-8 w-8 items-center justify-center rounded-full ${colorStyles[color]} transition-transform ${
                            selected
                              ? "scale-110 ring-2 ring-offset-2"
                              : taken
                                ? "opacity-30 grayscale cursor-not-allowed"
                                : "hover:scale-105"
                          }`}
                        >
                          {selected && (
                            <span className="material-symbols-rounded text-sm text-white">check</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {usedColorsForIcon.size > 0 && (
                    <p className="mt-2 text-xs text-slate-500">
                      Greyed swatches are already paired with this icon by another category.
                      Pick a different colour, or change the icon.
                    </p>
                  )}
                </>
              );
            })()}
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-2">
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

      {/* Brand Modal */}
      <Modal
        open={showBrandModal}
        onClose={() => {
          setShowBrandModal(false);
          setEditingBrand(null);
          setNewBrandName("");
          setNewBrandCategoryId("");
          setBrandSaveError(null);
        }}
        title={editingBrand ? "Edit Brand" : "Add New Brand"}
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Category *</label>
            <Select
              value={newBrandCategoryId}
              onChange={(e) => setNewBrandCategoryId(e.target.value)}
              disabled={!!editingBrand}
            >
              <option value="">Select a category…</option>
              {activeCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name.charAt(0).toUpperCase() + cat.name.slice(1)}
                </option>
              ))}
            </Select>
            {editingBrand && (
              <p className="mt-1 text-xs text-slate-500">
                Category cannot be changed while editing. Deactivate this brand and create a new one under the target category instead.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Brand Name *</label>
            <Input
              placeholder="e.g. Grand Royal, Royal Club"
              value={newBrandName}
              onChange={(e) => setNewBrandName(e.target.value)}
              autoFocus
            />
          </div>

          {brandSaveError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {brandSaveError}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setShowBrandModal(false);
                setEditingBrand(null);
                setNewBrandName("");
                setNewBrandCategoryId("");
                setBrandSaveError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleSaveBrand()}
              disabled={!newBrandName.trim() || !newBrandCategoryId}
            >
              {editingBrand ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Brands list modal — opens from each category card's "Brands"
          button. Lists every brand under that one category, with the
          same Edit / Deactivate / Add Brand affordances the inline
          panel used to have. */}
      {(() => {
        const activeCategory = brandsListCategoryId
          ? activeCategories.find((c) => c.id === brandsListCategoryId) ?? null
          : null;
        const brandsForList = activeCategory
          ? brandsByCategory.get(activeCategory.id) ?? []
          : [];
        return (
          <Modal
            open={Boolean(brandsListCategoryId)}
            onClose={() => setBrandsListCategoryId(null)}
            title={activeCategory ? `Brands in ${activeCategory.name}` : "Brands"}
            description="Manage the brands grouped under this category."
          >
            <div className="space-y-3">
              {brandsForList.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-sm italic text-slate-500">
                  No brands yet. Add the first one below.
                </p>
              ) : (
                <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
                  {brandsForList.map((brand) => {
                    const brandProductCount = products.filter(
                      (p) => p.brandId === brand.id,
                    ).length;
                    return (
                      <div
                        key={brand.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-800">
                            {brand.name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {brandProductCount} product(s)
                          </div>
                        </div>
                        {canCreateProducts && (
                          <div className="flex flex-shrink-0 gap-1">
                            <button
                              type="button"
                              onClick={() => handleEditBrand(brand)}
                              className="rounded p-1 text-slate-500 hover:bg-slate-100"
                              title="Edit brand"
                            >
                              <span className="material-symbols-rounded text-sm">edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeactivateBrand(brand)}
                              className="rounded p-1 text-slate-500 hover:bg-slate-100"
                              title="Deactivate brand"
                            >
                              <span className="material-symbols-rounded text-sm">delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-col gap-2 border-t border-slate-200 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  variant="secondary"
                  onClick={() => setBrandsListCategoryId(null)}
                >
                  Close
                </Button>
                {canCreateProducts && (
                  <Button
                    onClick={() => {
                      if (activeCategory) handleAddBrandToCategory(activeCategory.id);
                    }}
                    disabled={!activeCategory}
                  >
                    <span className="material-symbols-rounded mr-1 text-sm">add</span>
                    Add Brand
                  </Button>
                )}
              </div>
            </div>
          </Modal>
        );
      })()}
    </Card>
  );
};
