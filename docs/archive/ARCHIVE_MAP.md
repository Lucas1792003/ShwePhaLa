# Archive Map

The compact `01`–`09` docs in the parent folder summarize what used to
live across 37+ root files. Nothing here was deleted — the originals are
preserved in this folder for reference and history.

## How To Use This Archive

- Look up a specific historical fact (e.g. exact policy wording from a
  migration, the long per-RPC test script, an old changelog entry).
- Use [`21-recent-changes.md`](./21-recent-changes.md) as the canonical
  changelog. The compact docs link directly to it from the relevant
  section.
- Verification checklists for live Supabase work
  ([`29-live-supabase-rls-rpc-verification.md`](./29-live-supabase-rls-rpc-verification.md),
  [`30-rls-permission-gating-checklist.md`](./30-rls-permission-gating-checklist.md))
  remain the working scripts to run against a real database — they are
  pointed to from the compact `07` and `08` docs.

## Where Each Original Doc Was Folded In

| Archived file | Merged into |
| --- | --- |
| `00-overview.md` | [`01-overview.md`](../01-overview.md) |
| `01-roles-permissions.md` | [`05-roles-permissions.md`](../05-roles-permissions.md) (full matrix preserved here for reference) |
| `02-routing-navigation.md` | [`02-architecture.md`](../02-architecture.md) and [`05-roles-permissions.md`](../05-roles-permissions.md) |
| `03-authentication.md` | [`02-architecture.md`](../02-architecture.md) (Identity & Permissions) and [`07-setup-deployment.md`](../07-setup-deployment.md) |
| `04-database-schema.md` | [`03-database-security.md`](../03-database-security.md) |
| `05-pos-flow.md` | [`04-features-workflows.md`](../04-features-workflows.md) (POS Sale section) |
| `06-inventory-flow.md` | [`04-features-workflows.md`](../04-features-workflows.md) (Inventory section) + [`02-architecture.md`](../02-architecture.md) (Multi-Shop Model) |
| `07-shift-flow.md` | [`04-features-workflows.md`](../04-features-workflows.md) (Shifts section) |
| `08-refund-void-flow.md` | [`04-features-workflows.md`](../04-features-workflows.md) (Refund / Void section) |
| `09-audit-logging.md` | [`03-database-security.md`](../03-database-security.md) (Audit Model) + [`04-features-workflows.md`](../04-features-workflows.md) (Audit section) |
| `10-localstorage-persistence.md` | [`02-architecture.md`](../02-architecture.md) (Runtime State) — outdated "localStorage as persistence" framing replaced. |
| `11-component-structure.md` | [`02-architecture.md`](../02-architecture.md) (Folder Layout) and `README.md` (Code Layout). |
| `12-supabase-setup.md` | [`07-setup-deployment.md`](../07-setup-deployment.md) |
| `13-data-model.md` | [`02-architecture.md`](../02-architecture.md) + [`03-database-security.md`](../03-database-security.md) (table summary). |
| `14-stock-transfers.md` | [`04-features-workflows.md`](../04-features-workflows.md) (Stock Transfers section) |
| `15-suppliers-purchasing.md` | [`04-features-workflows.md`](../04-features-workflows.md) (Purchase Orders + Supplier Debt + Supplier UI sections) |
| `16-pricing-tiers.md` | [`04-features-workflows.md`](../04-features-workflows.md) (Products / Categories / Pricing → Price tiers) |
| `17-architecture.md` | [`02-architecture.md`](../02-architecture.md) (full rewrite + error-handling section) |
| `18-printing.md` | [`06-ui-printing-hardware.md`](../06-ui-printing-hardware.md). The original test checklist remains here. |
| `19-contributing.md` | `README.md` (Contributing Notes section) |
| `20-todo-next.md` | [`09-roadmap-todo.md`](../09-roadmap-todo.md) |
| `21-recent-changes.md` | Kept verbatim as the long-form changelog. Compact docs link out to it from their feature sections. |
| `22-script-3a-checkout-rpc-tests.md` | Pointed to from [`08-testing-qa.md`](../08-testing-qa.md) (`complete_sale` checklist). |
| `23-script-3b-refund-void-rpc-tests.md` | Pointed to from [`08-testing-qa.md`](../08-testing-qa.md). |
| `24-script-3c-receive-purchase-order-rpc-tests.md` | Pointed to from [`08-testing-qa.md`](../08-testing-qa.md). |
| `24-script-3f-shift-rpc-tests.md` | Pointed to from [`08-testing-qa.md`](../08-testing-qa.md). |
| `25-script-3d-complete-stock-transfer-rpc-tests.md` | Pointed to from [`08-testing-qa.md`](../08-testing-qa.md). |
| `26-script-3e-adjust-stock-rpc-tests.md` | Pointed to from [`08-testing-qa.md`](../08-testing-qa.md). |
| `27-script-4a-rls-lockdown-tests.md` | Pointed to from [`08-testing-qa.md`](../08-testing-qa.md). |
| `28-script-4b-shop-scoped-reads-tests.md` | Pointed to from [`08-testing-qa.md`](../08-testing-qa.md). |
| `29-live-supabase-rls-rpc-verification.md` | Canonical live verification script. Pointed to from [`07`](../07-setup-deployment.md) and [`08`](../08-testing-qa.md). |
| `30-rls-permission-gating-checklist.md` | Permission-gated SELECT checklist. Pointed to from [`07`](../07-setup-deployment.md) and [`08`](../08-testing-qa.md). |
| `31-product-images-storage-setup.md` | [`06-ui-printing-hardware.md`](../06-ui-printing-hardware.md) (Product Image Upload + Phone QR sections) and [`07-setup-deployment.md`](../07-setup-deployment.md) (Storage Bucket section). |
| `32-responsive-testing-checklist.md` | [`06-ui-printing-hardware.md`](../06-ui-printing-hardware.md) (Responsive Targets). Original per-page checklist kept here. |
| `33-supplier-debt-payment-rpc-tests.md` | Pointed to from [`07`](../07-setup-deployment.md) and [`08`](../08-testing-qa.md). |
| `34-error-handling-qa-checklist.md` | [`08-testing-qa.md`](../08-testing-qa.md) (Error Handling QA). Original scenario list kept here. |
| `35-supplier-workflow-qa-checklist.md` | [`08-testing-qa.md`](../08-testing-qa.md) (Supplier & Payment QA). Original scenario list kept here. |

