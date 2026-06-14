import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { useTranslation } from "../hooks/useTranslation";

const CODE_LENGTH = 6;

// Segmented OTP input: one box per digit. Keeps the joined code in the parent's
// `value` so the rest of the verify flow is unchanged. Auto-advances on entry,
// backspaces to the previous box, and accepts a pasted 6-digit code.
function CodeCells({
  value,
  invalid,
  onChange,
}: {
  value: string;
  invalid?: boolean;
  onChange: (next: string) => void;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: CODE_LENGTH }, (_, i) => value[i] ?? "");

  const handleChange = (index: number, event: ChangeEvent<HTMLInputElement>) => {
    const digit = event.target.value.replace(/\D/g, "").slice(-1);
    if (!digit) return;
    onChange((value.slice(0, index) + digit + value.slice(index + 1)).slice(0, CODE_LENGTH));
    if (index < CODE_LENGTH - 1) refs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      if (digits[index]) {
        onChange(value.slice(0, index) + value.slice(index + 1));
      } else if (index > 0) {
        onChange(value.slice(0, index - 1) + value.slice(index));
        refs.current[index - 1]?.focus();
      }
    } else if (event.key === "ArrowLeft" && index > 0) {
      refs.current[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < CODE_LENGTH - 1) {
      refs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!pasted) return;
    event.preventDefault();
    onChange(pasted);
    refs.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
  };

  return (
    <div className="flex justify-between gap-2" onPaste={handlePaste}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={1}
          autoFocus={index === 0}
          value={digit}
          onChange={(event) => handleChange(index, event)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onFocus={(event) => event.target.select()}
          className={`h-12 w-12 rounded-lg border text-center text-xl font-bold outline-none transition-colors focus:ring-2 ${
            invalid
              ? "border-rose-300 text-rose-700 focus:border-rose-400 focus:ring-rose-100"
              : "border-slate-200 text-slate-800 focus:border-emerald-400 focus:ring-emerald-100"
          }`}
        />
      ))}
    </div>
  );
}

// Admin second-factor page. Reached after an admin's password check (or on a
// /verify refresh). It emails a 6-digit code on mount, shows a live countdown
// to the 10-minute deadline, and verifies the entered code via the data store /
// admin-2fa edge function. Self-guards: no session -> /login; non-admin or
// already-verified -> /app.
export const AdminVerifyPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const currentUserId = useAuthStore((s) => s.currentUserId);
  const currentRole = useAuthStore((s) => s.currentRole);
  const adminVerified = useAuthStore((s) => s.adminVerified);
  const isAuthLoading = useAuthStore((s) => s.isAuthLoading);
  const requestAdminCode = useAuthStore((s) => s.requestAdminCode);
  const verifyAdminCode = useAuthStore((s) => s.verifyAdminCode);
  const logout = useAuthStore((s) => s.logout);

  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Starts true: a code is requested on mount (see the effect below).
  const [sending, setSending] = useState(true);
  const [maskedEmail, setMaskedEmail] = useState("");
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const requestedRef = useRef(false);

  // Redirect away if the page doesn't apply (no session / not an unverified admin).
  const shouldGate = !isAuthLoading && (!currentUserId || currentRole !== "ADMIN" || adminVerified);

  const sendCode = useCallback(
    async (isResend: boolean) => {
      setSending(true);
      setError("");
      setInfo("");
      const res = await requestAdminCode();
      setSending(false);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.email) setMaskedEmail(res.email);
      if (res.expiresAt) setExpiresAt(new Date(res.expiresAt).getTime());
      if (isResend && res.email) setInfo(t("auth", "codeSent", { email: res.email }));
    },
    [requestAdminCode, t],
  );

  // Send the first code once on mount (unless we're about to redirect). The
  // work is fully async (first statement awaits) so no setState runs
  // synchronously inside the effect body.
  useEffect(() => {
    if (shouldGate || requestedRef.current) return;
    requestedRef.current = true;
    let cancelled = false;
    void (async () => {
      const res = await requestAdminCode();
      if (cancelled) return;
      setSending(false);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.email) setMaskedEmail(res.email);
      if (res.expiresAt) setExpiresAt(new Date(res.expiresAt).getTime());
    })();
    return () => {
      cancelled = true;
    };
  }, [shouldGate, requestAdminCode]);

  // 1-second tick drives the deadline countdown.
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (isAuthLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-slate-400 text-sm">Checking session…</div>
      </div>
    );
  }
  if (!currentUserId) return <Navigate to="/login" replace />;
  if (currentRole !== "ADMIN" || adminVerified) return <Navigate to="/app" replace />;

  const remainingMs = expiresAt !== null ? Math.max(0, expiresAt - nowMs) : null;
  const expired = remainingMs === 0 && expiresAt !== null;
  const countdown =
    remainingMs !== null
      ? `${String(Math.floor(remainingMs / 60000)).padStart(2, "0")}:${String(
          Math.floor((remainingMs % 60000) / 1000),
        ).padStart(2, "0")}`
      : "";

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (code.length !== 6 || submitting) return;
    setSubmitting(true);
    setError("");
    const res = await verifyAdminCode(code);
    setSubmitting(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    navigate("/app/dashboard");
  };

  const handleBackToLogin = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md p-8">
        <div className="flex flex-col items-center text-center">
          <span className="material-symbols-rounded text-4xl text-emerald-600">mark_email_read</span>
          <h1 className="mt-3 text-2xl font-semibold text-slate-900">{t("auth", "verifyTitle")}</h1>
          <p className="mt-2 text-sm text-slate-500">
            {t("auth", "verifySubtitle", { email: maskedEmail || "…" })}
          </p>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleVerify} autoComplete="off">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
              {t("auth", "codeLabel")}
            </div>
            <CodeCells
              value={code}
              invalid={!!error}
              onChange={(next) => {
                setCode(next);
                if (error) setError("");
              }}
            />
            <div className="mt-1 h-4 text-xs text-slate-400">
              {expired
                ? t("auth", "codeExpired")
                : remainingMs !== null
                  ? t("auth", "codeExpiresIn", { time: countdown })
                  : ""}
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
            >
              <span className="material-symbols-rounded text-base leading-5">error</span>
              <span>{error}</span>
            </div>
          )}
          {info && !error && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {info}
            </div>
          )}

          <Button className="w-full" type="submit" disabled={submitting || code.length !== 6}>
            {submitting ? t("auth", "verifying") : t("auth", "verify")}
          </Button>
        </form>

        <div className="mt-5 flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => void sendCode(true)}
            disabled={sending}
            className="font-medium text-emerald-700 hover:text-emerald-800 disabled:text-slate-300"
          >
            {sending ? t("auth", "sendingCode") : t("auth", "resendCode")}
          </button>
          <button
            type="button"
            onClick={() => void handleBackToLogin()}
            className="text-slate-400 hover:text-slate-600"
          >
            {t("auth", "backToLogin")}
          </button>
        </div>
      </Card>
    </div>
  );
};
