# Contributing

## Code style
- Keep pages thin; push reusable UI into `src/components`.
- Use `import type` for type-only imports.
- Prefer feature helpers in `src/features/*`.
- Avoid re-export files; import directly from source.

## Add a feature
1. Add domain logic in `src/features/<feature>/service.ts`.
2. Create reusable components in `src/components/<feature>`.
3. Compose in a page under `src/pages`.
4. Update docs if flows or data models change.

## Add a data store slice
When adding new domain state to the data store:

1. **Define types** in `src/stores/data/types.ts`:
   ```typescript
   export interface MyFeatureState {
     items: MyItem[];
     addItem: (item: MyItem) => void;
   }
   ```

2. **Create slice** in `src/stores/data/slices/myFeatureSlice.ts`:
   ```typescript
   import type { StateCreator } from "zustand";
   import type { DataState, MyFeatureState } from "../types";

   export const createMyFeatureSlice: StateCreator<DataState, [], [], MyFeatureState> = (set) => ({
     items: [],
     addItem: (item) => set((s) => ({ items: [...s.items, item] })),
   });
   ```

3. **Register slice** in `src/stores/data/index.ts`:
   ```typescript
   import { createMyFeatureSlice } from "./slices/myFeatureSlice";
   // Add to the store composition:
   ...createMyFeatureSlice(...args),
   ```

4. **Update DataState** union type in `types.ts` to include your new state interface.

## Testing checklist
- POS scan + checkout works
- Shift required for cashier
- Refund/void updates status + inventory
- CSV exports download
- Print preview layout is 80mm

