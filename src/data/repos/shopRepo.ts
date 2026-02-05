import type { Shop } from "../../types";
import { readDb, writeDb } from "../db";

export const listShops = () => readDb().shops;

export const addShop = (shop: Shop) => {
  const db = readDb();
  writeDb({ ...db, shops: [...db.shops, shop] });
};

export const updateShop = (shop: Shop) => {
  const db = readDb();
  writeDb({ ...db, shops: db.shops.map((item) => (item.id === shop.id ? shop : item)) });
};
