// Electron main process. Kept as plain CommonJS (not bundled) — the
// package is "type": "module" for the Vite/React app, but Electron's main
// process is simplest as a small, unbundled .cjs entry point; no build step
// needed for it.
const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("node:path");
const { autoUpdater } = require("electron-updater");

const isDev = !app.isPackaged;
// Vite's default dev server port (see vite.config.ts) — overridable for a
// non-default `npm run dev -- --port`.
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    // Matches the "Main desktop target" row in docs/06-ui-printing-hardware.md.
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  // Open target="_blank" links (none expected today, but the QR phone-upload
  // flow and any future external links should open in the OS browser, not a
  // second app window).
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    void mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    void mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    // macOS: clicking the dock icon with no windows open should reopen one.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  if (!isDev) {
    // Give the window a moment to render before firing a network check.
    setTimeout(() => checkForUpdates(), 5_000);
    // Keep checking periodically for anyone who leaves the app open for days.
    setInterval(() => checkForUpdates(), UPDATE_CHECK_INTERVAL_MS);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ------------------------------------------------------------------
// Auto-update via electron-updater, checking GitHub Releases directly
// (see package.json's "build.publish") — no separate update server needed.
// A new version just needs `npm run electron:build:mac`/`:win` followed by
// `electron-builder --publish always` (with a GH_TOKEN set) so the release
// includes the latest.yml/latest-mac.yml metadata files this depends on;
// a manually-uploaded release without those files won't be detected.
//
// Real limitation, not yet worked around: on macOS, electron-updater's
// actual install step (Squirrel.Mac) requires the app to be code-signed —
// our builds aren't (no Apple Developer certificate set up), so an update
// will likely be DETECTED but fail to apply. Windows (NSIS) does not have
// this requirement and should auto-update even unsigned, aside from a
// possible SmartScreen prompt on the downloaded update itself.
// ------------------------------------------------------------------
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
let updateCheckInFlight = false;

function checkForUpdates() {
  if (updateCheckInFlight) return;
  updateCheckInFlight = true;
  autoUpdater.checkForUpdates().catch((err) => {
    console.error("[update] check failed:", err);
  }).finally(() => {
    updateCheckInFlight = false;
  });
}

// Pushes live update status to the renderer (see preload.cjs's
// onUpdateStatus) so the sidebar's "Check for Updates" button can show
// checking/downloading/ready state without the user polling or restarting
// the app to find out.
function sendUpdateStatus(status) {
  if (mainWindow) mainWindow.webContents.send("updates:status", status);
}

autoUpdater.autoDownload = true;
autoUpdater.logger = console;

autoUpdater.on("checking-for-update", () => sendUpdateStatus({ state: "checking" }));
autoUpdater.on("update-available", (info) => sendUpdateStatus({ state: "available", version: info.version }));
autoUpdater.on("update-not-available", (info) => sendUpdateStatus({ state: "not-available", version: info.version }));
autoUpdater.on("download-progress", (progress) =>
  sendUpdateStatus({ state: "downloading", percent: Math.round(progress.percent) }),
);

autoUpdater.on("error", (err) => {
  console.error("[update] error:", err);
  sendUpdateStatus({ state: "error", message: err instanceof Error ? err.message : String(err) });
});

autoUpdater.on("update-downloaded", (info) => {
  sendUpdateStatus({ state: "downloaded", version: info.version });
  if (!mainWindow) return;
  dialog
    .showMessageBox(mainWindow, {
      type: "info",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Update ready",
      message: `Shwe Pha La POS ${info.version} has been downloaded.`,
      detail: "Restart now to install it, or it'll install automatically the next time you quit the app.",
    })
    .then((result) => {
      if (result.response === 0) autoUpdater.quitAndInstall();
    });
});

// Manual "Check for Updates" button in the sidebar — lets a user pull the
// latest build without deleting and reinstalling. Status is reported back
// via the "updates:status" events above, not this handler's return value,
// since checkForUpdates() is async/event-driven under the hood.
ipcMain.handle("updates:check", () => {
  if (isDev) return { ok: false, error: "Update checks are unavailable in dev mode." };
  checkForUpdates();
  return { ok: true };
});

ipcMain.handle("updates:install", () => {
  autoUpdater.quitAndInstall();
  return { ok: true };
});

ipcMain.handle("app:get-version", () => app.getVersion());

// ------------------------------------------------------------------
// Receipt printing: silent-print to a system printer (no dialog, no
// --kiosk-printing launch flag needed — see docs/06-ui-printing-hardware.md
// for the browser-only workaround this replaces). Most ESC/POS thermal
// receipt printers install as a normal OS printer via the manufacturer's
// driver, so this works with the existing 80mm receipt HTML/CSS
// (src/print/receipt.css) unchanged — no raw ESC/POS byte protocol needed.
//
// NOT implemented here: opening a cash drawer as a standalone action. That
// typically needs either a drawer-kick command embedded in the print job
// (printer-model-specific) or a direct USB/serial connection — both need
// real hardware to wire up and verify, which wasn't available while
// building this. `listPrinters` below at least lets a future settings page
// show what's connected.
// ------------------------------------------------------------------

ipcMain.handle("printers:list", async () => {
  if (!mainWindow) return [];
  return mainWindow.webContents.getPrintersAsync();
});

ipcMain.handle("printers:print-receipt", async (_event, options) => {
  if (!mainWindow) return { ok: false, error: "No window" };
  const deviceName = options && typeof options.deviceName === "string" ? options.deviceName : undefined;
  try {
    await mainWindow.webContents.print({
      silent: true,
      printBackground: true,
      deviceName,
      margins: { marginType: "none" },
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});
