import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The web build (Vercel) needs absolute asset paths ("/assets/...", the
  // default) — vercel.json rewrites every path to index.html, and a
  // relative path would resolve against whatever route the browser is on
  // (e.g. /app/pos), 404ing on refresh/deep-link instead of the real
  // domain-root assets.
  //
  // The Electron desktop build needs the OPPOSITE: relative paths
  // ("./assets/..."), because it loads dist/index.html via the file://
  // protocol, where an absolute "/assets/..." resolves against the
  // filesystem root, not the dist folder — script/CSS silently fail to
  // load, giving a blank white window. See package.json's
  // "electron:build:*" scripts, which set ELECTRON_BUILD=true.
  base: process.env.ELECTRON_BUILD === 'true' ? './' : '/',
})
