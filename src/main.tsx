import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import "./print/receipt.css";
import "./print/labels.css";
import { useAuthStore } from "./stores/authStore";
// Side-effecting import: applies the persisted/system theme to <html>
// before React mounts — see stores/themeStore.ts.
import "./stores/themeStore";

// Restore Supabase session on app start
useAuthStore.getState().restoreSession();

// BrowserRouter's pushState sets an absolute path (e.g. "/app/dashboard"),
// which is fine for the web deploy (a real https:// origin) but breaks
// under Electron's file:// loading: pushState replaces the ENTIRE path
// portion of a file:// URL, so location.href goes from
// "file:///.../app.asar/dist/index.html" to "file:///app/dashboard" —
// losing the "dist/" (and even "app.asar") prefix. Any relative asset
// referenced after that first navigation (e.g. the sidebar logo, which
// only mounts once logged in) then resolves against the wrong location
// and 404s, even though the initial JS/CSS bundle loaded fine (it was
// fetched once, before any navigation happened). HashRouter only touches
// the URL fragment, so the file:// path never changes.
const Router = window.electronAPI?.isElectron ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>
);
