import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { useDataStore } from "../../stores/dataStore";

export const AppLayout = () => {
  const isLoaded = useDataStore((state) => state.isLoaded);
  const isLoading = useDataStore((state) => state.isLoading);
  const loadData = useDataStore((state) => state.loadData);

  useEffect(() => {
    if (!isLoaded && !isLoading) {
      void loadData();
    }
  }, [isLoaded, isLoading, loadData]);

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
