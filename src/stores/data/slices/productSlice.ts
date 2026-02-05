import type { StateCreator } from "zustand";
import type { DataState, ProductState } from "../types";
import type { Product, ProductBarcode } from "../../../types";

export const createProductSlice: StateCreator<DataState, [], [], ProductState> = (set, get) => ({
  products: [],
  barcodes: [],

  addProduct: (product: Product, barcodes: ProductBarcode[]) =>
    set((state) => ({
      products: [...state.products, product],
      barcodes: [...state.barcodes, ...barcodes],
    })),

  updateProduct: (product: Product, barcodes: ProductBarcode[]) =>
    set((state) => ({
      products: state.products.map((item) => (item.id === product.id ? product : item)),
      barcodes: state.barcodes.filter((item) => item.productId !== product.id).concat(barcodes),
    })),

  getProductByBarcode: (value: string) => {
    const state = get();
    const barcode = state.barcodes.find((item) => item.value === value.trim());
    return state.products.find((item) => item.id === barcode?.productId);
  },
});
