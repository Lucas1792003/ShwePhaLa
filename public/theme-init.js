// Resolve the saved/system theme before CSS and React paint, avoiding a
// light flash when the OS or saved preference is dark. Zustand stores the
// preference inside this small JSON envelope.
// External file (not an inline <script>) so it runs under a script-src
// 'self' Content-Security-Policy without needing 'unsafe-inline'.
(() => {
  let preference = "system";
  try {
    const saved = JSON.parse(localStorage.getItem("pos-theme") || "null");
    preference = saved?.state?.theme || "system";
  } catch {
    // A blocked/corrupt localStorage entry should fall back to the OS.
  }
  const dark =
    preference === "dark" ||
    (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
})();
