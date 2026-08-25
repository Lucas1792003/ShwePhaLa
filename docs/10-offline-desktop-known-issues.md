# 10 · Offline-First & Desktop — Known Issues & TODO

Status snapshot of the offline-first sync layer (local Dexie/IndexedDB
mirror, write outbox, RPC + table-write reconciliation) and the Electron
desktop wrapper. Read this before touching any of `stores/data/outbox.ts`,
`stores/data/tableWrite.ts`, `lib/localDb.ts`, or `electron/`.

## Current Windows release and recovery

- **Current public desktop release:** `v1.0.10`
- **Windows installer:**
  [Shwe-Pha-La-POS-Setup-1.0.10.exe](https://github.com/Lucas1792003/ShwePhaLa/releases/download/v1.0.10/Shwe-Pha-La-POS-Setup-1.0.10.exe)
- **Full release:**
  [Shwe Pha La POS v1.0.10](https://github.com/Lucas1792003/ShwePhaLa/releases/tag/v1.0.10)

If an older installer is showing **"Shwe Pha La POS cannot be closed"**,
cancel it. Do not uninstall the existing app and do not clear AppData. Run
the v1.0.10 installer normally. If recovery is still needed, end every
`Shwe Pha La POS.exe` entry in Task Manager and retry.

### v1.0.7–v1.0.9's actual root cause, found and fixed in v1.0.10

Three rounds of fixes (v1.0.7, v1.0.8, v1.0.9 — single-instance lock, a
hard-exit timeout, an external `taskkill` watchdog spawned from
`electron/main.cjs`) all targeted the same thing: making sure the old app
process was really dead before the installer ran. **All three were fixing
the wrong code path.** Confirmed by reading electron-builder's own NSIS
templates directly (`node_modules/app-builder-lib/templates/nsis/`) and by
instrumenting its source to verify `build/installer.nsh` actually gets
included (it does, correctly, in the right order):

- `customCheckAppRunning` (what `build/installer.nsh` overrides) only
  replaces the **pre-flight** "is the app already running" check in
  `allowOnlyOneInstallerInstance.nsh`. Once that macro is defined, this
  check is bypassed entirely — it was never the source of the dialog.
- The exact "`${PRODUCT_NAME}` cannot be closed" message box actually
  being shown comes from a **separate, non-customizable** retry loop in
  `extractAppPackage.nsh`'s `extractUsing7za`: it attempts
  `CopyFiles /SILENT` into `$OUTDIR`, and if a target file is still
  locked, retries only **5 times with a 1-second gap (~5 seconds total)**
  before giving up and showing that dialog — regardless of anything
  `customCheckAppRunning` does.
- The old macro's flat `taskkill` + `Sleep 1500` wasn't giving Windows
  enough real time to release the file lock (most likely antivirus
  real-time scanning re-locking the freshly-terminated 100MB+ exe) before
  that 5-second extraction-retry window ran out.

**Fix (v1.0.10)**: `build/installer.nsh`'s `customCheckAppRunning` now
loop-verifies via `tasklist`/`findstr` that the process is actually gone
(up to ~7.5s) instead of trusting a fixed sleep, then adds a further 2s
settle buffer — giving the extraction step's 5-second retry window much
more real time margin before it ever starts, rather than racing it.
Verified the macro compiles correctly via a real local Windows
cross-build (`electron-builder --win`) before publishing — **still needs
real-Windows-hardware confirmation of an actual v1.0.9 → v1.0.10 (or any
older version → v1.0.10) in-app update**, since NSIS runtime behavior
under real antivirus/disk conditions can't be verified from this
environment.

Release verification completed before publication: 12/12 artifacts were
present with matching local/remote sizes, `latest.yml` points to the
v1.0.10 Windows installer, 652 automated tests passed, and the Electron
production build passed.

### Still reproducing after v1.0.10 — a real remaining gap found, diagnostics added (2026-08-25)

The user hit "cannot be closed" again on a build that already includes
v1.0.10's fix, with the same Task Manager evidence as before (`tasklist |
findstr /I "Shwe"` shows only the Setup process; `findstr /I "electron"`
shows nothing). Re-read `extractAppPackage.nsh`'s `extractUsing7za` in
full this time, not just its retry-count/timing:

- `CopyFiles /SILENT "$PLUGINSDIR\7z-out\*" $OUTDIR` copies the **entire
  unpacked app in one batch** — the exe, every Chromium runtime DLL
  (`ffmpeg.dll`, `libEGL.dll`, `libGLESv2.dll`, `vk_swiftshader.dll`,
  `vulkan-1.dll`, `d3dcompiler_47.dll`), every `.pak`/`.dat`/`.bin`
  resource, and the `locales\` folder — not just the exe.
- v1.0.10's `waitForWritableFile` probe (`build/installer.nsh`) only
  checks **two** of those files: the exe and `resources\app.asar`. If any
  *other* file in that batch is still transiently locked (most plausible:
  Windows hasn't finished releasing a memory-mapped DLL, or AV is
  scanning it, right after the old process exited), the pre-check reports
  clear, extraction starts, `CopyFiles` fails on the untested file, burns
  through its fixed 5×1s retry, and shows the dialog — matching the exact
  repro (no process, dialog still fires) precisely, because the lock was
  never process-held to begin with by the time the check ran.

This is a genuine coverage gap in the v1.0.10 fix, not a new theory —
same root site, just an incomplete fix the first time.

**Not fixed yet.** Per explicit instruction, this round is
**diagnostics-only** — the locking/wait strategy is intentionally
unchanged so the next repro tells us exactly which file/step fails before
committing to a fix:

- `build/installer.nsh` gained: a header log (`PRODUCT_NAME`,
  `APP_EXECUTABLE_FILENAME`, `$INSTDIR`, and the previously-registered
  `InstallLocation` from the registry, flagged if they mismatch), a
  one-shot (non-blocking) writability probe of the exe/app.asar/every
  named Chromium runtime file/`locales\en-US.pak`, a generic sweep of
  every other top-level file in `$INSTDIR`, and a `customInstall` hook
  that confirms extraction actually completed. Each failed probe decodes
  the real Win32 error via `GetLastError()` (32=sharing violation/real
  lock, 5=access denied/permissions, 2/3=not found/path mismatch,
  19=write-protected) instead of guessing "locked" vs. "permission
  denied" apart.
- **Important correction to the v1.0.10 write-up above and to earlier
  advice in this investigation:** electron-builder's `common.nsh` sets
  `ShowInstDetails nevershow` unconditionally — the installer's
  details/log pane is **never** shown through the UI, in one-click or
  assisted mode. A bare `DetailPrint` (all v1.0.10's diagnostics used) is
  therefore invisible to the user; it was never actually retrievable
  through the installer window. Every new diagnostic line now also writes
  to `%APPDATA%\retails-shop\logs\installer-diagnostics.log` (note:
  `retails-shop`, from package.json's `name` field — not "Shwe Pha La
  POS" — verified against `app.getPath("userData")`'s actual resolution,
  not assumed). That log file, alongside the pre-existing
  `%APPDATA%\retails-shop\logs\updater.log`, is now the only reliable way
  to see this output.
- `electron/main.cjs`'s existing update-lifecycle logging (added
  alongside v1.0.11) now also includes the current app version and the
  update's target version on the `update available`, `download complete`,
  `restart requested`, and `quitAndInstall called` lines, not just that
  those events happened.
- Verified via the same real local Windows cross-build
  (`electron-builder --win --x64`, native macOS `makensis`, no Wine) —
  this pass caught a genuine NSIS bracket-nesting bug (`Cannot use Else
  without a preceding If`) on the first compile attempt, fixed, and
  reconfirmed clean on the second. 652 automated tests and lint
  unaffected (only `build/installer.nsh` and logging lines in
  `electron/main.cjs` changed; no `src/` behavior touched).
### v1.0.12 real reproduction results — extraction-file-lock theory disproven

Published as `v1.0.12` and reproduced on a real Windows machine updating
from `v1.0.10`. `installer-diagnostics.log` came back clean across three
separate full update attempts: `$INSTDIR` matched the registered
`InstallLocation` exactly, and **every single file was `writable OK`** —
the named list, the generic top-level sweep (which even caught two files
not on the named list, `dxcompiler.dll`/`dxil.dll`), all clean. The log
then stops exactly at "Probe complete. Proceeding to uninstall the old
version, then extract the new one." — the dialog fires somewhere after
that point, in one of the two remaining un-instrumented steps.

This **disproves the leading theory** (an untested Chromium runtime file
being transiently locked) — literally everything we can check was fine.
Also confirmed: fails **deterministically**, all 3 separate full update
attempts, not intermittently (rules out a one-off AV-scan timing fluke);
clicking Cancel quits cleanly with the old v1.0.10 install fully intact
and working (whatever's failing, it's failing *before* any old files
actually get touched).

**Key realization:** `uninstallOldVersion` (part of the *new* installer)
silently runs the *old* version's own already-compiled
`Uninstall Shwe Pha La POS.exe` to remove the previous install. That
binary predates all of this diagnostic logging — even though its
`un.checkAppRunning` does route through the same `customCheckAppRunning`
macro we've customized since v1.0.10, it's running v1.0.10's *original*
version of it, with zero ability to write to
`installer-diagnostics.log`. So the old-uninstall step has been
completely invisible to us this whole time — not uncovered by choice,
but literally running different, older compiled code than what we've
been instrumenting.

**Added (still diagnostic-only): `customUnInstallCheck` /
`customUnInstallCheckCurrentUser`.** These hooks fire in the *new*
installer right after the old-uninstall step returns, so — unlike
everything above — closes the blind spot from *this* side. Unlike the
purely-additive diagnostics so far, this one required replacing
electron-builder's own `handleUninstallResult` logic entirely (that's
how the hook works — once defined, it owns the whole result-check, no
"run theirs then also run mine"), so the exact original checks
(`IfErrors`, `$R0 != 0`, the `uninstallFailed` MessageBox,
`SetErrorLevel 2` + `Quit`) were copied verbatim from
`installUtil.nsh`'s `handleUninstallResult` Function, with `diagLog`
calls added around them and named labels used instead of their
relative `+3`-style jumps (a relative offset silently breaks if a line
is ever added above it; a named label can't). Compile-verified clean on
the first attempt via the same real `electron-builder --win --x64`
cross-build. Once reproduced again, the log will say definitively
whether the old-uninstall step succeeded (pointing squarely at
extraction instead) or failed with a real exit code (pointing at the old
uninstaller itself). **Not yet pushed/released as of this addition.**

## ✅ Fixed — offline login (was: 🔴 critical bug)

**`src/stores/authStore.ts`'s `restoreSession()`** used to always require the
network (`resolveAppUser()` queries the `users` table, and for ADMIN
`readMfaState()` calls `supabase.auth.mfa.*`). If the device was offline at
app boot, `resolveAppUser()` failed, the error was only `console.error`'d,
and the store logged the user out — even though
`supabase.auth.getSession()` had already proven they had a valid, unexpired
local session. Net effect: closing and reopening the app while offline
locked the cashier out entirely.

**Fixed**, per the original 24-hour offline-trust-window decision:
- `restoreSession()` now catches a network-classified failure from
  `resolveAppUser()` (via `isNetworkError()` from `lib/errors.ts`, which
  checks `navigator.onLine` first) and falls back to a **locally cached
  copy of the resolved app user** — role, shop, active flag, `hasTotp` —
  instead of treating it as "not logged in." A genuine non-network error
  (RLS/data problem) still does **not** fall back and still logs out, since
  that's not a connectivity issue.
- The cache (`lib/localDb.ts`'s `authCache` table, keyed by Supabase auth
  id) is written every time `resolveAppUser()` succeeds — in
  `restoreSession()` and in `login()` (including the first-admin-signup
  path) — and cleared on `logout()`.
- A cache entry older than 24h (`OFFLINE_SESSION_TRUST_MS` in
  `authStore.ts`) is not honored — falls back to the pre-fix "log out"
  behavior rather than trusting a potentially-stale role/active flag
  indefinitely.
- An ADMIN restored from cache does **not** get an automatic `aal2`
  step-up (no network means no way to actually re-verify TOTP) — they fall
  through to `isVerifiedThisSession()` exactly as before, so a fresh
  offline session for an admin still lands on `/verify`, while a
  mid-session reload (already verified this browser session) keeps working.
- Tests: `src/stores/authStore.offline.test.ts` (fresh cache used, no
  cache logs out, stale cache logs out, genuine error doesn't use cache,
  cached ADMIN doesn't get a fake step-up, online path refreshes the cache).

**Also fixed along the way:** `stores/data/tableWrite.ts`'s `writeTableRow()`
was firing its local-cache mirror write (`mirrorLocally()`) without awaiting
it, so the function's returned promise could resolve before the local
IndexedDB write actually finished — a caller depending on the local mirror
being up to date immediately after `writeTableRow()` resolves could
occasionally read stale data. Found via a newly-flaky test, not a code
review — now awaited in both the online-success and queued-for-later paths.

## ✅ Fixed — wrong password misreported as "User already registered"

**`src/stores/authStore.ts`'s `login()`** decided whether to allow
first-time-admin signup by reading the `users` table *before*
authenticating, to check "is this table empty?" But `users`' SELECT RLS
policy is `TO authenticated` only (migration 010) — an anonymous read
always comes back empty regardless of how many users actually exist. So
**any** failed sign-in (most commonly: an existing user just mistyping
their password) was misdiagnosed as "first-time setup" and routed into a
`supabase.auth.signUp()` call, which correctly rejected with "User already
registered" for any account that already existed — a confusing, wrong
error shown instead of "Invalid email or password."

**Fixed**: removed the broken pre-check entirely. On a failed sign-in, the
code now just attempts `signUp()` and treats Supabase's own response as
the source of truth — an "already registered" result means the email has
an account, so the *original* sign-in failure was real bad credentials
("Invalid email or password."); any other `signUp()` error (rate limit,
etc.) is surfaced as-is instead of being masked. The second, later
`users`-table-empty check (used once actually authenticated, to decide
whether to auto-create the first ADMIN row) was already correct and
untouched — it runs with a session, where the `authenticated` policy
applies. Tests: `src/stores/authStore.login.test.ts`.

This bug affected the web app too, not just desktop — it wasn't
Electron-specific, just more likely to be hit there since offline/first
runs increase the odds of a failed sign-in attempt.

## Deliberately out of scope (not bugs)

These were explicit, discussed decisions during the build — documented here
so they don't get mistaken for oversights, and so whoever picks up further
offline work knows exactly what's covered vs. not.

| Area | Stays online-only | Why |
| --- | --- | --- |
| Sales | `voidSale`, `requestVoid`, `requestRefund` approval (`approveRefund`) | Only the *request* creation (`create_refund_void_request`) is offline; approving is a manager desk action with its own permission/state checks. |
| Purchasing | `createPurchaseOrder`, `approvePurchaseOrder`, `cancelPurchaseOrder`, `paySupplierLumpSum`, `voidSupplierPayment` | Desk/admin operations. Only `receivePurchaseOrder` (loading-dock, time-critical) and `recordSupplierPayment` are offline. |
| Transfers | `createTransfer`, `approveTransfer`, `rejectTransfer`, `cancelTransfer` | Desk/planning operations. Only `dispatchTransfer` and `receiveTransfer` (both physical, at-the-shop actions) are offline. |
| Catalog | `products` (+ `product_barcodes`, `product_units`, `supplier_products`), `product_unit_prices` (`priceLevelSlice.ts`) | Multi-row batch writes (delete-then-reinsert, upsert-many) — a materially different shape than the single-row `writeTableRow()` helper Phase 4 built. Product catalog editing is back-office work, not floor-critical. |
| Admin | `business_profile` singleton update | Keyed `"default"`, not `id` — doesn't fit the generic table-write helper's shape. Rare, low-urgency edit. |

If any of these need offline support later, the *pattern* to follow is
already established:
- Single-row CRUD with no server invariants → extend `tableWrite.ts`'s
  `LOCAL_TABLES` map and swap the slice's raw `supabase.from(...)` call for
  `writeTableRow(...)` (see `categorySlice.ts` / `brandSlice.ts` for the two
  variants: fire-and-forget vs. optimistic-with-rollback).
- Server-computed / atomic RPC → mirror the pattern in `saleSlice.ts` /
  `purchaseSlice.ts`'s `receivePurchaseOrder`: a `*Online` / `*Offline` pair,
  a `reconcile*` function registered via `registerOutboxReconciler`, and —
  if the offline write can reference something else created offline in the
  same session (e.g. a sale referencing a shift opened offline) — an
  `enqueueOutbox({ refs: [...] })` entry so `outbox.ts` waits for the
  dependency's real id before replaying. See `shiftSlice.ts` +
  `recordIdMapping()` for the concrete example.

## Known gaps / polish TODO

- [x] **Pending-sync badges.** Now on `SalesTable.tsx`, `MovementsTable.tsx`,
      `TransfersPage.tsx`, `PurchasesPage.tsx`,
      `features/shifts/pages/ShiftsPage.tsx`, and the payment history table
      on `SupplierDetailPage.tsx` — every entity that carries `pendingSync`
      now shows it somewhere in its list view.
- [x] **Sync Conflicts page labels.** `pages/SyncConflictsPage.tsx`'s
      `describeEntry()` now also formats `table_write` entries (e.g.
      `categories.insert` → "Category Added") via `TABLE_LABELS`/`OP_LABELS`,
      not just the RPC-backed flows.
- [x] **Delta pull-sync — wired up**, with a real, deliberate limitation.
      `stores/data/deltaSync.ts` pulls only rows changed since the last
      cursor for the 11 tables with reliable `updated_at` tracking
      (`categories`, `brands`, `unit_types`, `products`, `product_units`,
      `price_levels`, `product_unit_prices`, `suppliers`, `purchase_orders`,
      `stock_transfers`, `shifts`). `stores/data/index.ts`'s `loadData()`
      now calls `bootstrapDeltaCursors()` after every full load to seed/
      refresh the cursors; `AppLayout.tsx`'s routine background refresh
      (30s-throttled focus regain + 120s interval) now calls the new
      `pullDeltas()` store action instead of a full `loadData({force:true})`.
      **The reconnect-after-offline path and cold boot still do a full
      reload on purpose** — delta pull can't detect a hard-deleted row (only
      `products` supports a real hard delete, via the `delete_product` RPC;
      everything else is soft-delete via `is_active`, which delta *does*
      catch correctly since it's just an UPDATE). Every other table (shops,
      users, inventory, movements, sales, sale_items,
      purchase_order_items, stock_transfer_items, supplier_payments,
      supplier_products, price_tiers, product_barcodes,
      refund_void_requests, reprint_logs, audit_logs, business_profile)
      still has no reliable change-tracking column and keeps being fully
      reloaded — extending delta sync to any of them needs another
      migration first (add `updated_at` + trigger, following 044's pattern).
      Tests: `stores/data/deltaSync.test.ts`.
- [x] **Stuck outbox entries are now flagged.** `outbox.ts`'s `drainOutbox()`
      marks any entry that's had unresolved `refs` for more than 24h
      (`STUCK_ENTRY_MAX_AGE_MS`) as a `conflict` with an explanatory
      message, instead of leaving it silently `pending` forever — it now
      shows up on the Sync Conflicts page like any other conflict.
- [x] **`provisionalIdMap` is now pruned.** `recordIdMapping()` stamps a
      `createdAt`; `drainOutbox()` sweeps out anything older than 7 days
      (`PROVISIONAL_MAP_MAX_AGE_MS`) at the start of every drain pass.
- [x] **Offline writes now preserve their real event time, not sync time.**
      Every offline-eligible RPC (`complete_sale`, `adjust_stock`,
      `receive_purchase_order`, `dispatch_stock_transfer`,
      `receive_stock_transfer`, `open_shift`, `close_shift`,
      `record_supplier_payment`, `create_refund_void_request`) used to
      stamp its row with the server's `now()` — for a write queued in the
      outbox, that's when it *syncs*, not when it actually happened. A
      sale rung up offline at 3pm that didn't sync until 9pm showed up in
      reports, receipt numbering, and shift reconciliation as a 9pm sale.
      Migration `045` adds an optional `p_created_at` param to each RPC and
      a shared `resolve_event_time()` helper that trusts it only within a
      sane bound (5 min future / 48h past — otherwise falls back to real
      `now()`, so a compromised client can't arbitrarily backdate
      financial/inventory records). The client (each slice's
      `build*Args()`/inline RPC-arg builder) now sends the same timestamp
      used for the local/offline provisional record, for both the
      immediate-online and queued-offline paths, so the two can never
      drift apart. Tests: `saleSlice.offline.test.ts` and
      `shiftSlice.offline.test.ts` each pin that the queued arg matches
      the local record's own timestamp.
- [ ] **Bundle size.** `npm run build` warns the main chunk is ~1.76 MB
      (~481 KB gzipped) — pre-existing, not caused by this work, but the
      new Dexie/outbox/delta-sync code adds to it. `vite.config.ts` has no
      `manualChunks` split yet (see `09-roadmap-todo.md`'s existing
      "Code splitting" item — deliberately left there, not duplicated here,
      since it isn't specific to the offline work).

## Electron desktop wrapper

- [x] **Build pipeline verified end-to-end on real hardware.** `npm run
      electron:build:mac` / `:win` (run directly on the user's own Mac, not
      this dev sandbox) produced real, working installers — Mac (arm64 +
      x64 `.dmg`), Windows (x64 `.exe`) — published to a GitHub Release and
      installed via the in-app Download button (`DownloadAppModal.tsx`).
      `npm run electron:dev` (the live-reload dev flow) is still unverified,
      as is actually opening/using the packaged app post-install.
- [x] **Fixed — Windows blank white screen after install.** `vite.config.ts`
      had no `base` set, so `npm run build` emitted absolute asset paths
      (`src="/assets/index-*.js"`). That's correct for the web deploy
      (Vercel rewrites every route to `index.html`, so assets must resolve
      from the domain root) but breaks Electron, which loads
      `dist/index.html` via `file://` — an absolute path there resolves
      against the filesystem root, not `dist/`, so the script/CSS silently
      fail to load and the window renders blank. Fixed with a conditional
      `base` (`process.env.ELECTRON_BUILD === 'true' ? './' : '/'`) and a
      new `build:electron` script (`tsc -b && cross-env
      ELECTRON_BUILD=true vite build`) that the `electron:build*` scripts
      now use instead of the shared `build` script. Verified by grepping
      `dist/index.html` after each build: `npm run build` still produces
      `/assets/...`, `npm run build:electron` now produces `./assets/...`.
      Shipped in v1.0.1.
- [x] **Partial mitigation — macOS "app is damaged" Gatekeeper block.**
      Root cause: the packaged `.app` was completely unsigned, and current
      macOS Gatekeeper refuses to open an unsigned, quarantined app
      downloaded from the internet with a hard "is damaged, move to Trash"
      dialog rather than the older "unidentified developer, right-click to
      Open" warning. Added `electron/afterPack.cjs`, an electron-builder
      `afterPack` hook that ad-hoc code-signs the `.app` (`codesign
      --force --deep --sign -`) after packaging — free, no Apple Developer
      account needed. Confirmed applied via `codesign -dv` showing
      `Signature=adhoc` on the rebuilt app. **This is not a guaranteed full
      fix** — ad-hoc signing typically softens the block to the
      bypassable "unidentified developer" warning, but the newest macOS
      Gatekeeper policies may still show "damaged" for a downloaded,
      non-notarized app. A user who still hits "damaged" after this can
      manually clear the quarantine flag (`xattr -cr
      "/Applications/Shwe Pha La POS.app"`). The only complete, guaranteed
      fix is real Apple notarization, which needs a paid ($99/yr) Apple
      Developer account — not set up. Shipped in v1.0.1.
- [x] **Fixed — v1.0.2 accidentally re-shipped the white-screen bug.**
      `dist/` is shared between the web build and the desktop build, and
      only differs in `vite.config.ts`'s `base` (see the v1.0.1 fix
      above) depending on whether `ELECTRON_BUILD=true` was set for that
      particular `vite build` run. v1.0.2 was published by running
      `electron-builder` directly right after a plain `npm run build`
      (done for web-deploy verification) without an intervening
      `npm run build:electron` — electron-builder just packages whatever
      is already sitting in `dist/`, it does not build anything itself,
      so it silently packaged the web (absolute-path) build into both the
      Mac and Windows installers. Confirmed on a real Mac install via
      DevTools (Cmd+Option+I): `net::ERR_FILE_NOT_FOUND` on
      `/assets/*.js`. **Rule going forward**: never run `electron-builder`
      directly — always go through `npm run electron:build:mac` /
      `:win` (which chain `build:electron` first), or if invoking
      `electron-builder` directly for a combined `--mac --win --publish`
      run, run `npm run build:electron` as the immediately preceding
      command with nothing in between that could touch `dist/` again.
      Worth double-checking before any publish: `grep -o 'src="[^"]*"'
      dist/index.html` should show `./assets/...`, not `/assets/...`.
      Fixed in v1.0.3 (v1.0.2's release was left in place but is broken
      on both platforms — don't point anyone at it).
- [x] **Superseded mitigation — Windows updater could leave NSIS waiting for
      the app to close.** After choosing **Restart now**, the v1.0.6 updater
      could reach
      the installer and then show "Shwe Pha La POS cannot be closed" because
      Windows still saw an app process holding the installation directory.
      There were two gaps: the desktop app did not hold Electron's
      single-instance lock (so a second/background instance could survive the
      requesting instance), and `quitAndInstall()` relied entirely on the
      normal asynchronous `app.quit()` handoff. v1.0.7 added
      `app.requestSingleInstanceLock()` before ready, focuses the primary
      window on a second launch, and adds a Windows-only 1.5-second hard-exit
      fallback after the detached NSIS installer was started. A real
      v1.0.7 → v1.0.8 test confirmed that timer did not prevent the failure.
- [x] **Superseded — installer-level Windows updater cleanup (v1.0.9).**
      electron-builder 26.15.x checks only the new `$INSTDIR` for running
      processes; this app's assisted installer allows a custom directory,
      so it can miss a running prior installation. v1.0.9's
      `customCheckAppRunning` override force-closes the exact
      `Shwe Pha La POS.exe` process tree regardless of path, and the app
      launches an independent delayed `taskkill` helper before
      `quitAndInstall()`. **A real v1.0.7 → v1.0.9 test still reproduced
      the exact same "cannot be closed" dialog** — this fix (like v1.0.7's)
      targeted the wrong code path. See "v1.0.7–v1.0.9's actual root
      cause, found and fixed in v1.0.10" above for what was actually
      wrong and the real fix. This entry is kept for history/context, not
      because it worked.
- [x] **Fixed — sidebar update and logout buttons overlapped.** In the expanded
      270px desktop sidebar, both text-heavy actions were forced into equal
      columns. v1.0.8 stacks them as full-width rows, which also keeps longer
      updater labels such as download progress and restart prompts readable.
- [ ] **No cash-drawer support.** `electron/main.cjs` only wires silent
      receipt printing (`webContents.print()` to a system printer). Kicking
      a cash drawer needs either a drawer-kick ESC/POS command embedded in
      the print job (printer-model-specific) or direct USB/serial access —
      both need real hardware to implement and verify.
- [ ] **No printer-picker UI.** `preload.cjs` exposes `listPrinters()` (via
      `webContents.getPrintersAsync()`) but nothing in the app calls it —
      `printReceipt()` always uses the OS default printer, which is fine for
      most single-printer tills. Deliberately not built yet: it's a
      per-device preference (belongs in `localStorage`, not the synced
      `business_profile`), there's no existing "device settings" page it
      naturally fits (`ProfilePage.tsx` is business-brand identity, not
      hardware), and it's UI that can't be visually/functionally verified
      without a real Electron window and real printers. Natural next step
      once there's a real device to test against.
- [ ] **No app icon.** `package.json`'s `build` (electron-builder) config
      has no `icon` set for `mac`/`win` — packaged builds use Electron's
      default icon until one is added.
- [x] **Auto-update wired up, with a real caveat.** `electron/main.cjs`
      checks GitHub Releases via `electron-updater` on launch and every 4h,
      downloads in the background, and prompts to restart via a native
      dialog. `package.json`'s `build.publish` points at this repo; a new
      version ships via `electron-builder --mac --win --publish always`
      (with `GH_TOKEN` set — `export GH_TOKEN=$(gh auth token)` works if
      you're logged in via `gh`), **then `gh release edit v<version>
      --draft=false`** — electron-builder publishes releases as drafts by
      default, which are not publicly downloadable, easy to miss.
      **The real caveat**: on macOS, electron-updater's install step
      (Squirrel.Mac) requires the app to be code-signed. Our builds aren't
      (no Apple Developer certificate) — an update will likely be detected
      and downloaded but may fail to actually apply. Windows (NSIS) has no
      such requirement and should auto-update fine even unsigned.
      `mac.target` now includes `zip` alongside `dmg` — electron-updater's
      Mac update mechanism needs the zip artifact even though the dmg is
      what a fresh install uses.
      **Recurring publish gotcha (confirmed again through v1.0.10):**
      `--publish always` can report success while the GitHub Release ends up
      incomplete — v1.0.9 initially had 11 of the 12 expected assets. This is
      an upload problem, not a build problem (every file existed correctly
      locally). Always verify after publishing:
      `gh release view v<version> --json assets --jq
      '.assets[] | "\(.name) \(.size)"'` and compare against the local
      `release/` folder; if assets are missing, finish the upload manually
      with `gh release upload v<version> <missing files> --clobber`.
- [ ] **Barcode label printing was deliberately left on `window.print()`**
      (`pages/BarcodeLabelsPage.tsx`) — per `06-ui-printing-hardware.md`,
      operators currently rely on the OS print dialog to pick matching
      label stock; switching it to silent printing would remove that choice.

## Testing gaps

- **The v1.0.10 Windows updater fix needs real-hardware confirmation.**
  v1.0.7 and v1.0.9 both reproduced the exact same "cannot be closed"
  dialog on real hardware despite targeting the app-running pre-check —
  the actual failing check turned out to be a separate, non-customizable
  5-second file-copy retry loop in electron-builder's own
  `extractAppPackage.nsh` (see "v1.0.7–v1.0.9's actual root cause" above).
  v1.0.10 gives that retry window much more real time margin by
  loop-verifying the old process is gone instead of trusting a fixed
  sleep. Confirmed compiling correctly via a real local Windows
  cross-build; **not yet confirmed on real Windows hardware** — the
  decisive test is any older version → v1.0.10: confirm the installer
  closes every app process, completes with no manual Retry dialog, and
  relaunches the updated app once.
- **No real Supabase project was ever exercised.** This repo has no
  `.env.local` configured, so nothing above has been clicked through in an
  actual browser or Electron window against live data — only via `npm run
  build`, `npm run test` (Vitest + `fake-indexeddb`), and `npm run lint`.
  Before trusting this in production: set up a project, run through a full
  offline → reconnect cycle for each flow in this doc's "deliberately in
  scope" list, and watch the Sync Conflicts page.
- **No browser-level E2E** (Playwright) for any offline flow — matches the
  pre-existing gap noted in `08-testing-qa.md` for the rest of the app.
- **`AppLayout.tsx`'s offline/syncing badges have no test coverage** — they're
  simple enough (`!isOnline` / `isOnline && isLoading`) that this is low
  risk, but untested.

## Where the tests that do exist live

| Area | Test file |
| --- | --- |
| Offline login / auth-cache fallback | `stores/authStore.offline.test.ts` |
| Local cache round-trip | `stores/data/localSync.test.ts` |
| Delta pull-sync (cursor fetch, merge-by-id, bootstrap, error isolation) | `stores/data/deltaSync.test.ts` |
| Outbox drain / conflict / refs / concurrency / stuck entries / id-map pruning | `stores/data/outbox.test.ts` |
| Generic table-write helper | `stores/data/tableWrite.test.ts` |
| POS checkout offline | `stores/data/slices/saleSlice.offline.test.ts` |
| Refund/void request offline | `stores/data/slices/saleSlice.refundVoid.offline.test.ts` |
| Stock adjustment offline | `stores/data/slices/inventorySlice.offline.test.ts` |
| Shift open/close offline | `stores/data/slices/shiftSlice.offline.test.ts` |
| PO receive / supplier payment offline | `stores/data/slices/purchaseSlice.offline.test.ts` |
| Transfer dispatch/receive offline | `stores/data/slices/transferSlice.offline.test.ts` |
| Catalog (category/brand/shop) offline | `stores/data/slices/catalogSlices.offline.test.ts` |
| Collision-safe id generation | `lib/id.test.ts` |
