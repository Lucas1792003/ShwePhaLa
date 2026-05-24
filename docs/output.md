Current user/RBAC flow (audit)
Model: Role = "ADMIN" | "MANAGER" | "CASHIER" | "BUYER" in src/types/domain.ts:1. SQL users.shop_id is nullable, no role/shop check constraints.
Creation: Direct table writes via src/stores/data/slices/shopSlice.ts:30 (addUser / updateUser). UsersPage.tsx does the supabase.auth.signUp + restore-admin-session dance, then inserts the row. No RPC.
RLS (migration 010, lines 93–101): INSERT requires user:create (or bootstrap), UPDATE requires user:update.
Existing uniqueness / business-rule enforcement on users: none. Only shifts_one_open_per_cashier_shop exists across the schema.
Files changed
File	Change
supabase/migrations/020_rbac_user_assignment_constraints.sql	New — preflight, indexes, trigger, diagnostic view
src/features/admin/userFormErrors.ts	New — DB-error → friendly-message mapper
src/features/admin/userFormErrors.test.ts	New — 10 vitest cases
src/pages/UsersPage.tsx	Hide ADMIN if one exists; gray-out shops in MANAGER/CASHIER picker; show "Manager: X"; preflight + DB-error mapping; modal stays open on failure
docs/05-roles-permissions.md	New "User-Assignment Rules (DB-enforced)" section + manager-replacement note + preflight queries
docs/03-database-security.md	Migration 020 added to migration table; users-row note added to write-policies section
docs/04-features-workflows.md	New "User Management" workflow section
docs/09-roadmap-todo.md	Completed line for 020 + new "user-management RPCs / replace_manager" follow-up
Migration 020 contents
Preflight (DO block, fails loudly on dirty data, never silently picks):

count role='ADMIN' > 1
shops with > 1 active role='MANAGER'
active MANAGER with NULL shop_id
active CASHIER with NULL shop_id
active CASHIER in a shop without an active MANAGER
Indexes:

users_only_one_admin — UNIQUE … ((true)) WHERE role='ADMIN' (one ADMIN row anywhere, regardless of active)
users_one_active_manager_per_shop — UNIQUE (shop_id) WHERE role='MANAGER' AND is_active=true
Trigger enforce_user_assignment_rules() (BEFORE INSERT OR UPDATE):

ADMIN → shop_id := NULL (normalize)
MANAGER / CASHIER / BUYER require shop_id (each raises its own friendly message)
Active CASHIER requires an active MANAGER in the same shop
Manager deactivation / demotion / shop-change blocked while the old shop has active cashiers, unless a replacement manager is in place
Diagnostic view rbac_assignment_violations — SELECT * to see all current violations.

RPC migration?
Per your decision: not in this change. DB triggers/indexes enforce the rules; the frontend keeps its direct-insert path and maps errors to friendly strings. The user-management-RPC work is filed as a follow-up in 09-roadmap-todo.md so a future replace_manager(shop_id, new_user_id) can swap atomically and the auth.signUp dance can be wrapped at the same time.

Frontend rule summary (UsersPage)
ADMIN option hidden once any ADMIN exists (stays selectable only when editing the existing admin).
MANAGER: shop dropdown disables any shop with another active manager; inline hint quotes the spec text.
CASHIER: shop dropdown enables only shops with an active manager; shows Manager: <name> inline; falls back to a "no shop has an active manager yet" warning when applicable.
BUYER: shop required.
Preflight runs before submit. DB errors run through mapUserFormError so unique-index (23505) and trigger (P0001) errors both surface as the canonical spec strings.
Manager-replacement behavior
The unique index forbids two simultaneous active managers in one shop. So manager replacement is:

No active cashiers: deactivate/demote old, then create/assign new — straightforward.
Active cashiers present: trigger blocks the deactivation. Operator must temporarily deactivate cashiers, swap manager, re-enable cashiers. Painful by design — documented as the reason replace_manager(shop_id, new_user_id) is on the roadmap.
Cashier-assignment behavior
shop_id required
active cashier requires an active manager in that shop
inactive cashiers are exempt (so history rows survive)
reactivating an inactive cashier re-runs the manager check
Tests / checklists added
10 vitest cases in userFormErrors.test.ts covering every constraint → friendly-message mapping plus the generic fallback paths. All pass.
rbac_assignment_violations view doubles as the "what would break" checklist for the DB itself.
SQL you should run manually
Run before applying migration 020 (so the preflight doesn't surprise you):


SELECT count(*) FROM users WHERE role = 'ADMIN';
SELECT shop_id, count(*) FROM users
  WHERE role='MANAGER' AND is_active=true AND shop_id IS NOT NULL
  GROUP BY shop_id HAVING count(*) > 1;
SELECT id, name FROM users WHERE role='MANAGER' AND is_active=true AND shop_id IS NULL;
SELECT id, name FROM users WHERE role='CASHIER' AND is_active=true AND shop_id IS NULL;
SELECT c.id, c.name, c.shop_id FROM users c
 WHERE c.role='CASHIER' AND c.is_active=true AND c.shop_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM users m
                    WHERE m.role='MANAGER' AND m.is_active=true AND m.shop_id = c.shop_id);
