import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuthStore } from "../stores/authStore";
import { useDataStore } from "../stores/dataStore";
import type { ProductCategory, Category, Product } from "../types";
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

type UnitType = "piece" | "box" | "kg" | "liter" | "pack";
type CategoryColor = "amber" | "red" | "green" | "blue" | "purple" | "slate" | "pink" | "teal" | "indigo" | "yellow" | "orange" | "cyan";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

interface FormValues {
  id?: string;
  sku: string;
  name: string;
  category: ProductCategory;
  unitType: UnitType;
  priceMmk: number;
  costMmk?: number;
  packSize?: number;
  lowStockThreshold: number;
  expiryDate?: string;
  imageUrl?: string;
  isActive: boolean;
}

export const ProductsManagePage = () => {
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const products = useDataStore((state) => state.products);
  const barcodes = useDataStore((state) => state.barcodes);
  const inventory = useDataStore((state) => state.inventory);
  const categories = useDataStore((state) => state.categories);
  const addProduct = useDataStore((state) => state.addProduct);
  const updateProduct = useDataStore((state) => state.updateProduct);
  const addCategory = useDataStore((state) => state.addCategory);
  const updateCategory = useDataStore((state) => state.updateCategory);
  const addAuditLog = useDataStore((state) => state.addAuditLog);

  // Product modal state
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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

  // Get active categories
  const activeCategories = useMemo(() => {
    return categories.filter((c) => c.isActive);
  }, [categories]);

  const schema = useMemo(() => {
    return z.object({
      sku: z.string().min(1, "SKU is required"),
      name: z.string().min(2, "Name must be at least 2 characters"),
      category: z.string().min(1, "Category is required"),
      unitType: z.enum(["piece", "box", "kg", "liter", "pack"]),
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
      unitType: "piece",
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

  // Get total stock for a product across all shops
  const getProductStock = (productId: string) => {
    return inventory
      .filter((inv) => inv.productId === productId)
      .reduce((sum, inv) => sum + (inv.qtyBaseUnits || 0), 0);
  };

  const getCategoryColor = (categoryName: string): CategoryColor => {
    const cat = categories.find((c) => c.name === categoryName);
    return cat?.color ?? "slate";
  };

  // Open modal for adding new product
  const handleAddProduct = () => {
    form.reset({
      sku: "",
      name: "",
      category: activeCategories[0]?.name ?? "",
      unitType: "piece",
      priceMmk: 0,
      costMmk: undefined,
      packSize: undefined,
      lowStockThreshold: 10,
      expiryDate: undefined,
      imageUrl: undefined,
      isActive: true,
    });
    setEditingId(null);
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
    setShowProductModal(true);
  };

  const handleCloseProductModal = () => {
    setShowProductModal(false);
    setEditingId(null);
    form.reset();
  };

  const handleDeactivateProduct = (product: Product) => {
    if (!confirm(`Are you sure you want to deactivate "${product.name}"?`)) return;

    const updatedProduct = { ...product, isActive: false };
    updateProduct(updatedProduct, []);

    addAuditLog({
      id: `audit-${Math.random().toString(36).slice(2, 9)}`,
      actorId: currentUserId ?? "system",
      actionType: "PRODUCT_DELETE",
      message: `Deactivated product ${product.name}.`,
      entityType: "Product",
      entityId: product.id,
      createdAt: new Date().toISOString(),
    });
  };

  const handleSubmit = form.handleSubmit((values) => {
    // Check for duplicate SKU
    const existingSku = products.find((p) => p.sku === values.sku && p.id !== editingId);
    if (existingSku) {
      form.setError("sku", { message: "SKU already exists." });
      return;
    }

    const productId = editingId ?? `prod-${Date.now()}`;
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

    if (editingId) updateProduct(product, []);
    else addProduct(product, []);

    addAuditLog({
      id: `audit-${Math.random().toString(36).slice(2, 9)}`,
      actorId: currentUserId ?? "system",
      actionType: editingId ? "PRODUCT_EDIT" : "PRODUCT_CREATE",
      message: `${editingId ? "Updated" : "Created"} product ${values.name}.`,
      entityType: "Product",
      entityId: productId,
      createdAt: new Date().toISOString(),
    });

    handleCloseProductModal();
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

    if (editingCategory) {
      updateCategory({
        ...editingCategory,
        name: categoryName,
        color: newCategoryColor,
      });
      addAuditLog({
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
        isActive: true,
        createdAt: new Date().toISOString(),
      };
      addCategory(newCategory);
      addAuditLog({
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
  };

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category);
    setNewCategoryName(category.name);
    setNewCategoryColor(category.color);
    setShowCategoryModal(true);
  };

  const handleDeleteCategory = (category: Category) => {
    const productsUsingCategory = products.filter((p) => p.category === category.name);
    if (productsUsingCategory.length > 0) {
      alert(`Cannot delete category. ${productsUsingCategory.length} product(s) are using this category.`);
      return;
    }

    if (confirm(`Are you sure you want to delete "${category.name}"?`)) {
      updateCategory({ ...category, isActive: false });
      addAuditLog({
        id: `audit-${Math.random().toString(36).slice(2, 9)}`,
        actorId: currentUserId ?? "system",
        actionType: "CATEGORY_DELETE",
        message: `Deleted category "${category.name}".`,
        entityType: "Category",
        entityId: category.id,
        createdAt: new Date().toISOString(),
      });
    }
  };

  return (
    <Card>
      <PageHeader
        title="Product Management"
        subtitle="Manage your product catalog."
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
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value as ProductCategory | "all")}
        >
          <option value="all">All Categories</option>
          {activeCategories.map((cat) => (
            <option key={cat.id} value={cat.name}>
              {cat.name.charAt(0).toUpperCase() + cat.name.slice(1)}
            </option>
          ))}
        </Select>
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

      {/* Products Table */}
      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200/70">
        <Table>
          <THead>
            <TR>
              <TH>Product</TH>
              <TH>Category</TH>
              <TH className="text-right">Price</TH>
              <TH className="text-right">Cost</TH>
              <TH className="text-right">Stock</TH>
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
                        {product.isActive && (
                          <Button variant="ghost" size="sm" onClick={() => handleDeactivateProduct(product)}>
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
            const colorClasses: Record<CategoryColor, string> = {
              amber: "bg-amber-50 border-amber-200 text-amber-700",
              red: "bg-red-50 border-red-200 text-red-700",
              green: "bg-green-50 border-green-200 text-green-700",
              blue: "bg-blue-50 border-blue-200 text-blue-700",
              purple: "bg-purple-50 border-purple-200 text-purple-700",
              slate: "bg-slate-50 border-slate-200 text-slate-700",
              pink: "bg-pink-50 border-pink-200 text-pink-700",
              teal: "bg-teal-50 border-teal-200 text-teal-700",
              indigo: "bg-indigo-50 border-indigo-200 text-indigo-700",
              yellow: "bg-yellow-50 border-yellow-200 text-yellow-700",
              orange: "bg-orange-50 border-orange-200 text-orange-700",
              cyan: "bg-cyan-50 border-cyan-200 text-cyan-700",
            };

            return (
              <div key={category.id} className={`rounded-xl border p-4 ${colorClasses[category.color]}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-semibold capitalize">{category.name}</span>
                    <p className="text-xs opacity-75">{productCount} product(s)</p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleEditCategory(category)}
                      className="rounded p-1 hover:bg-white/50"
                      title="Edit"
                    >
                      <span className="material-symbols-rounded text-sm">edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(category)}
                      className="rounded p-1 hover:bg-white/50"
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
            <label className="mb-1 block text-sm font-medium text-slate-700">SKU *</label>
            <div className="flex gap-2">
              <Input placeholder="e.g. BEE-001" {...form.register("sku")} className="flex-1" />
              <Button type="button" variant="secondary" onClick={() => generateSku()}>
                Generate
              </Button>
            </div>
            {form.formState.errors.sku && (
              <p className="mt-1 text-xs text-red-500">{form.formState.errors.sku.message}</p>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Product Name *</label>
            <Input placeholder="e.g. Myanmar Lager Can" {...form.register("name")} />
            {form.formState.errors.name && (
              <p className="mt-1 text-xs text-red-500">{form.formState.errors.name.message}</p>
            )}
          </div>

          {/* Product Image */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Product Image</label>
            <div className="flex items-start gap-4">
              {/* Image Preview */}
              <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50">
                {form.watch("imageUrl") ? (
                  <>
                    <img
                      src={form.watch("imageUrl")}
                      alt="Product preview"
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => form.setValue("imageUrl", undefined)}
                      className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-md hover:bg-red-600"
                    >
                      <span className="material-symbols-rounded text-sm">close</span>
                    </button>
                  </>
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center text-slate-400">
                    <span className="material-symbols-rounded text-2xl">image</span>
                    <span className="text-xs">No image</span>
                  </div>
                )}
              </div>

              {/* Upload Button */}
              <div className="flex-1">
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">
                  <span className="material-symbols-rounded text-lg">upload</span>
                  Choose Image
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (file.size > 2 * 1024 * 1024) {
                          alert("Image size must be less than 2MB");
                          return;
                        }
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          form.setValue("imageUrl", reader.result as string);
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </label>
                <p className="mt-1 text-xs text-slate-500">PNG, JPG, or GIF. Max 2MB.</p>
              </div>
            </div>
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
              <Select {...form.register("unitType")}>
                <option value="piece">Piece</option>
                <option value="box">Box</option>
                <option value="kg">Kilogram (kg)</option>
                <option value="liter">Liter</option>
                <option value="pack">Pack</option>
              </Select>
            </div>
          </div>

          {/* Price & Cost */}
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Selling Price (MMK) *</label>
              <Input type="number" placeholder="0" {...form.register("priceMmk", { valueAsNumber: true })} />
              {form.formState.errors.priceMmk && (
                <p className="mt-1 text-xs text-red-500">{form.formState.errors.priceMmk.message}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Cost Price (MMK)</label>
              <Input type="number" placeholder="0" {...form.register("costMmk", { valueAsNumber: true })} />
            </div>
          </div>

          {/* Pack Size & Low Stock */}
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Pack Size</label>
              <Input
                type="number"
                placeholder="e.g. 24 for a case"
                {...form.register("packSize", { valueAsNumber: true })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Low Stock Threshold *</label>
              <Input
                type="number"
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

          {/* Submit Buttons */}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={handleCloseProductModal}>
              Cancel
            </Button>
            <Button type="submit">{editingId ? "Update Product" : "Create Product"}</Button>
          </div>
        </form>
      </Modal>

      {/* Category Modal */}
      <Modal
        open={showCategoryModal}
        onClose={() => {
          setShowCategoryModal(false);
          setEditingCategory(null);
          setNewCategoryName("");
          setNewCategoryColor("blue");
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
            <label className="mb-2 block text-sm font-medium text-slate-700">Color Theme</label>
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
