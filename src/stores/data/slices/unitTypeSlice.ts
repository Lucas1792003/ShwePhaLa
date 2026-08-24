import type { StateCreator } from "zustand";
import type { DataState, UnitTypeState } from "../types";
import type { UnitType } from "../../../types";
import { dbWrite } from "../../../lib/supabase";
import { writeTableRow } from "../tableWrite";

export const createUnitTypeSlice: StateCreator<DataState, [], [], UnitTypeState> = (set, get) => ({
  unitTypes: [],

  addUnitType: (unitType: UnitType) => {
    set((state) => ({ unitTypes: [...state.unitTypes, unitType] }));
    dbWrite(
      writeTableRow({
        table: "unit_types", op: "insert", id: unitType.id,
        row: {
          id: unitType.id, name: unitType.name,
          abbreviation: unitType.abbreviation ?? null,
          description: unitType.description ?? null,
          is_active: unitType.isActive, sort_order: unitType.sortOrder,
          created_at: unitType.createdAt, updated_at: unitType.updatedAt,
        },
        appRow: unitType,
      }),
      "addUnitType"
    );
  },

  updateUnitType: (unitType: UnitType) => {
    set((state) => ({
      unitTypes: state.unitTypes.map((item) => (item.id === unitType.id ? unitType : item)),
    }));
    dbWrite(
      writeTableRow({
        table: "unit_types", op: "update", id: unitType.id,
        row: {
          name: unitType.name, abbreviation: unitType.abbreviation ?? null,
          description: unitType.description ?? null,
          is_active: unitType.isActive, sort_order: unitType.sortOrder,
        },
        appRow: unitType,
      }),
      "updateUnitType"
    );
  },

  // Soft delete: deactivate so products that still reference the name keep
  // displaying it. The Product edit form shows inactive values as
  // "Current: <name> (inactive)" — see ProductsManagePage.
  deactivateUnitType: (unitTypeId: string) => {
    const existing = get().unitTypes.find((u) => u.id === unitTypeId);
    if (!existing) return;
    const next: UnitType = { ...existing, isActive: false };
    set((state) => ({
      unitTypes: state.unitTypes.map((item) => (item.id === unitTypeId ? next : item)),
    }));
    dbWrite(
      writeTableRow({ table: "unit_types", op: "update", id: unitTypeId, row: { is_active: false }, appRow: next }),
      "deactivateUnitType"
    );
  },
});