After applying, SELECT * FROM rbac_assignment_violations; should be empty.

Verification results
npx tsc -b — clean (no output, no errors)
npx vitest run — 238/238 passed across 20 files (10 of those are the new userFormErrors tests)
npm run build — succeeded; pre-existing chunk-size warning unchanged
Remaining risks
Tiny race window: two operators each adding a manager to the same shop concurrently — Postgres unique index serializes them and one INSERT errors with 23505 mapped to "This shop already has an active manager." Not a real risk, but worth noting.
The auth.signUp dance in UsersPage still leaves a brief window where the browser is signed in as the new user. Migration 020 doesn't touch this — wrapping user creation in an RPC (filed as the follow-up) is the proper fix.
No DB tests run: vitest covers the error-mapper only; the trigger logic is exercised only by you applying 020 to a real Postgres. The preflight will catch any dirty pre-existing data before the trigger starts firing.
Manager replacement UX is rough when active cashiers exist — operationally painful, by design. Documented as the trigger for the roadmap replace_manager RPC.
Did auto shop-creation exist?
No. No "Main Store"/"Main Shop" or any other auto-created shop existed. The only addShop caller in the runtime is src/pages/ShopsPage.tsx:62 (the explicit Shops management page). src/data/repos/shopRepo.ts has an addShop helper but is dead code — nothing imports from data/repos/* (the app uses stores/data/slices/* against Supabase).

What I did find: a silent shops[0] auto-PICK fallback
Three places silently picked shops[0] when an admin had no selected shop, effectively operating on "whichever shop happened to load first". This violates your rule that "POS/shift/shop-scoped workflows should show a clear error or blocked state."

Location	Old behavior
src/lib/utils.ts:36 getEffectiveShopId	`appShopId
src/stores/data/index.ts:260-263 loadData	setShopId(shopsList[0]?.id ?? null) whenever currentShopId was missing
src/app/layout/ShopSwitcher.tsx:20	useEffect auto-set shops[0] for admin
src/components/layout/ShopSwitcher.tsx:16	Same (dead-code copy but kept parallel)
Files changed
File	Change
src/lib/utils.ts	getEffectiveShopId returns "" instead of falling back to shops[0]; also validates the picked id still exists in the loaded list
src/stores/data/index.ts	loadData only clears a stale currentShopId (no auto-pick)
src/app/layout/ShopSwitcher.tsx	Removed auto-pick effect; added a disabled Select a shop placeholder option for admins
src/components/layout/ShopSwitcher.tsx	Same
src/pages/PosPage.tsx	Early-return blocked card when !shopId; useEffect clears cart + discount + open modals when shopId changes
src/pages/ShiftPage.tsx	"Select a shop before opening a shift." banner replaces the start-shift card when !shopId
src/pages/InventoryPage.tsx	No-shop banner; canAdjust requires hasShop (per-row Adjust action disabled)
supabase/migrations/021_shop_id_required_rpc_guards.sql	New — adds Shop is required / Source shop is required / Destination shop is required guards at the top of create_purchase_order and create_stock_transfer
src/lib/utils.test.ts	7 new test cases for getEffectiveShopId covering admin no-pick, ghost shop ids, manager fixed-shop, etc.
docs/03-database-security.md	Migration 021 row added
docs/04-features-workflows.md	New "No-Shop-Selected Policy (ADMIN)" section
New no-shop behavior (per role)
Surface	ADMIN with no shop	MANAGER/CASHIER/BUYER without shopId
Dashboard	Works (admin's own all/per-shop toggle drives it)	getEffectiveShopId returns "" → same blocked states elsewhere (shouldn't happen post-020)
POS	Full-card block: Select a shop to use POS…	Same
Shift	Banner: Select a shop before opening a shift.	Same
Inventory	Banner + Adjust action disabled	Same
Shop switcher	Shows disabled Select a shop placeholder option	Hidden for non-admins (unchanged)
RPC validation result
RPC	Pre-021	Post-021
complete_sale	✅ already had Shop is required (004:85)	unchanged
open_shift	✅ already had Shop is required (009:65)	unchanged
adjust_stock	✅ already had Shop is required (008/014)	unchanged
create_purchase_order	⚠️ relied on app_can_for_shop → Shop not found indirect path	✅ explicit Shop is required at top of body
create_stock_transfer	⚠️ NULL hit NOT NULL constraint; empty "" would corrupt	✅ explicit guards on both p_from_shop_id and p_to_shop_id
receive_purchase_order / approve_* / cancel_*	derive shop_id from the looked-up PO/transfer row, so no operator-supplied shop_id to guard	unchanged
record_supplier_payment	derives shop_id from PO (no fallback shop)	unchanged
Shop creation: allowed paths only
/app/admin/shops page → addShop → supabase.from("shops").insert(...) gated by app_has_perm('shop:create') RLS (migration 010)
supabase/schema.sql initial CREATE TABLE
Optional src/data/seedSupabase.ts script (dev seed; not in runtime)
Confirmed NOT creating shops: auth/login, loadData, dashboard, POS, shift, shop switcher, app bootstrap.

Tests / checklists added
7 vitest cases in src/lib/utils.test.ts for getEffectiveShopId (admin no-pick = "", ghost shop id = "", manager fixed-shop, null/undefined user, etc.)
Existing tests preserved: 245/245 passing (up from 238)
Suggested manual checks (cannot be automated without a headless DB):

ADMIN with no selected shop → cannot open shift / cannot checkout / Inventory Adjust is disabled
SELECT create_stock_transfer(NULL, 'shop-b', '', '[]'::jsonb) → Source shop is required
SELECT create_purchase_order('', 'supplier-01', '', '[...]'::jsonb) → Shop is required
Verification results
npx tsc -b — clean (no errors)
npx vitest run — 245/245 passing across 20 files
npm run build — succeeded; pre-existing chunk-size warning unchanged
Grep for Main Store|Main Shop|defaultShop|ensureShop|shops[0]?.id|shops.length===0 in src/ → no matches
Grep for addShop|createShop( → only ShopsPage.tsx (correct) and dead data/repos/shopRepo.ts
Remaining risks
Pre-existing sessions. Admins with a persisted currentShopId in localStorage will still see that shop on next load — they don't get bounced into the blocked state. Only fresh logins (or storage clears) expose the new flow. This is by design: forcing existing operators back into a "pick again" loop on first reload would be noisy. If you want a one-shot reset, bump the name of the appStore persist key from "pos-app" to a new value.
Dead src/components/layout/ShopSwitcher.tsx / AppShell.tsx. I updated the component to stay parallel, but the active mount is src/app/layout/*. Cleaning up the duplicate is out of scope and filed worth doing separately.
Dead src/data/repos/shopRepo.ts. Also unused; safe to delete in a separate cleanup pass.
The 021 migration body re-creates the two RPCs verbatim from 012. A future change to either RPC needs to be applied to both files OR migration 021 has to be superseded. I've documented this explicitly in the migration header.

Audit findings
Layer	Status
open_shift RPC (009:78-83)	Already accepts shift:manage_own OR shift:manage_all per shop → ADMIN + MANAGER + CASHIER all allowed. Rejects blank shop_id. Enforces "one open shift per cashier globally" via advisory lock + shifts_one_open_per_cashier_shop unique index.
close_shift RPC (009:199-204)	Already accepts (own + manage_own) OR manage_all. ADMIN/MANAGER can close any shift in their shop scope.
Shifts SELECT RLS (015:95-107)	ADMIN: all; manage_all/report:shop_sales + shop: all shop rows; manage_own/report:own_shift: own rows. Matches the requested scopes exactly.
Route guard (permissions.ts:32)	shifts: "shift:manage_own" — ADMIN/MANAGER/CASHIER all hold it; BUYER does not. Correct.
Wrapper src/features/shifts/pages/ShiftsPage.tsx	Routed CASHIER to ShiftPage (open/close own) but ADMIN/MANAGER to ShiftsPage (read-only table only). No open/close UI for ADMIN/MANAGER. This was the bug.
Manager ShiftsPage filter (pages/ShiftsPage.tsx:26-27)	Filtered to a single getEffectiveShopId — for ADMIN with a shop picked, only that shop's shifts showed; with no shop, empty. Did not match "ADMIN sees all".
Work Hours view	Did not exist.
ADMIN / MANAGER were blocked by UI, not backend
The RPCs and RLS already supported every requested case. No SQL migration was needed; the fix is entirely frontend.

Files changed
File	Change
src/features/shifts/workHours.ts	New. getShiftDurationMs, formatDuration, isShiftInMonth, getMonthlyShiftHoursMs, groupShiftHoursByUser, monthKey
src/features/shifts/workHours.test.ts	New. 18 vitest cases covering active/closed duration, cross-midnight/cross-month rule, formatting edge cases, group-by-user buckets including ghost users
src/features/shifts/components/WorkHoursPanel.tsx	New. Month picker + role-aware filters + Active cards + Monthly totals table + Daily records table; live now injected by the parent
src/features/shifts/pages/ShiftsPage.tsx	Rewritten as the single unified Shifts page. Open/close UI for any role with shift:manage_own. ADMIN requires currentShopId; MANAGER/CASHIER use user.shopId. Two tabs: Shift Records + Work Hours. Live duration ticks every 60 s. CSV export added
docs/04-features-workflows.md	"Shifts" section rewritten with the role/shop table, the manager-deactivation/admin-shop rule, the Records and Work Hours tabs, and the monthly-attribution rule
docs/05-roles-permissions.md	Added a callout under Shifts permission row pointing at the unified workflow + Work Hours visibility
docs/08-testing-qa.md	Bumped test counts to 21/263; added Shifts & Work Hours QA checklist section; added new vitest files to the inventory
Shift open/close behavior after fix
Role	Open/close UI	Shop source
ADMIN	Visible; blocked by message Select a shop to open a shift… until a shop is picked	currentShopId (shop switcher)
MANAGER	Visible; uses assigned shop	users.shop_id
CASHIER	Visible; uses assigned shop	users.shop_id
BUYER	Cannot reach /app/shifts (route gate)	—
Backend rules preserved: one open shift per cashier globally; Shop is required on blank shop_id; non-zero variance requires a written reason at close; close-on-behalf-of-someone-else requires shift:manage_all for that shop.

Work-hour UI added
/app/shifts → Work Hours tab.

Month picker defaults to the local calendar month containing now.
Filters: ADMIN gets Shop + User; MANAGER gets User (shop is pre-bound); CASHIER gets no filters.
Total this month chip shows the sum of durations matching the current filter.
Active shifts — one card per visible open shift with Xh Ym so far (ticks once a minute).
Monthly totals — one row per (user, shop) for the month: shift count, open count, total hours.
Daily records in <month> — every shift in the month with started/ended/duration/status badge.
Empty-state messages cover: No active shifts., No shifts found for this month., No shift records to show. (Records tab).

Work-hour calculation rule (documented)
Closed shift duration = endedAt - startedAt
Open shift duration = now - startedAt
Negative / invalid timestamps clamp to 0 (never penalise the user)
Format Xh Ym, rounded DOWN to the minute, hours not capped at 24
Monthly attribution: a shift is attributed to the local calendar month its startedAt falls in. A shift that crosses midnight from May 31 → June 1 is counted entirely for May. Rationale: matches close_shift's anchoring on opening_cash captured at startedAt, and keeps Myanmar operators' wall-clock month boundaries intuitive. Helpers + tests are designed so a future "split by actual overlap" rule swap only requires updating isShiftInMonth / getMonthlyShiftHoursMs and their tests.
Permission behavior by role (after change)
ADMIN	MANAGER	CASHIER	BUYER
Reach /app/shifts	✅	✅	✅	❌ (no shift:manage_own)
Open own shift	✅ (needs shop selected)	✅	✅	❌
Close own shift	✅	✅	✅	❌
Close someone else's open shift	✅ (any shop)	✅ (assigned shop)	❌	❌
See Records tab rows	All shops	Assigned shop	Own only	n/a
See Work Hours tab rows	All shops + filters	Assigned shop + user filter	Own only	n/a
Row-visibility is enforced both by RLS (server-side authority) and client-side visibleShifts (mirrors RLS so the UI never shows stale empty states).

Tests added/updated
18 new cases in src/features/shifts/workHours.test.ts:
getShiftDurationMs: closed, open (uses now), invalid startedAt, invalid endedAt, no negative durations
formatDuration: 2h 15m, 119s rounds to 1m, large monthly totals (42h 30m), clamps NaN/-1000/Infinity
isShiftInMonth: in-month, out-of-month, cross-midnight/cross-month attribution to starting month, malformed month strings
getMonthlyShiftHoursMs: sum + ignore other months; open shifts use now
groupShiftHoursByUser: buckets per (user, shop), counts shift+open, history for deleted users keeps a placeholder
monthKey: zero-pads single-digit months
Total suite: 21 files / 263 tests passing (up from 20 / 245).

Manual QA checklist
Added to docs/08-testing-qa.md → "Shifts & Work Hours QA":

ADMIN with no shop selected → blocked-state message
ADMIN with shop A selected → can open + close (cashier_id = admin)
ADMIN switches shop without closing → second open blocked
MANAGER → opens + closes in assigned shop, can't open in another
CASHIER → unchanged self-flow
Non-zero variance requires reason at close (server enforced)
Records: ADMIN sees all shops; MANAGER assigned; CASHIER own; CSV export reflects filter
URL-shimming a manager to another shop's data still hits RLS, not just the client
Work Hours: month picker defaults to current local month; cross-midnight May→June shift counts for May; live "Active" updates after ~60 s
Verification results
npx tsc -b — clean
npx vitest run — 263/263 passing
npm run build — succeeded; pre-existing chunk-size warning unchanged
Remaining risks
Two dead-code files left behind. src/pages/ShiftPage.tsx and src/pages/ShiftsPage.tsx are no longer referenced by the router or any other page (the unified page in src/features/shifts/pages/ShiftsPage.tsx replaces both). Deleting them is a separate cleanup pass — left in to keep this diff scoped to the requested behavior change.
Open-shift cap is per cashier_id, globally. An admin who opens a shift in shop A and forgets it cannot open another in shop B. The error message (This cashier already has an open shift) is precise; if you want a friendly UI hint in the StartShiftCard before the operator hits the RPC, that's a tiny follow-up — the data is already on the page (ownOpenShift), I only didn't wire it because the existing toast covers it.
Monthly totals reload only when month/filters/now-tick change. A shift opened by another operator while you have the tab open won't appear until either the once-per-minute now tick OR a manual loadData refresh. Adding a Supabase Realtime subscription is on 09-roadmap-todo.md already and would close this gap.
Cross-timezone deployment. Helpers bucket shifts by local month — correct for a single-region (Myanmar) deployment. If you ever serve multiple timezones, you'd want a server-computed month bucket. Documented in the function header.
No DOM/React Testing Library coverage for the new page — the helpers are heavily tested but the page itself is covered only by tsc + the QA checklist. Playwright Shifts/Work Hours scenarios have been added to the recommended-suites table in 08-testing-qa.md.
Cards / charts inventory and audit
#	Element	Data source	Current formula	Shop scope	Role gate	Bug?
1	Total Revenue card	useDashboardInsights.totalRevenue	sum of sale_items.lineTotalMmk for NORMAL sales	shop-scoped (admin "all" supported)	none (route already requires report:shop_sales)	BUG: this is the subtotal (pre-cart-discount). The Sales Trend chart uses sale.totalMmk. The two disagree when cart discounts are applied.
2	Total Investment card	useDashboardInsights.totalCost	sum of (product.costMmk × qtyUnits) for items of NORMAL sales	shop-scoped	report:shop_profit ✓	Uses current product.costMmk (no captured cost on sale_items) — approximation, must be documented
3	Total Profit + margin	totalRevenue - totalCost	same	shop-scoped	report:shop_profit ✓	Inherits BUG #1 (revenue mismatch)
4	Total Orders card	filteredSales.length	count of NORMAL sales	shop-scoped	none	OK; document that PARTIAL-refunded sales still count
5	Avg Order Value	totalRevenue / count	same	shop-scoped	none	Inherits BUG #1
6	Profit Trend chart	ProfitTrendChart	daily sale.totalMmk vs current-cost × qty for 7/30 days	shop-scoped	report:shop_profit ✓	Uses sale.totalMmk (correct) — but disagrees with KPI #1
7	Goal Tracker	inline monthlyMetrics	sum of sale.totalMmk and cost for sales since month start	shop-scoped	report:shop_profit ✓	Revenue uses sale.totalMmk (correct); cost approximation as #2
8	Sales Trend area chart	inline dailySalesData	daily sale.totalMmk / cost / totalMmk - cost for last 7 days	shop-scoped	report:shop_profit ✓	OK; same cost approximation
9	Sales by Category pie	inline categoryData	sum of lineTotalMmk per category	shop-scoped	none	Pre-cart-discount basis; OK for proportional ranking but document
10	Inventory Intelligence	useDashboardInsights.stockHealth + fastSlowMovers	per-product currentQty; all-shops mode SUMS qty across shops	shop-scoped, broken in all-shops	report:shop_inventory ✓	BUG: in all-shops mode, summing hides shop-A out-of-stock when shop-B has plenty. Per the task, "Do not sum across shops unless explicitly showing all-shop aggregate."
11	Top Products table	inline topProducts	per-product qty / lineTotal / cost / profit	shop-scoped	row visible always; cost+profit cols gated by report:shop_profit ✓	Ranking by lineTotal revenue; documented
12	Low Stock Alert	inline lowStockProducts	per-product qty; all-shops mode SUMS qty across shops	shop-scoped, broken in all-shops	report:shop_inventory ✓	BUG: same as #10. Admin can have a shop completely out and the alert misses it.
13	Recent Sales + per-sale profit	inline recentSales	last 5 NORMAL sales by date	shop-scoped	per-sale profit gated by report:shop_profit ✓	OK; per-sale profit uses gross totalMmk (acceptable snapshot)
Shop scoping audit. The page sets selectedShopId = isAdmin ? "all" : defaultShopId || "all". A non-admin without an assigned shop (defensive — should never happen post migration 020) silently falls into "all" and is then filtered to s.shopId === null → sees zero sales. The shop <select> is correctly disabled for non-admins. RLS independently strips rows the role cannot read, so the worst case is empty data, not data leakage.

Permission gating audit. ADMIN sees everything. MANAGER (no report:shop_profit by default) loses Investment/Profit/Margin cards, ProfitTrendChart, GoalTracker, Sales Trend area chart, Top Products' cost+profit columns, per-sale profit on Recent Sales. CASHIER and BUYER cannot reach /app/dashboard (route requires report:shop_sales). Gating is correct.

Critical bugs to fix:

KPI Total Revenue uses subtotal but Sales Trend chart uses sale.totalMmk → unify on sale.totalMmk
Low-stock and stock health sum quantities across shops in admin-all-shops mode → switch to per-shop visibility
No net-revenue handling (approved PARTIAL refunds aren't deducted) → add it
Cost is current-product-cost, not captured-at-sale → document the approximation explicitly
Every Dashboard element audited
#	Element	Old formula	Current formula	Shop scope	Role gate	Was buggy?
1	Total Revenue card	sum(sale_items.lineTotalMmk) via hook	calculateNetRevenue = sum(sale.totalMmk) − approved PARTIAL refunds, floored at 0	scoped	route report:shop_sales	Yes — disagreed with Sales Trend; ignored refunds
2	Total Investment card	sum(qty × current cost) for NORMAL sales	calculateCostOfGoods (same formula, documented approximation)	scoped	report:shop_profit ✓	Approximation only — documented
3	Total Profit + margin	totalRevenue − totalCost	calculateProfit / calculateProfitMargin (no NaN on revenue=0)	scoped	report:shop_profit ✓	Inherited #1
4	Total Orders	filteredSales.length	calculateSalesCount (NORMAL only)	scoped	route	OK
5	Avg Order Value	totalRevenue / count	calculateAvgOrderValue (returns 0 on count=0)	scoped	route	Inherited #1
6	Profit Trend chart (7/30 d)	daily sum(sale.totalMmk) − cost	unchanged	scoped	report:shop_profit ✓	OK; numbers now match KPI
7	Goal Tracker	inline monthly totals using sale.totalMmk + cost	now uses shared helpers calculateGrossRevenue + calculateCostOfGoods for month-to-date subset	scoped	report:shop_profit ✓	OK; harmonised
8	Sales Trend area chart	inline daily revenue + cost	unchanged formula but now keyed off the same filteredSales	scoped	report:shop_profit ✓	OK
9	Sales by Category pie	inline lineTotalMmk per category	calculateCategoryRevenue	scoped	route	OK; pre-cart-discount basis documented
10	Inventory Intelligence (stock health)	SUMMED qty across shops in all-shops mode	per-product worst-shop classification: out iff any shop is out, low iff any shop is low; currentQty = min across shops; days-until-stockout null in all-shops	scoped	report:shop_inventory ✓	Yes — fixed
11	Top Selling Products	inline lineTotalMmk ranking	calculateTopProducts (line-revenue ranking)	scoped	row visible; cost+profit cols gated by report:shop_profit ✓	OK; same numbers, just centralized
12	Low Stock Alert	SUMMED qty across shops in all-shops mode	calculateLowStock returns one row per (shop, product) pair in all-shops mode; shop name shown next to the product	scoped	report:shop_inventory ✓	Yes — fixed
13	Recent Sales	last 5 NORMAL sales	unchanged; per-sale Profit still gated by report:shop_profit	scoped	route + report:shop_profit for profit	OK
Permission gating: Was already correct (canViewProfit / canViewInventory checks all the right cards). No changes required to the gating itself.

Route gating: /app/dashboard requires report:shop_sales — ADMIN + MANAGER hold it; CASHIER + BUYER do not. Confirmed correct.

Current formulas found (in code before this change)
Two competing revenue formulas in the same page: the Total Revenue card showed sum-of-line-totals (pre-cart-discount) while the Sales Trend chart used sale.totalMmk (post-cart-discount). With cart discounts applied, the two disagreed.
Sum-across-shops in admin all-shops mode for both lowStockProducts (DashboardPage) and stockHealth (useDashboardInsights). An admin could miss a completely empty shop because another shop had inventory.
No refund handling: gross revenue with no adjustment for approved PARTIAL refunds.
Cost of goods uses current product cost (because sale_items has no unit_cost_mmk column). Acceptable approximation but undocumented.
Bugs fixed
KPI ↔ chart revenue disagreement.
Per-shop low-stock visibility in all-shops mode (now per-(shop, product) row with shop name).
Stock-health worst-shop classification in all-shops mode.
Net-revenue accounting (subtracts approved PARTIAL refund amounts; card subtitle flips to Net of X refunds (gross Y) when applicable).
No-NaN/no-Infinity guarantees on profit margin and AOV when data is empty.
Defensive non-admin-without-shop blocked state instead of silent "all-shops" → "see nothing" fallthrough.
Bugs documented (not fixed — outside scope)
Cost-of-goods uses current product cost (no captured cost). Listed in 04-features-workflows.md Dashboard section with a pointer to the roadmap item for adding unit_cost_mmk to sale_items.
Files changed
File	Change
src/features/dashboard/dashboardMetrics.ts	New. scopeSales, calculateGrossRevenue, calculateRefundDeductions, calculateNetRevenue, calculateSalesCount, calculateCostOfGoods, calculateProfit, calculateProfitMargin, calculateAvgOrderValue, calculateInventoryValue, calculateLowStock, calculateTopProducts, calculateCategoryRevenue, decorateLowStockWithShopName, calculateSupplierDebt
src/features/dashboard/dashboardMetrics.test.ts	New. 34 vitest cases covering scope, refund deductions, net revenue (floored at 0), gross/cost/profit/margin/AOV with no-NaN guarantees on empty data, inventory value per-shop and aggregate, per-shop low-stock (never sums across shops), top products ranking, category split, supplier debt RECEIVED-only rule
src/pages/DashboardPage.tsx	Rewired to use helpers; refund-aware Total Revenue subtitle; per-(shop, product) low-stock rows in all-shops mode; non-admin-without-shop blocked state
src/hooks/useDashboardInsights.ts	stockHealth all-shops mode now classifies per worst-shop instead of summing; totalRevenue / totalCost / totalProfit re-routed through the shared helpers so insights agree with the headline
docs/04-features-workflows.md	New "Dashboard" section: per-card formulas, cost approximation caveat, no-sum-across-shops rule, sensitive-card gating table
docs/05-roles-permissions.md	New "Dashboard" callout with role visibility + gating summary
docs/08-testing-qa.md	Vitest count bumped to 22/297; helpers row added; new "Dashboard QA" checklist covering role, shop scope, VOID/REFUNDED exclusion, refund deduction subtitle, cart-discount KPI↔chart parity, empty-data zero behaviour, per-shop low stock
Helper / test counts
src/features/dashboard/dashboardMetrics.ts — 16 exported helpers, all pure
src/features/dashboard/dashboardMetrics.test.ts — 34 cases passing
Full suite: 22 files / 297 tests passing (up from 21 / 263)
Verification
npx tsc -b — clean
npx vitest run — 297/297 pass
npm run build — succeeds; pre-existing chunk-size warning unchanged
Remaining risks
Cost-of-goods drift. Until sale_items.unit_cost_mmk exists, all historical profit/cost numbers reflect today's product costs. A bulk supplier price change makes last month's profit chart shift. Documented in 04-features-workflows.md; needs a DB migration + RPC update + frontend backfill before it can be fixed. Filed implicitly via the helper docstring; consider adding to 09-roadmap-todo.md formally.
Cart-discount and per-product/per-category numbers diverge from the headline. When a sale has a cart discount, sum(lineTotalMmk) > sale.totalMmk. Top Products / Sales by Category use line totals; KPI uses sale totals. This is the only sensible per-product split available without a column for "post-cart-discount allocated revenue per item." Documented; ranking is still meaningful.
stockHealth daysUntilStockout is null in all-shops mode. A fast-mover risk panel in all-shops view will say "no days-until-stockout signal." Per-shop view still has it. Trade-off documented; the alternative would mix shop A's velocity with shop B's qty and mislead.
No DOM / React Testing Library coverage for the page itself — helpers + tsc + the QA checklist guard correctness; full Playwright dashboard suite still pending (listed in the existing Recommended Playwright table).
Insights (useDashboardInsights.lossCauses) still ranks per-product losses by line-totals (because that's the only per-product breakdown). When cart discounts are large, a product can be classified as a "loser" while the headline shows profit. Acceptable for an alert list; documented in helper header.
Implemented the dashboard audit/redesign as a frontend-only change. No backend/RPC/RLS changes were made.
Changed
Split dashboard into role-specific components:DashboardPage.tsx (line 1)
AdminDashboard.tsx (line 1)
ManagerDashboard.tsx (line 1)
CashierDashboard.tsx (line 1)

Added shared dashboard UI helpers in DashboardCommon.tsx (line 1).
Extended formula helpers/tests in dashboardMetrics.ts (line 1) and dashboardMetrics.test.ts (line 1).
Audit Findings / Formulas
Revenue: NORMAL sales only, sum(sale.totalMmk) - approved PARTIAL refunds, floored at 0.
Orders: count of scoped NORMAL sales.
Avg Order Value: rounded whole MMK, returns 0 on empty data.
Sales by Category: sale_items.lineTotalMmk by product.category.
Top Selling Products: line revenue ranking, NORMAL sales only.
Inventory Alerts: (shop_id, product_id) inventory rows, never global product quantity.
Supplier Debt: RECEIVED POs only, unpaid/partial amount = totalMmk - paidMmk.
Expected Cash: open shifts, opening cash + cash sales where status is not VOID - approved partial cash refunds.
Pending cards: REQUESTED refund/voids, APPROVED POs awaiting receipt, PENDING transfers.
Admin shop metrics: per-shop revenue/orders/AOV/open shifts/debt, profit/margin only if allowed.
Bugs Fixed
Avg Order Value no longer shows long decimals.
Date range filtering now excludes future-dated sales.
Removed fake 999d slow-mover values; no-sales products no longer get invented days-of-stock.
Dashboard scope and sensitive-card visibility are now covered by unit tests.
Manager/admin dashboards now derive all KPI/list/chart math from shared helpers.
Layout Changes
Manager: compact KPI row, Recent Sales moved near top, Top Products compacted, Inventory Intelligence replaced by Action Needed + Inventory Alerts, smaller lower-priority Sales by Category, added Cash vs Other.
Admin: all-shop/single-shop selector, compact KPI row, Shop Performance, Revenue by Shop, Low Stock across shops, Pending Approvals, Active Staff/Open Shifts, Supplier Debt groups, Recent Audit, Recent Sales.
Cashier: if explicitly granted dashboard access, only own-shift/own-sales summary and shortcuts. No profit/cost/global data.
Role / Permission Behavior
ADMIN can see all shops or selected shop.
MANAGER is locked to assigned shop.
CASHIER has no default dashboard access; explicit access shows own-shift data only.
BUYER has no default dashboard access; sales/profit remain hidden unless explicit report permissions are granted.
Profit/cost requires report:shop_profit.
Supplier debt requires supplier:debt_view.
Inventory alerts require report:shop_inventory.
Audit requires audit:view_global.
Docs Updated
04-features-workflows.md (line 395)
05-roles-permissions.md (line 180)
08-testing-qa.md (line 93)
Verification
npx tsc -b: passed.
npm test: passed, 22 files / 329 tests.
npm run build: passed.
Build warnings remain for large bundle size and existing mixed static/dynamic supabase.ts imports.
Dev server is running at http://127.0.0.1:5173/.
Remaining Risks
Profit/cost still uses current product cost because sale items do not store historical unit cost.
Current-state cards like supplier debt, open shifts, pending receipts, and low stock intentionally stay visible regardless of sales date range so old unresolved work is not hidden.