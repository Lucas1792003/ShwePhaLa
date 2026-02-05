import type { Sale, SaleItem } from "../../types";
import { readDb, writeDb } from "../db";

export const listSales = () => readDb().sales;

export const listSaleItems = () => readDb().saleItems;

export const addSale = (sale: Sale, items: SaleItem[]) => {
  const db = readDb();
  writeDb({
    ...db,
    sales: [sale, ...db.sales],
    saleItems: [...items, ...db.saleItems],
  });
};
