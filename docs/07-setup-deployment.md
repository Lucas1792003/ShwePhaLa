# 07 · Setup & Deployment

## Local Setup

```bash
npm install
npm run dev      # http://localhost:5173 (or the Vite default)
```

Useful scripts:

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc -b && vite build` — production bundle into `dist/` |
| `npm run preview` | Local preview of the production build |
| `npm test` | Vitest unit tests |
| `npm run lint` | ESLint |

## Environment Variables

`.env.local` (do **not** commit):

```bash
VITE_SUPABASE_URL=<your-project-url>
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

> Do **not** put a service-role key in any `VITE_*` variable — Vite inlines
> those into the browser bundle. The anon key plus RLS is the security
> boundary on the client. Service-role keys belong only in private
> server-side tooling.

Optional development-only flags:

- `VITE_ALLOW_BROWSER_SUPABASE_SEED=true` — explicitly unlocks
  `src/data/seedSupabase.ts` for local development against a non-production
  database. Off by default; production builds must not set it.

## Supabase Setup

For a fresh Supabase project:

1. Apply `supabase/schema.sql` in the SQL Editor.
2. Apply every file in `supabase/migrations/` **in numeric order**
   (`001` → `019`). See
   [03-database-security.md](./03-database-security.md) for the full
   migration list.
3. Verify the `auth` and `public` schemas have the expected tables, RPCs,
   and policies (see the live verification checklist in
   [`archive/29-live-supabase-rls-rpc-verification.md`](./archive/29-live-supabase-rls-rpc-verification.md)).
4. Create Supabase **Auth** users for staff.
5. For each Auth user, insert a `public.users` row and set `auth_id` to
   the Auth user's UUID (or let the email-fallback path in `authStore.ts`
   self-heal the link on first login).
6. Every non-admin user (MANAGER / CASHIER / BUYER) must have a `shop_id`.

For an existing database, apply only new migrations in numeric order.

## Storage Bucket

The `product-images` bucket and its RLS policies are created by
`016_product_images_storage.sql`. If your environment rejects
`CREATE POLICY ON storage.objects` from a migration, follow the dashboard
fallback in [`archive/31-product-images-storage-setup.md`](./archive/31-product-images-storage-setup.md):

- Bucket name: `product-images`
- Public read: **yes**
- File size limit: ~128 KB (the app caps images at 100 KB)
- Allowed MIME: `image/webp`, `image/jpeg`
- Read: `public`
- Insert / update / delete: `authenticated` AND
  `public.app_has_perm('product:create' OR 'product:update')`

The phone QR upload sessions table and helpers are added by
`019_product_image_upload_sessions.sql`.

## Daily Sales Email Function

