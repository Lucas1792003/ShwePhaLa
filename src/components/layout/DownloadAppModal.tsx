import { Modal } from "../ui/Modal";
import { Badge } from "../ui/Badge";

// GitHub Release asset URLs — stable/public, no auth needed. Rebuild +
// re-upload via `npm run electron:build:mac` / `:win` and `gh release
// upload` (or `gh release create` for a new version) to update these.
const DOWNLOADS = {
  macArm: "https://github.com/Lucas1792003/ShwePhaLa/releases/download/desktop-v1.0.0/Shwe.Pha.La.POS-0.0.0-arm64.dmg",
  macIntel: "https://github.com/Lucas1792003/ShwePhaLa/releases/download/desktop-v1.0.0/Shwe.Pha.La.POS-0.0.0.dmg",
  windows: "https://github.com/Lucas1792003/ShwePhaLa/releases/download/desktop-v1.0.0/Shwe.Pha.La.POS.Setup.0.0.0.exe",
};

type OsOption = {
  key: string;
  label: string;
  hint: string;
  url: string;
};

// Best-effort guess at which download to highlight — cosmetic only, every
// option is always shown regardless. Can't reliably tell Apple Silicon from
// Intel from the browser (Apple Silicon Macs can report "Intel" under
// Rosetta), so on a Mac this just guesses the now-more-common Apple
// Silicon build.
function detectLikelyOs(): string | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "windows";
  if (/Mac/i.test(ua)) return "mac-arm";
  return null;
}

const OPTIONS: OsOption[] = [
  { key: "mac-arm", label: "macOS — Apple Silicon", hint: "M1 / M2 / M3 / M4 Macs (most Macs sold since 2020)", url: DOWNLOADS.macArm },
  { key: "mac-intel", label: "macOS — Intel", hint: "Older Macs with an Intel chip", url: DOWNLOADS.macIntel },
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
      description="Pick your operating system. Not sure which Mac you have? Apple menu → About This Mac — it lists the chip."
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