## What Was Removed Or Rewritten From The Old Set

The compact docs intentionally drop or rewrite a few outdated claims:

- **"localStorage is the data store."** Not true since the Supabase
  migration — `dataStore` is in-memory only; localStorage holds only the
  shop/language UI prefs and the Supabase Auth session.
- **"Login accepts any password against the seed users."** Removed —
  authentication is Supabase Auth with real password verification.
- **"RBAC is enforced only on the frontend."** Removed — RBAC is enforced
  by SQL helpers (`app_has_perm`, `app_can_for_shop`) inside every RPC
  and by permission-gated SELECT RLS for reads.
- **"All RLS is permissive."** Removed — operational writes are blocked
  from direct authenticated clients, and SELECT policies on sensitive
  tables additionally require a granular permission.
- **"Product images are stored as base64 in the row."** Removed — images
  compress to `<= 100 KB` and upload to the `product-images` Supabase
  Storage bucket; the row stores only the public URL.
- **"Categories are a hardcoded 4-item list."** Removed — categories are
  fully store-driven with `categories.icon_key` and a safe-delete rule
  (cannot delete while products reference the category).
- **"Inventory is one global quantity per product."** Removed — the
  `inventory` table is keyed by `(shop_id, product_id)`; the
  ProductsManagePage "Stock" column now shows the selected shop only.

These rewrites stay consistent across the new compact docs.
