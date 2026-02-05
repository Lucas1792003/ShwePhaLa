# Future Supabase Plan

Planned backend integration:
- Replace localStorage db with Supabase tables matching `seed.ts`.
- Add auth via Supabase Auth with role metadata and shop assignments.
- Move repositories to call Supabase APIs; keep the repository interface stable.
- Wire audit logging to database triggers for consistency.

UI and routing are already structured to swap data sources without rewriting screens.