The admin-only "Email today's CSV" button calls a Supabase Edge Function
that emails per-shop CSVs via [Resend](https://resend.com). Feature spec
in [04-features-workflows.md](./04-features-workflows.md#daily-sales-email-report).

### One-time setup

1. **Sign up to Resend** (https://resend.com) with the email address
   that should receive the report. The Resend free tier (3 000
   emails/month, 100/day) only delivers from `onboarding@resend.dev` to
   the signed-up email. For multi-recipient or production use, verify a
   custom domain in Resend instead.
2. **Create a Resend API key** → Resend dashboard → **API Keys** →
   `Create API Key` → Full access → copy the `re_…` value (only shown
   once).
3. **Set Supabase secrets** — either via CLI:
   ```bash
   supabase secrets set RESEND_API_KEY=re_xxx
   supabase secrets set REPORT_EMAIL_FROM="Shwe PhaLar <onboarding@resend.dev>"
   ```
   …or via the dashboard: **Edge Functions → email-sales-report →
   Secrets → Add new secret**.
4. **Deploy the function** — either CLI:
   ```bash
   supabase functions deploy email-sales-report
   ```
   …or paste the contents of
   `supabase/functions/email-sales-report/index.ts` into **Edge
   Functions → email-sales-report → Code editor** and click **Deploy
   function**. The function name must match exactly so
   `supabase.functions.invoke("email-sales-report", …)` reaches it.

### Required configuration

| Secret | Value | Notes |
| --- | --- | --- |
| `RESEND_API_KEY` | `re_…` | From Resend dashboard |
| `REPORT_EMAIL_FROM` | `Shwe PhaLar <onboarding@resend.dev>` | Free tier; replace with a verified-domain address for production |
| `SUPABASE_URL` | (auto) | Injected by Supabase at runtime |
| `SUPABASE_SERVICE_ROLE_KEY` | (auto) | Used to read `users` past RLS for the admin-role check |

### Recipient resolution

The function emails the address on the admin's row in `users` (falling
back to `auth.users.email`). For Resend's free tier to deliver, that
address must equal the email the Resend account was signed up with. If
the admin email changes, either:
- update the Resend account's email, or
- verify a custom sender domain and edit `REPORT_EMAIL_FROM` to a
  verified address — then any recipient is allowed.

### Verify

After deploy:
1. Log in as an admin user with a valid email
2. Sales page → **Email today's CSV** (admin-only button)
3. Inbox should receive an email within ~30 s with one CSV attachment
   per shop with sales today
4. If it errors, check **Edge Functions → email-sales-report → Logs**;
   the latest invocation reports the failing branch (config, admin
   lookup, Resend response)

## Vercel Deployment

The app is a static SPA. `vercel.json` rewrites all routes to
`index.html` so client-side routing works on deep links.

Steps:

1. Push the repo to GitHub.
2. Import the project into Vercel.
3. **Set environment variables** in the Vercel project:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Build command: `npm run build` (default). Output: `dist/`.
5. Deploy.

### Public Repo Safety

- `.env.local` is gitignored. Verify it never lands in commits.
- Service-role keys must never be added to a `VITE_*` variable, the
  repo, or Vercel "preview" env. Use them only from private server-side
  tooling.
- The `users` table is globally readable (the UI needs it), but RLS
  blocks direct writes to all operational/audit tables. Confirm RLS is
  ON on every protected table before going public.

## Seed Data

After RLS lockdown, do **not** seed protected tables from the browser /
authenticated Supabase client. Use one of:

- the Supabase SQL editor,
- `supabase db reset` with SQL seed files, or
- a private server-side service-role script.

`src/data/seedSupabase.ts` is retained as a guarded development reference
and refuses to run unless `VITE_ALLOW_BROWSER_SUPABASE_SEED=true`. The
file should eventually move out of the browser source tree entirely
(see [09-roadmap-todo.md](./09-roadmap-todo.md)).

## Verification

After deployment, run the live verification:

- [`archive/29-live-supabase-rls-rpc-verification.md`](./archive/29-live-supabase-rls-rpc-verification.md)
  — identity mapping, RPC happy/failure paths, direct-write failures.
- [`archive/30-rls-permission-gating-checklist.md`](./archive/30-rls-permission-gating-checklist.md)
  — permission-gated SELECT RLS.
- [`archive/33-supplier-debt-payment-rpc-tests.md`](./archive/33-supplier-debt-payment-rpc-tests.md)
  — supplier debt and `record_supplier_payment`.

[08-testing-qa.md](./08-testing-qa.md) summarizes the full QA surface and
the recommended Playwright smoke tests.

## Updating an Existing Deployment

1. Apply any new SQL migrations in numeric order (live SQL editor or
   `supabase db push`).
2. Push the new frontend bundle (Vercel auto-deploys on push to the main
   branch).
3. Re-run the relevant section of the live verification checklist —
   especially after migrations that add or change RLS or RPCs.

## Common Pitfalls

| Symptom | Likely cause |
| --- | --- |
| Bootstrap stuck on "Loading data…" | One of the parallel reads in `loadData()` failed. The new `AppLayout` should show the friendly Retry surface; if it does not, check console for the `[loadData]` log. |
| "Permission denied" on a write the user should have | Check `granted_permissions` / `revoked_permissions` on the user — revokes win. Also confirm `users.is_active` is true. |
| First admin login does nothing | The `users` table is empty: `authStore.login` creates the first ADMIN automatically. If it fails, check that auth signup is enabled in the Supabase project. |
| Product photo upload "Bucket not found" | Apply `016_product_images_storage.sql` (or set up the bucket via the dashboard). |
| RLS surprises | Re-read [03-database-security.md](./03-database-security.md) — direct authenticated writes to operational tables are blocked by design. Use RPCs. |
