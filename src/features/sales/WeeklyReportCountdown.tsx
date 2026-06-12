import { useEffect, useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");

/** Midnight on the upcoming Monday (when the weekly all-shops report sends). */
const nextMonday = (): number => {
  const x = new Date();
  x.setHours(0, 0, 0, 0);
  const sinceMonday = (x.getDay() + 6) % 7; // 0=Sun..6=Sat → days since Monday
  x.setDate(x.getDate() - sinceMonday + 7);
  return x.getTime();
};

/**
 * Admin-only countdown to the next Monday 00:00, when the weekly all-shops
 * sales report is emailed automatically. Self-contained (its own 1s tick) so
 * it never re-renders the sales list.
 */
export const WeeklyReportCountdown = () => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const handle = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, []);

  const diff = Math.max(0, nextMonday() - now);
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor(diff / 3_600_000) % 24;
  const minutes = Math.floor(diff / 60_000) % 60;
  const seconds = Math.floor(diff / 1000) % 60;

  return (
    <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
      <span className="material-symbols-rounded text-base">schedule</span>
      <span className="font-medium">Weekly report in</span>
      <span className="font-semibold tabular-nums">
        {days}d {pad(hours)}:{pad(minutes)}:{pad(seconds)}
      </span>
    </div>
  );
};
