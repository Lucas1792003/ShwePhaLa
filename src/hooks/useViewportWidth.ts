import { useEffect, useState } from "react";

/**
 * Tracks `window.innerWidth` and re-renders on resize. Returns the current
 * width so callers can branch on viewport size — used by the small-screen
 * guard in AppLayout. Safe to call before mount: defaults to a desktop width
 * during SSR-style first paint so the guard never flashes.
 */
export const useViewportWidth = (): number => {
  const [width, setWidth] = useState<number>(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth
  );

  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return width;
};
