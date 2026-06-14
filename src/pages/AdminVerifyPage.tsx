import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { useTranslation } from "../hooks/useTranslation";

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
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                if (error) setError("");
              }}
              placeholder={t("auth", "codePlaceholder")}
              className="text-center text-lg tracking-[0.5em]"
              error={!!error}
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
