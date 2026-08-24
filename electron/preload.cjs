// Preload script — runs in an isolated context with access to Node APIs,
// bridged into the renderer as `window.electronAPI` (contextIsolation is on,
// nodeIntegration is off; see main.cjs's webPreferences). Keep this surface
// small and specific — anything exposed here is callable from the renderer.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  platform: process.platform,

  listPrinters: () => ipcRenderer.invoke("printers:list"),

  /**
   * Silent-prints the currently rendered page (respecting the app's
   * existing `@media print` CSS — see src/print/receipt.css) to a system
   * printer, no dialog. Pass `deviceName` to target a specific printer
   * (from listPrinters()); omitted uses the OS default.
   */
  printReceipt: (options) => ipcRenderer.invoke("printers:print-receipt", options ?? {}),
});
