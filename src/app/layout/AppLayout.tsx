import { useEffect, useRef } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { SmallScreenGuard } from "./SmallScreenGuard";
import { Button } from "../../components/ui/Button";
import { useDataStore } from "../../stores/dataStore";
import { useConnectivityStore } from "../../stores/connectivityStore";
import { useViewportWidth } from "../../hooks/useViewportWidth";
import { supabase } from "../../lib/supabase";
import { mapInventory } from "../../stores/data/mappers";

const MIN_SUPPORTED_WIDTH = 768;

export const AppLayout = () => {
  const isLoaded = useDataStore((state) => state.isLoaded);
  const isLoading = useDataStore((state) => state.isLoading);
  const loadError = useDataStore((state) => state.loadError);
  const loadData = useDataStore((state) => state.loadData);
  const retryLoadData = useDataStore((state) => state.retryLoadData);
  const pullDeltas = useDataStore((state) => state.pullDeltas);
  const applyInventoryRealtimeUpdate = useDataStore((state) => state.applyInventoryRealtimeUpdate);
  const isOnline = useConnectivityStore((state) => state.isOnline);
  const viewportWidth = useViewportWidth();

  useEffect(() => {
    if (!isLoaded && !isLoading && !loadError) {
      void loadData();
    }
  }, [isLoaded, isLoading, loadError, loadData]);

  // loadData() bails out immediately while offline (see stores/data/index.ts)
  // rather than firing requests doomed to fail, so nothing else re-triggers
  // it once connectivity returns — do that here.
  const wasOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (isOnline && !wasOnlineRef.current) {
      void loadData({ force: true });
    }
    wasOnlineRef.current = isOnline;
  }, [isOnline, loadData]);

  // Keep the cached data fresh: re-sync when the tab regains focus/visibility
  // and on a slow interval while open. The client store is loaded once, so
  // without this a returning user would see stale debt/transfers/etc. that
  // another device changed. Throttled so rapid focus changes don't hammer the
  // backend. Uses pullDeltas() (cursor-based, only tables that support it —
  // see stores/data/deltaSync.ts) rather than a full loadData({force:true}):
  // this fires often (every 30-120s), so keeping it cheap matters. It does
  // NOT catch a hard-deleted product (delta pull can't see a row that no
  // longer exists) — that's still caught by the full reload on reconnect
  // (below) or the next cold boot. It also does NOT cover stock levels —
  // `inventory` has no `updated_at` so it's outside delta-sync entirely —
  // see the Realtime subscription effect right below for how that's kept
  // fresh instead.
  const lastRefreshRef = useRef(0);
  useEffect(() => {
    const THROTTLE_MS = 30_000;
    const INTERVAL_MS = 120_000;
    // Seed on mount so a focus right after the initial load doesn't double-fetch.
    lastRefreshRef.current = Date.now();
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      if (!useDataStore.getState().isLoaded) return;
      const now = Date.now();
      if (now - lastRefreshRef.current < THROTTLE_MS) return;
      lastRefreshRef.current = now;
      void pullDeltas();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(refresh, INTERVAL_MS);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, [pullDeltas]);

  // Live stock updates (migration 058 adds `inventory` to the Realtime
  // publication). `inventory` has no `updated_at`, so it's the one thing
  // pullDeltas() above can never catch — without this, two registers in
  // the same shop could show different stock for an unbounded window
  // (until the next full reload), not just the 30-120s the comment above
  // covers for everything else. RLS still applies: a subscriber only ever
  // receives rows `inventory_sel` (migration 015) already lets them SELECT.
  useEffect(() => {
    if (!isLoaded || !isOnline) return;
    const channel = supabase
      .channel("inventory-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory" },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
          if (!row || typeof row.shop_id !== "string" || typeof row.product_id !== "string") return;
          applyInventoryRealtimeUpdate(mapInventory(row));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isLoaded, isOnline, applyInventoryRealtimeUpdate]);

  if (viewportWidth < MIN_SUPPORTED_WIDTH) {
    return <SmallScreenGuard />;
  }

  // Error must be checked before isLoaded so a failed initial load shows an
  // actionable Retry instead of perpetual "Loading data…".
  if (loadError && !isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="mb-2 text-base font-semibold text-slate-800">Couldn't load your data</div>
          <p className="mb-4 text-sm text-slate-500">{loadError}</p>
          <Button onClick={() => void retryLoadData()} disabled={isLoading}>
            {isLoading ? "Retrying…" : "Retry"}
          </Button>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="text-slate-500 text-sm">Loading data…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="buyer-container">
      <Sidebar />
      <main className="main">
        <div className="app-content">
          <Outlet />
        </div>
      </main>
      {!isOnline && (
        <div className="fixed bottom-3 right-3 z-50 rounded-full bg-slate-800 px-3 py-1 text-xs text-white shadow-lg">
          Offline — showing cached data
        </div>
      )}
      {isOnline && isLoading && (
        <div className="fixed bottom-3 right-3 z-50 rounded-full bg-white px-3 py-1 text-xs text-slate-500 shadow-lg border border-slate-200">
          Syncing…
        </div>
      )}
    </div>
  );
};
