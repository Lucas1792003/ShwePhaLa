// electron-builder afterPack hook — ad-hoc code-signs the macOS .app after
// packaging, before it gets put in the .dmg/.zip. Free (no Apple Developer
// account, no certificate) — not the same as real notarization, but it
// typically changes Gatekeeper's response to a downloaded, unsigned app
// from a hard "is damaged, move to Trash" block to the softer "unidentified
// developer" warning a user can bypass via right-click → Open. Still worth
// clearing the quarantine flag manually if "is damaged" shows up anyway —
// see docs/10-offline-desktop-known-issues.md.
const { execFileSync } = require("node:child_process");
const path = require("node:path");

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);

  try {
    execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], { stdio: "inherit" });
    console.log(`[afterPack] Ad-hoc signed ${appPath}`);
  } catch (err) {
    console.error("[afterPack] codesign failed (continuing unsigned):", err.message);
  }
};
