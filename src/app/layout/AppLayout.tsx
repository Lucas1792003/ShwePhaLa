import { useEffect, useRef } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { SmallScreenGuard } from "./SmallScreenGuard";
import { Button } from "../../components/ui/Button";
import { useDataStore } from "../../stores/dataStore";
import { useViewportWidth } from "../../hooks/useViewportWidth";

const MIN_SUPPORTED_WIDTH = 768;

export const AppLayout = () => {
  const isLoaded = useDataStore((state) => state.isLoaded);
  const isLoading = useDataStore((state) => state.isLoading);
  const loadError = useDataStore((state) => state.loadError);
  const loadData = useDataStore((state) => state.loadData);
  const retryLoadData = useDataStore((state) => state.retryLoadData);
  const viewportWidth = useViewportWidth();

  useEffect(() => {
    if (!isLoaded && !isLoading && !loadError) {
      void loadData();
    }
  }, [isLoaded, isLoading, loadError, loadData]);

  // Keep the cached data fresh: re-sync when the tab regains focus/visibility
  // and on a slow interval while open. The client store is loaded once, so
  // without this a returning user would see stale stock/debt/transfers that
  // another device changed. Throttled so rapid focus changes don't hammer the
  // backend; loadData({force}) refreshes in place without a loading flash.
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
      void loadData({ force: true });
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
  }, [loadData]);

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
    </div>
  );
};
