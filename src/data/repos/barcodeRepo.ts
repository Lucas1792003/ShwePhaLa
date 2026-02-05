import type { Product, ProductBarcode } from "../../types";
import { readDb, writeDb } from "../db";

export const listBarcodes = () => readDb().barcodes;

export const addBarcodes = (barcodes: ProductBarcode[]) => {
  const db = readDb();
  writeDb({ ...db, barcodes: [...db.barcodes, ...barcodes] });
};

export const replaceBarcodesForProduct = (productId: string, barcodes: ProductBarcode[]) => {
  const db = readDb();
  writeDb({
    ...db,
    barcodes: db.barcodes.filter((item) => item.productId !== productId).concat(barcodes),
  });
};

export const findProductByBarcode = (value: string): Product | undefined => {
  const db = readDb();
  const barcode = db.barcodes.find((item) => item.value === value.trim());
  return db.products.find((item) => item.id === barcode?.productId);
};
