import type { Shift } from "../../types";
import { readDb, writeDb } from "../db";

export const listShifts = () => readDb().shifts;

export const addShift = (shift: Shift) => {
  const db = readDb();
  writeDb({ ...db, shifts: [shift, ...db.shifts] });
};

export const updateShift = (shift: Shift) => {
  const db = readDb();
  writeDb({ ...db, shifts: db.shifts.map((item) => (item.id === shift.id ? shift : item)) });
};
