/**
 * Prints the currently rendered page (the app's existing `@media print` CSS
 * — see src/print/receipt.css — already isolates just the receipt subtree).
 * Inside the Electron desktop app this prints silently to a system printer
 * via IPC (electron/main.cjs); in a browser it falls back to the native
 * `window.print()` dialog, same as before this existed. Also falls back on
 * an Electron print failure (e.g. no printer configured) so the operator
 * still gets a dialog instead of a silent no-op.
 */
export async function printReceipt(): Promise<void> {
  const api = window.electronAPI;
  if (api?.printReceipt) {
    const result = await api.printReceipt();
    if (result.ok) return;
    console.error("[print] Electron silent print failed, falling back to the print dialog:", result.error);
  }
  window.print();
}
