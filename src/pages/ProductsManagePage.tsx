import { useMemo, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuthStore } from "../stores/authStore";
import { useDataStore } from "../stores/dataStore";
import type { ProductBarcode, ProductCategory, Category } from "../types";
import { PageHeader } from "../components/layout/PageHeader";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { formatMmk } from "../lib/utils";

type UnitType = "piece" | "box" | "kg" | "liter" | "pack";
type CategoryColor = "amber" | "red" | "green" | "blue" | "purple" | "slate";

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
  isActive: boolean;
  barcodes: { value: string; type: "EAN13" | "CODE128" | "QR" }[];
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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<ProductCategory | "all">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");

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
      isActive: z.boolean(),
      barcodes: z
        .array(
          z.object({
            value: z.string().min(3, "Barcode must be at least 3 characters"),
            type: z.enum(["EAN13", "CODE128", "QR"]),
          })
        )
        .min(1, "At least one barcode is required")
        .superRefine((items, ctx) => {
          const values = items.map((item) => item.value);
          const uniqueValues = new Set(values);
          if (uniqueValues.size !== values.length) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate barcode values in form." });
          }
        }),
    });
  }, [activeCategories]);

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
      // Update existing
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
      // Create new
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
    // Check if any products use this category
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

  const getCategoryColor = (categoryName: string): CategoryColor => {
    const cat = categories.find((c) => c.name === categoryName);
    return cat?.color ?? "slate";
  };

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
      isActive: true,
      barcodes: [{ value: "", type: "EAN13" }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "barcodes" });

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch =
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        barcodes.some(b => b.productId === product.id && b.value.includes(searchQuery));
      const matchesCategory = filterCategory === "all" || product.category === filterCategory;
      const matchesStatus =
        filterStatus === "all" ||
        (filterStatus === "active" && product.isActive) ||
        (filterStatus === "inactive" && !product.isActive);
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [products, barcodes, searchQuery, filterCategory, filterStatus]);

  // Get total stock for a product across all shops
  const getProductStock = (productId: string) => {
    return inventory
      .filter((inv) => inv.productId === productId)
      .reduce((sum, inv) => sum + (inv.qtyBaseUnits || 0), 0);
  };

  const handleEdit = (id: string) => {
    const product = products.find((item) => item.id === id);
    if (!product) return;
    const productBarcodes = barcodes.filter((barcode) => barcode.productId === id);
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
      isActive: product.isActive,
      barcodes: productBarcodes.length > 0
        ? productBarcodes.map((barcode) => ({ value: barcode.value, type: barcode.type }))
        : [{ value: "", type: "EAN13" }],
    });
    setEditingId(id);
  };

  const handleDelete = (id: string) => {
    const product = products.find((p) => p.id === id);
    if (!product) return;

    // Soft delete - just mark as inactive
    const updatedProduct = { ...product, isActive: false };
    const productBarcodes = barcodes.filter((b) => b.productId === id);
    updateProduct(updatedProduct, productBarcodes);

    addAuditLog({
      id: `audit-${Math.random().toString(36).slice(2, 9)}`,
      actorId: currentUserId ?? "system",
      actionType: "PRODUCT_DELETE",
      message: `Deactivated product ${product.name}.`,
      entityType: "Product",
      entityId: id,
      createdAt: new Date().toISOString(),
    });
  };

  const handleSubmit = form.handleSubmit((values) => {
    const existingValues = barcodes
      .filter((barcode) => barcode.productId !== editingId)
      .map((barcode) => barcode.value);
    if (values.barcodes.some((barcode) => existingValues.includes(barcode.value))) {
      form.setError("barcodes", { message: "Barcode already exists in another product." });
      return;
    }

    // Check for duplicate SKU
    const existingSku = products.find(
      (p) => p.sku === values.sku && p.id !== editingId
    );
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
      isActive: values.isActive,
      createdAt: existingProduct?.createdAt ?? new Date().toISOString(),
    };

    const barcodeEntries: ProductBarcode[] = values.barcodes.map((barcode) => ({
      id: `bc-${Math.random().toString(36).slice(2, 8)}`,
      productId,
      value: barcode.value,
      type: barcode.type,
    }));

    if (editingId) updateProduct(product, barcodeEntries);
    else addProduct(product, barcodeEntries);

    addAuditLog({
      id: `audit-${Math.random().toString(36).slice(2, 9)}`,
      actorId: currentUserId ?? "system",
      actionType: editingId ? "PRODUCT_EDIT" : "PRODUCT_CREATE",
      message: `${editingId ? "Updated" : "Created"} product ${values.name}.`,
      entityType: "Product",
      entityId: productId,
      createdAt: new Date().toISOString(),
    });

    form.reset();
    setEditingId(null);
  });

  const generateSku = () => {
    const category = form.watch("category");
    const prefix = category.substring(0, 3).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    form.setValue("sku", `${prefix}-${random}`);
  };

  return (
    <Card>
      <PageHeader title="Product Management" subtitle="Create or edit product catalog." />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* SKU */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">SKU *</label>
            <div className="flex gap-2">
              <Input placeholder="e.g. BEE-001" {...form.register("sku")} className="flex-1" />
              <Button type="button" variant="secondary" onClick={generateSku}>
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

          {/* Category & Unit Type */}
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-sm font-medium text-slate-700">Category *</label>
                <button
                  type="button"
                  onClick={() => {
                    setEditingCategory(null);
                    setNewCategoryName("");
                    setNewCategoryColor("blue");
                    setShowCategoryModal(true);
                  }}
                  className="text-xs text-blue-600 hover:text-blue-700 hover:underline"
                >
                  + Add New
                </button>
              </div>
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
              <Input type="number" placeholder="e.g. 24 for a case" {...form.register("packSize", { valueAsNumber: true })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Low Stock Threshold *</label>
              <Input type="number" placeholder="10" {...form.register("lowStockThreshold", { valueAsNumber: true })} />
            </div>
          </div>

          {/* Expiry Date */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Expiry Date (Optional)</label>
            <Input type="date" {...form.register("expiryDate")} />
          </div>

          {/* Active Toggle */}
          <div className="flex items-center gap-3">
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                {...form.register("isActive")}
              />
              <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-2 peer-focus:ring-emerald-300"></div>
            </label>
            <span className="text-sm font-medium text-slate-700">
              {form.watch("isActive") ? "Active" : "Inactive"}
            </span>
          </div>

          {/* Barcodes */}
          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/60 p-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Barcodes *</div>
              <Button type="button" variant="secondary" size="sm" onClick={() => append({ value: "", type: "EAN13" })}>
                Add barcode
              </Button>
            </div>
            <div className="mt-3 space-y-3">
              {fields.map((field, index) => (
                <div key={field.id} className="flex gap-2">
                  <Input placeholder="Barcode value" {...form.register(`barcodes.${index}.value` as const)} className="flex-1" />
                  <Select {...form.register(`barcodes.${index}.type` as const)} className="w-28">
                    <option value="EAN13">EAN13</option>
                    <option value="CODE128">CODE128</option>
                    <option value="QR">QR</option>
                  </Select>
                  {fields.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)}>
                      <span className="material-symbols-rounded text-red-500">delete</span>
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {form.formState.errors.barcodes?.message && (
              <div className="mt-2 text-xs text-red-500">{form.formState.errors.barcodes.message}</div>
            )}
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-2 pt-2">
            <Button type="submit">{editingId ? "Update Product" : "Create Product"}</Button>
            {editingId && (
              <Button type="button" variant="secondary" onClick={() => { form.reset(); setEditingId(null); }}>
                Cancel
              </Button>
            )}
          </div>
        </form>

        {/* Product List */}
        <div className="space-y-4">
          {/* Search & Filters */}
          <div className="space-y-3">
            <Input
              placeholder="Search by name, SKU, or barcode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="flex gap-2">
              <Select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value as ProductCategory | "all")}
                className="flex-1"
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
                className="flex-1"
              >
                <option value="all">All Status</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </Select>
            </div>
          </div>

          {/* Products Count */}
          <div className="text-sm text-slate-500">
            Showing {filteredProducts.length} of {products.length} products
          </div>

          {/* Product Cards */}
          <div className="max-h-[600px] space-y-3 overflow-y-auto pr-1">
            {filteredProducts.length === 0 ? (
              <div className="rounded-xl bg-slate-50 p-8 text-center text-slate-500">
                No products found
              </div>
            ) : (
              filteredProducts.map((product) => {
                const productBarcodes = barcodes.filter((b) => b.productId === product.id);
                const stock = getProductStock(product.id);
                const profit = product.costMmk ? product.priceMmk - product.costMmk : null;
                const margin = product.costMmk && product.priceMmk > 0
                  ? ((profit! / product.priceMmk) * 100).toFixed(0)
                  : null;

                return (
                  <div
                    key={product.id}
                    className={`rounded-2xl border p-4 transition-all hover:shadow-md ${
                      product.isActive
                        ? "border-slate-200/70 bg-white"
                        : "border-slate-200 bg-slate-50 opacity-60"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800">{product.name}</span>
                          {!product.isActive && (
                            <Badge tone="slate">Inactive</Badge>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          {product.sku && <span className="font-mono">{product.sku}</span>}
                          <span>|</span>
                          <Badge tone={getCategoryColor(product.category)}>
                            {product.category}
                          </Badge>
                          <span>|</span>
                          <span>{product.unitType}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-emerald-600">{formatMmk(product.priceMmk)}</div>
                        {product.costMmk && (
                          <div className="text-xs text-slate-500">
                            Cost: {formatMmk(product.costMmk)}
                            {margin && <span className="ml-1 text-emerald-600">({margin}%)</span>}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Stock & Details Row */}
                    <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-xs">
                      <div className="flex items-center gap-1">
                        <span className="material-symbols-rounded text-sm text-slate-400">inventory_2</span>
                        <span className={stock <= product.lowStockThreshold ? "font-medium text-amber-600" : "text-slate-600"}>
                          Stock: {stock} {product.unitType}
                        </span>
                        {stock <= product.lowStockThreshold && (
                          <span className="text-amber-500">(Low)</span>
                        )}
                      </div>
                      {product.packSize && (
                        <div className="text-slate-500">
                          Pack: {product.packSize}
                        </div>
                      )}
                      {product.expiryDate && (
                        <div className="flex items-center gap-1 text-slate-500">
                          <span className="material-symbols-rounded text-sm">event</span>
                          Exp: {new Date(product.expiryDate).toLocaleDateString()}
                        </div>
                      )}
                    </div>

                    {/* Barcodes */}
                    {productBarcodes.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {productBarcodes.map((bc) => (
                          <span key={bc.id} className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
                            {bc.value}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="mt-3 flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => handleEdit(product.id)}>
                        <span className="material-symbols-rounded mr-1 text-sm">edit</span>
                        Edit
                      </Button>
                      {product.isActive && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm(`Are you sure you want to deactivate "${product.name}"?`)) {
                              handleDelete(product.id);
                            }
                          }}
                        >
                          <span className="material-symbols-rounded mr-1 text-sm text-red-500">delete</span>
                          <span className="text-red-500">Deactivate</span>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Category Management Section */}
      <div className="mt-8 border-t border-slate-200 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Category Management</h3>
            <p className="text-sm text-slate-500">Manage product categories for your inventory.</p>
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
            };

            return (
              <div
                key={category.id}
                className={`rounded-xl border p-4 ${colorClasses[category.color]}`}
              >
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
              {(["amber", "red", "green", "blue", "purple", "slate"] as CategoryColor[]).map((color) => {
                const colorStyles: Record<CategoryColor, string> = {
                  amber: "bg-amber-500",
                  red: "bg-red-500",
                  green: "bg-green-500",
                  blue: "bg-blue-500",
                  purple: "bg-purple-500",
                  slate: "bg-slate-500",
                };
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewCategoryColor(color)}
                    className={`h-8 w-8 rounded-full ${colorStyles[color]} flex items-center justify-center transition-transform ${
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
