import { seedData } from "./seed";

const STORAGE_KEY = "shwephala-db";

export type AppDb = typeof seedData;

const parseStored = (): AppDb | null => {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { state?: AppDb };
    return parsed.state ?? null;
  } catch {
    return null;
  }
};

export const readDb = (): AppDb => parseStored() ?? seedData;

export const writeDb = (db: AppDb) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: db, version: 0 }));
};

export const seedDbIfEmpty = () => {
  if (!window.localStorage.getItem(STORAGE_KEY)) {
    writeDb(seedData);
  }
};
