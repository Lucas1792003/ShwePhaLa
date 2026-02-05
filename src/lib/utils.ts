import type { Shop, User } from "../types";

export const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

export const formatMmk = (value: number) => `MMK ${value.toLocaleString("en-US")}`;

export const formatDateTime = (value: string | number | Date) =>
  new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export const formatDate = (value: string | number | Date) =>
  new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

export const getDateKey = (value: Date = new Date()) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
};

export const buildReceiptNo = (shopCode: string, dateKey: string, seq: number) =>
  `${shopCode}-${dateKey}-${String(seq).padStart(4, "0")}`;

export const getEffectiveShopId = (user: User | null | undefined, appShopId: string | null, shops: Shop[]) => {
  if (!user) return "";
  if (user.role === "ADMIN") return appShopId || user.shopId || shops[0]?.id || "";
  return user.shopId || "";
};

export const toNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
