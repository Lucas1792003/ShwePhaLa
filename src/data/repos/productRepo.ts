import type { Product } from "../../types";
import { readDb, writeDb } from "../db";

export const listProducts = () => readDb().products;

export const addProduct = (product: Product) => {
  const db = readDb();
  writeDb({ ...db, products: [...db.products, product] });
};

export const updateProduct = (product: Product) => {
  const db = readDb();
  writeDb({ ...db, products: db.products.map((item) => (item.id === product.id ? product : item)) });
};
