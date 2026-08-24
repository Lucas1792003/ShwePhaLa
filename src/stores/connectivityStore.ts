import { create } from "zustand";

interface ConnectivityState {
  isOnline: boolean;
  setOnline: (isOnline: boolean) => void;
}

export const useConnectivityStore = create<ConnectivityState>()((set) => ({
  isOnline: typeof navigator === "undefined" ? true : navigator.onLine,
  setOnline: (isOnline) => set({ isOnline }),
}));

// Wired once at module load (not inside a component) so connectivity is
// tracked globally regardless of which components are mounted.
if (typeof window !== "undefined") {
  window.addEventListener("online", () => useConnectivityStore.getState().setOnline(true));
  window.addEventListener("offline", () => useConnectivityStore.getState().setOnline(false));
}
