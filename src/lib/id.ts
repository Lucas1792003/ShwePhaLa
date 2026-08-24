/**
 * Generate a collision-safe id for a new row, in the same `<prefix>-<hex>`
 * shape the server mints (e.g. `'sale-' || replace(gen_random_uuid()::text,
 * '-', '')` in supabase/migrations/041_complete_sale_cost_snapshot.sql).
 *
 * Real entropy (crypto.randomUUID) is required, not Date.now()/Math.random()
 * — once a record can be created offline on multiple devices and synced
 * later, two tills minting an id in the same millisecond must never collide.
 */
export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, "")}`;
}
