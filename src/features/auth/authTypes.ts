import type { Role } from "../../types";

const roleSuffixes: Array<{ suffix: string; role: Role }> = [
  { suffix: "@admin.com", role: "ADMIN" },
  { suffix: "@manager.com", role: "MANAGER" },
  { suffix: "@staff.com", role: "CASHIER" },
  { suffix: "@buyer.com", role: "BUYER" },
];

export const getRoleFromEmail = (email: string) => {
  const normalized = email.trim().toLowerCase();
  return roleSuffixes.find((entry) => normalized.endsWith(entry.suffix))?.role ?? null;
};

export const isPasswordValid = (password: string) => password.trim().length > 0;
