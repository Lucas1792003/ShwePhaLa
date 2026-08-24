// Ambient type for the API the Electron preload script exposes (see
// electron/preload.cjs). Undefined in the browser build — every call site
// must feature-detect with `window.electronAPI?.` before using it.
export interface ElectronPrinterInfo {
  name: string;
  displayName: string;
  isDefault: boolean;
}

export interface ElectronPrintResult {
  ok: boolean;
  error?: string;
}

export interface ElectronAPI {
  isElectron: true;
  platform: string;
  listPrinters: () => Promise<ElectronPrinterInfo[]>;
  printReceipt: (options?: { deviceName?: string }) => Promise<ElectronPrintResult>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
