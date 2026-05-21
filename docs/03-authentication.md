# Authentication

Shwe Phala POS uses **Supabase Auth** with email/password login. The app
`users` table stores staff profiles and links each active staff row to a
Supabase Auth user through `users.auth_id`.

Source file: `src/stores/authStore.ts`.

## Identity Link

- `users.auth_id` is the trusted link to `auth.users.id`.
- `resolveAppUser()` first matches `users.auth_id` to `auth.uid()`.
- For pre-link rows, it can fall back to unique email matching and then write
  `auth_id` so future logins use the trusted path.
- Once linked, identity does not depend on email.

## Login Flow

1. `login(email, password)` calls `supabase.auth.signInWithPassword`.
2. `resolveAppUser()` resolves the app staff row.
3. `authStore.currentUserId` is set to the app `users.id`.
4. Route guards and store actions use the app user plus granular permissions.

## First Admin Setup

If the `users` table is empty, the first login creates:

- a Supabase Auth account
- an active `ADMIN` row in `users`
- `users.auth_id` set immediately

## Session Behavior

- `restoreSession()` runs on app start.
- It reads the Supabase session and resolves the linked app user.
- Inactive users are rejected and signed out.
- Logout calls `supabase.auth.signOut()` and clears local auth state.

## Required Data Integrity

- Every active staff user should have `auth_id`.
- `MANAGER` and `CASHIER` users should have `shop_id`.
- Duplicate staff emails should be avoided because email fallback linking skips
  ambiguous matches.

Use the pre-flight SQL in
[29-live-supabase-rls-rpc-verification.md](./29-live-supabase-rls-rpc-verification.md)
to check these conditions.

## Access Control

- `RequireAuth` guards all `/app` routes.
- `RequireRole` checks granular permissions from `src/lib/permissions.ts`.
- Database RPCs use `auth.uid()`, `current_app_user()`, `app_has_perm()`, and
  `app_can_for_shop()`.

