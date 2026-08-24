import { useEffect, useState } from "react";

type Phase = "idle" | "checking" | "downloading" | "downloaded" | "not-available" | "error";

const ICONS: Record<Phase, string> = {
  idle: "system_update",
  checking: "sync",
  downloading: "sync",
  downloaded: "restart_alt",
  "not-available": "check_circle",
  error: "error",
};

export const CheckForUpdatesButton = () => {
  const [version, setVersion] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [percent, setPercent] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    void api.appVersion().then(setVersion);

    return api.onUpdateStatus((status) => {
      switch (status.state) {
        case "checking":
          setPhase("checking");
          break;
        case "available":
          setPhase("downloading");
          setPercent(0);
          break;
        case "downloading":
          setPhase("downloading");
          setPercent(status.percent ?? 0);
          break;
        case "downloaded":
          setPhase("downloaded");
          if (status.version) setVersion(status.version);
          break;
        case "not-available":
          setPhase("not-available");
          break;
        case "error":
          setPhase("error");
          setMessage(status.message ?? "Update check failed.");
          break;
      }
    });
  }, []);

  // Auto-reset transient statuses so the button returns to "Check for
  // Updates" instead of getting stuck on "Up to date" / "Check failed".
  useEffect(() => {
    if (phase !== "not-available" && phase !== "error") return;
    const timer = setTimeout(() => setPhase("idle"), 4000);
    return () => clearTimeout(timer);
  }, [phase]);

  if (!window.electronAPI) return null;

  const busy = phase === "checking" || phase === "downloading";

  const handleClick = () => {
    if (phase === "downloaded") {
      void window.electronAPI?.installUpdate();
      return;
    }
    setPhase("checking");
    setMessage(null);
    void window.electronAPI?.checkForUpdates().then((result) => {
      if (!result.ok) {
        setPhase("error");
        setMessage(result.error ?? "Update check failed.");
      }
    });
  };

  const label =
    phase === "checking"
      ? "Checking…"
      : phase === "downloading"
        ? `Downloading ${percent}%`
        : phase === "downloaded"
          ? "Restart to update"
          : phase === "not-available"
            ? "Up to date"
            : phase === "error"
              ? "Check failed"
              : "Check for Updates";

  return (
    <div className="update-checker">
      <button
        type="button"
        className="logout-btn"
        onClick={handleClick}
        disabled={busy}
        title={message ?? label}
      >
        <span className="material-symbols-rounded">{ICONS[phase]}</span>
        <span>{label}</span>
      </button>
      {version && <div className="update-version">v{version}</div>}
    </div>
  );
};
