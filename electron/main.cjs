// Electron main process. Kept as plain CommonJS (not bundled) — the
// package is "type": "module" for the Vite/React app, but Electron's main
// process is simplest as a small, unbundled .cjs entry point; no build step
// needed for it.
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");

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
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

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
