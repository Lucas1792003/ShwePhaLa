import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Navigate } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/layout/PageHeader";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { useTranslation } from "../hooks/useTranslation";
import { formatDateTime } from "../lib/utils";
import { useAuthStore, type TotpFactor } from "../stores/authStore";
import { CodeCells, CODE_LENGTH } from "../components/forms/CodeCells";

interface EnrollState {
  factorId: string;
  qrCode: string;
  secret: string;
}

// Authenticator-device management, rendered as the Security tab of the Settings
// page. Self-guards to ADMIN so it's safe to mount anywhere.
export function SecuritySection() {
  const { t } = useTranslation();
  const currentRole = useAuthStore((state) => state.currentRole);
  const listTotpFactors = useAuthStore((state) => state.listTotpFactors);
  const enrollTotp = useAuthStore((state) => state.enrollTotp);
  const verifyTotpEnrollment = useAuthStore((state) => state.verifyTotpEnrollment);
  const unenrollTotp = useAuthStore((state) => state.unenrollTotp);

  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState("");
  const [code, setCode] = useState("");
  const [enrollData, setEnrollData] = useState<EnrollState | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const verifiedCount = useMemo(
    () => factors.filter((factor) => factor.status === "verified").length,
    [factors]
  );

  const loadFactors = useCallback(async () => {
    setLoading(true);
    const result = await listTotpFactors();
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setFactors(result.factors);
  }, [listTotpFactors]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      const result = await listTotpFactors();
      if (cancelled) return;
      setLoading(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      setFactors(result.factors);
    })();
    return () => {
      cancelled = true;
    };
  }, [listTotpFactors]);

  if (currentRole !== "ADMIN") return <Navigate to="/app" replace />;

  const resetMessages = () => {
    setError("");
    setSuccess("");
  };

  const startEnrollment = async () => {
    if (enrolling) return;
    resetMessages();
    setCode("");
    setEnrollData(null);
    setEnrolling(true);
    const fallbackName = t("auth", "securityDefaultDeviceName", { n: factors.length + 1 });
    const result = await enrollTotp(deviceName.trim() || fallbackName);
    setEnrolling(false);
    if (result.error || !result.factorId) {
      setError(result.error ?? t("auth", "enrollFailed"));
      return;
    }
    setEnrollData({
      factorId: result.factorId,
      qrCode: result.qrCode ?? "",
      secret: result.secret ?? "",
    });
  };

  const cancelEnrollment = async () => {
    const factorId = enrollData?.factorId;
    setEnrollData(null);
    setCode("");
    resetMessages();
    if (factorId) {
      await unenrollTotp(factorId);
      await loadFactors();
    }
  };

  const activateEnrollment = async () => {
    if (!enrollData || code.length !== CODE_LENGTH || verifying) return;
    resetMessages();
    setVerifying(true);
    const result = await verifyTotpEnrollment(enrollData.factorId, code);
    setVerifying(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setEnrollData(null);
    setCode("");
    setDeviceName("");
    setSuccess(t("auth", "securityDeviceAdded"));
    await loadFactors();
  };

  const removeFactor = async (factor: TotpFactor) => {
    const label = factor.friendlyName || t("auth", "securityUnnamedDevice");
    if (!window.confirm(t("auth", "securityRemoveConfirm", { name: label }))) return;

    resetMessages();
    setRemovingId(factor.id);
    const result = await unenrollTotp(factor.id);
    setRemovingId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSuccess(t("auth", "securityDeviceRemoved"));
    await loadFactors();
  };

  return (
    <div>
      <div className="flex justify-end">
        <Button onClick={startEnrollment} disabled={enrolling || Boolean(enrollData)}>
          <span className="material-symbols-rounded mr-1 text-base">add</span>
          {enrolling ? t("auth", "securityStarting") : t("auth", "securityAddDevice")}
        </Button>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-800">{t("auth", "securityDevices")}</h2>
            <Badge tone={verifiedCount > 0 ? "green" : "amber"}>
              {t("auth", "securityVerifiedCount", { n: verifiedCount })}
            </Badge>
          </div>

          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              {t("common", "loading")}
            </div>
          ) : factors.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
              <div className="text-sm font-semibold text-slate-700">{t("auth", "securityNoDevices")}</div>
              <p className="mt-1 text-sm text-slate-500">{t("auth", "securityNoDevicesHint")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {factors.map((factor) => {
                const isVerified = factor.status === "verified";
                return (
                  <div
                    key={factor.id}
                    className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900">
                          {factor.friendlyName || t("auth", "securityUnnamedDevice")}
                        </span>
                        <Badge tone={isVerified ? "green" : "amber"}>
                          {isVerified ? t("auth", "securityVerified") : t("auth", "securityPending")}
                        </Badge>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {t("auth", "securityAddedAt", { date: formatDateTime(factor.createdAt) })}
                      </div>
                    </div>
                    <Button
                      variant="danger"
                      className="shrink-0"
                      onClick={() => void removeFactor(factor)}
                      disabled={removingId === factor.id}
                    >
                      {removingId === factor.id ? t("auth", "securityRemoving") : t("auth", "securityRemove")}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h2 className="text-sm font-semibold text-slate-800">{t("auth", "securityAddTitle")}</h2>
            <p className="mt-1 text-sm text-slate-500">{t("auth", "securityAddSubtitle")}</p>
            <div className="mt-4 space-y-3">
              <Input
                value={deviceName}
                onChange={(event) => setDeviceName(event.target.value)}
                placeholder={t("auth", "securityDeviceNamePlaceholder")}
                disabled={Boolean(enrollData) || enrolling}
              />
              {!enrollData && (
                <Button className="w-full" onClick={startEnrollment} disabled={enrolling}>
                  {enrolling ? t("auth", "securityStarting") : t("auth", "securityStartSetup")}
                </Button>
              )}
            </div>
          </div>

          {enrollData && (
            <div className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-800">{t("auth", "securityScanTitle")}</h2>
              <p className="mt-1 text-sm text-slate-500">{t("auth", "enrollScanHint")}</p>
              <div className="mt-4 flex flex-col items-center">
                {enrollData.qrCode && (
                  <img
                    src={enrollData.qrCode}
                    alt={t("auth", "securityQrAlt")}
                    className="h-48 w-48 rounded-lg border border-slate-200 bg-white p-2"
                  />
                )}
                {enrollData.secret && (
                  <div className="mt-3 w-full text-center">
                    <div className="text-xs text-slate-400">{t("auth", "enrollSecretLabel")}</div>
                    <code className="mt-1 block break-all rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">
                      {enrollData.secret}
                    </code>
                  </div>
                )}
              </div>

              <div className="mt-4 space-y-3">
                <CodeCells
                  value={code}
                  invalid={Boolean(error)}
                  onChange={(next) => {
                    setCode(next);
                    if (error) setError("");
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={activateEnrollment} disabled={verifying || code.length !== CODE_LENGTH}>
                    {verifying ? t("auth", "verifying") : t("auth", "enrollActivate")}
                  </Button>
                  <Button variant="secondary" onClick={() => void cancelEnrollment()} disabled={verifying}>
                    {t("auth", "cancelSetup")}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}
          {success && !error && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {success}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// Re-verification gate: the admin must confirm a fresh code (authenticator app,
// or emailed code) before the device list is shown. Unlock is local state, so
// leaving and returning to the page requires verifying again.
function SecurityGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const hasTotp = useAuthStore((s) => s.hasTotp);
  const requestAdminCode = useAuthStore((s) => s.requestAdminCode);
  const verifyAdminCode = useAuthStore((s) => s.verifyAdminCode);
  const verifyTotpLogin = useAuthStore((s) => s.verifyTotpLogin);

  const [unlocked, setUnlocked] = useState(false);
  // Managing existing factors (enroll a 2nd device / remove) requires an aal2
  // session, which only the authenticator code produces — so when a factor
  // already exists we require the app code here (no email fallback). The email
  // path is only for the first-ever device (allowed at aal1).
  const mode: "totp" | "email" = hasTotp ? "totp" : "email";
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sending, setSending] = useState(false);
  const emailRequestedRef = useRef(false);

  // Send an email code when the email path is active (no app, or "use email").
  useEffect(() => {
    if (unlocked || mode !== "email" || emailRequestedRef.current) return;
    emailRequestedRef.current = true;
    let cancelled = false;
    void (async () => {
      setSending(true);
      const res = await requestAdminCode();
      if (cancelled) return;
      setSending(false);
      if (res.error) setError(res.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [unlocked, mode, requestAdminCode]);

  if (unlocked) return <>{children}</>;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (code.length !== CODE_LENGTH || submitting) return;
    setSubmitting(true);
    setError("");
    const res = mode === "totp" ? await verifyTotpLogin(code) : await verifyAdminCode(code);
    setSubmitting(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setUnlocked(true);
  };

  return (
    <div className="mx-auto max-w-sm py-6 text-center">
      <span className="material-symbols-rounded text-4xl text-emerald-600">lock</span>
      <h2 className="mt-3 text-xl font-semibold text-slate-900">{t("auth", "verifyTitle")}</h2>
      <p className="mt-2 text-sm text-slate-500">
        {mode === "totp" ? t("auth", "totpSubtitle") : t("auth", "securityEmailPrompt")}
      </p>

      <form className="mt-6 space-y-4 text-left" onSubmit={handleSubmit} autoComplete="off">
        <CodeCells
          value={code}
          invalid={!!error}
          onChange={(next) => {
            setCode(next);
            if (error) setError("");
          }}
        />
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        )}
        <Button className="w-full" type="submit" disabled={submitting || code.length !== CODE_LENGTH}>
          {submitting ? t("auth", "verifying") : t("auth", "verify")}
        </Button>
      </form>

      <div className="mt-4 h-4 text-sm">
        {mode === "email" && sending ? (
          <span className="text-slate-400">{t("auth", "sendingCode")}</span>
        ) : null}
      </div>
    </div>
  );
}

// Full Security page: brand chrome + the re-verify gate around device management.
export const SecurityPage = () => {
  const { t } = useTranslation();
  const currentRole = useAuthStore((s) => s.currentRole);
  if (currentRole !== "ADMIN") return <Navigate to="/app" replace />;
  return (
    <Card>
      <PageHeader title={t("sidebar", "security")} subtitle={t("auth", "securitySubtitle")} />
      <div className="mt-6">
        <SecurityGate>
          <SecuritySection />
        </SecurityGate>
      </div>
    </Card>
  );
};
