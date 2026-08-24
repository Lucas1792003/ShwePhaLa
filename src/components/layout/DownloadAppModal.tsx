import { Modal } from "../ui/Modal";
import { Badge } from "../ui/Badge";

// GitHub Release asset URLs — the canonical /releases/download/<tag>/<file>
// form, stable/public, no auth needed as long as the release is published
// (not a draft — electron-builder's --publish creates a draft by default;
// see the `gh release edit <tag> --draft=false` step after publishing).
// Bump the tag here whenever electron-builder --publish always ships a new
// version (it derives the tag from package.json's "version").
const RELEASE_TAG = "v1.0.0";
const RELEASE_BASE = `https://github.com/Lucas1792003/ShwePhaLa/releases/download/${RELEASE_TAG}`;
const DOWNLOADS = {
  macArm: `${RELEASE_BASE}/Shwe-Pha-La-POS-1.0.0-arm64.dmg`,
  windows: `${RELEASE_BASE}/Shwe-Pha-La-POS-Setup-1.0.0.exe`,
};
// Intel Mac build (Shwe-Pha-La-POS-1.0.0.dmg) is still published in the
// release for anyone who needs it directly, just not offered here — every
// Mac sold since 2020 is Apple Silicon, and keeping the picker to 2 options
// reads cleaner than 3.

type OsOption = {
  key: string;
  label: string;
  hint: string;
  url: string;
};

// Best-effort guess at which download to highlight — cosmetic only, both
// options are always shown regardless.
function detectLikelyOs(): string | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "windows";
  if (/Mac/i.test(ua)) return "mac-arm";
  return null;
}

const OPTIONS: OsOption[] = [
  { key: "mac-arm", label: "macOS", hint: "Apple Silicon Macs (M1 and later)", url: DOWNLOADS.macArm },
  { key: "windows", label: "Windows", hint: "64-bit Windows 10 / 11", url: DOWNLOADS.windows },
];

interface DownloadAppModalProps {
  open: boolean;
  onClose: () => void;
}

export const DownloadAppModal = ({ open, onClose }: DownloadAppModalProps) => {
  const likely = detectLikelyOs();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Download the desktop app"
      description="Pick your operating system."
      size="sm"
    >
      <div className="space-y-2">
        {OPTIONS.map((option) => (
          <a
            key={option.key}
            href={option.url}
            className="flex items-center justify-between rounded-xl border border-slate-200 p-3 transition-colors hover:border-emerald-300 hover:bg-emerald-50/60"
          >
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                {option.label}
                {option.key === likely && <Badge tone="green">Likely yours</Badge>}
              </div>
              <div className="mt-0.5 text-xs text-slate-500">{option.hint}</div>
            </div>
            <span className="material-symbols-rounded text-slate-400">download</span>
          </a>
        ))}
      </div>
      <p className="mt-4 text-xs text-slate-400">
        Unsigned builds: macOS will warn the app is from an unidentified developer — right-click the app →
        Open, once. Windows SmartScreen may warn similarly — click "More info" → "Run anyway".
      </p>
    </Modal>
  );
};
