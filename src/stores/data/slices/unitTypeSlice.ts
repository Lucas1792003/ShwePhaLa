import type { StateCreator } from "zustand";
import type { DataState, UnitTypeState } from "../types";
import type { UnitType } from "../../../types";
import { supabase, dbWrite } from "../../../lib/supabase";

export const createUnitTypeSlice: StateCreator<DataState, [], [], UnitTypeState> = (set, get) => ({
  unitTypes: [],

  addUnitType: (unitType: UnitType) => {
    set((state) => ({ unitTypes: [...state.unitTypes, unitType] }));
    dbWrite(
      supabase.from("unit_types").insert({
        id: unitType.id,
        name: unitType.name,
        abbreviation: unitType.abbreviation ?? null,
        description: unitType.description ?? null,
        is_active: unitType.isActive,
        sort_order: unitType.sortOrder,
        created_at: unitType.createdAt,
        updated_at: unitType.updatedAt,
      }),
      "addUnitType"
    );
  },

  updateUnitType: (unitType: UnitType) => {
    set((state) => ({
      unitTypes: state.unitTypes.map((item) => (item.id === unitType.id ? unitType : item)),
    }));
    dbWrite(
      supabase
        .from("unit_types")
        .update({
          name: unitType.name,
          abbreviation: unitType.abbreviation ?? null,
          description: unitType.description ?? null,
          is_active: unitType.isActive,
          sort_order: unitType.sortOrder,
        })
        .eq("id", unitType.id),
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
      supabase.from("unit_types").update({ is_active: false }).eq("id", unitTypeId),
      "deactivateUnitType"
    );
  },
});
