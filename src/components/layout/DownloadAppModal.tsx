import { Modal } from "../ui/Modal";

// GitHub Release asset URLs — the canonical /releases/download/<tag>/<file>
// form, stable/public, no auth needed as long as the release is published
// (not a draft — electron-builder's --publish creates a draft by default;
// see the `gh release edit <tag> --draft=false` step after publishing).
// Bump the tag here whenever electron-builder --publish always ships a new
// version (it derives the tag from package.json's "version").
const RELEASE_TAG = "v1.0.11";
const RELEASE_BASE = `https://github.com/Lucas1792003/ShwePhaLa/releases/download/${RELEASE_TAG}`;
// package.json's `build.mac/win.artifactName` pins these filenames
// explicitly (no spaces in the base name), so they're identical every
// release regardless of which path uploads them — still worth a quick
// `gh release view v<version> --json assets --jq '.assets[].name'` sanity
// check before updating this file if anything about the build config changes.
// Intel Mac build (Shwe-Pha-La-POS-1.0.11.dmg) is still published in the
// release for anyone who needs it directly, just not offered here — every
// Mac sold since 2020 is Apple Silicon.
const DOWNLOADS = {
  macArm: `${RELEASE_BASE}/Shwe-Pha-La-POS-1.0.11-arm64.dmg`,
  windows: `${RELEASE_BASE}/Shwe-Pha-La-POS-Setup-1.0.11.exe`,
};

const AppleIcon = () => (
  <svg viewBox="0 0 24 24" className="h-10 w-10 fill-current">
    <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zm3.24-2.986c.837-1.012 1.402-2.42 1.245-3.816-1.207.052-2.662.805-3.523 1.817-.774.896-1.454 2.326-1.271 3.7 1.336.104 2.712-.679 3.549-1.701z" />
  </svg>
);

const WindowsIcon = () => (
  <svg viewBox="0 0 24 24" className="h-10 w-10 fill-current">
    <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-13.051-1.351" />
  </svg>
);

const OPTIONS = [
  { key: "mac-arm", name: "macOS", Icon: AppleIcon, url: DOWNLOADS.macArm },
  { key: "windows", name: "Windows", Icon: WindowsIcon, url: DOWNLOADS.windows },
];

interface DownloadAppModalProps {
  open: boolean;
  onClose: () => void;
}

export const DownloadAppModal = ({ open, onClose }: DownloadAppModalProps) => {
  return (
    <Modal open={open} onClose={onClose} title="Download the desktop app" size="sm">
      <div className="flex justify-center gap-4">
        {OPTIONS.map(({ key, name, Icon, url }) => (
          <a
            key={key}
            href={url}
            className="flex w-32 flex-col items-center gap-2 rounded-xl border border-slate-200 py-6 text-slate-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50/60 hover:text-emerald-700"
          >
            <Icon />
            <span className="text-sm font-medium">{name}</span>
          </a>
        ))}
      </div>
    </Modal>
  );
};
