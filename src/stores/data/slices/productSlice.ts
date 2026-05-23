import type { StateCreator } from "zustand";
import type { DataState, ProductState } from "../types";
import type { Product, ProductBarcode } from "../../../types";
import { supabase, dbWrite } from "../../../lib/supabase";
import { findProductForScan } from "../../../features/pos/barcodeLookup";

export const createProductSlice: StateCreator<DataState, [], [], ProductState> = (set, get) => ({
  products: [],
  barcodes: [],

  addProduct: (product: Product, barcodes: ProductBarcode[]) => {
    set((state) => ({
      products: [...state.products, product],
      barcodes: [...state.barcodes, ...barcodes],
    }));
    dbWrite(supabase.from("products").insert({
      id: product.id, sku: product.sku, name: product.name, category: product.category,
      unit_type: product.unitType, price_mmk: product.priceMmk, cost_mmk: product.costMmk,
      pack_size: product.packSize, low_stock_threshold: product.lowStockThreshold,
      expiry_date: product.expiryDate, image_url: product.imageUrl,
      is_active: product.isActive, created_at: product.createdAt,
    }), "addProduct");
    if (barcodes.length > 0) {
      dbWrite(supabase.from("product_barcodes").insert(
        barcodes.map((b) => ({ id: b.id, product_id: b.productId, value: b.value, type: b.type }))
      ), "addProduct barcodes");
    }
  },

  updateProduct: (product: Product, barcodes: ProductBarcode[]) => {
    set((state) => ({
      products: state.products.map((item) => (item.id === product.id ? product : item)),
      barcodes: state.barcodes.filter((item) => item.productId !== product.id).concat(barcodes),
    }));
    dbWrite(supabase.from("products").update({
      sku: product.sku, name: product.name, category: product.category,
      unit_type: product.unitType, price_mmk: product.priceMmk, cost_mmk: product.costMmk,
      pack_size: product.packSize, low_stock_threshold: product.lowStockThreshold,
      expiry_date: product.expiryDate, image_url: product.imageUrl, is_active: product.isActive,
    }).eq("id", product.id), "updateProduct");
    dbWrite(supabase.from("product_barcodes").delete().eq("product_id", product.id), "updateProduct delete barcodes");
    if (barcodes.length > 0) {
      dbWrite(supabase.from("product_barcodes").insert(
        barcodes.map((b) => ({ id: b.id, product_id: b.productId, value: b.value, type: b.type }))
      ), "updateProduct barcodes");
    }
  },

  getProductByBarcode: (value: string) => {
    const state = get();
    return findProductForScan(value, state.products, state.barcodes);
  },
});
