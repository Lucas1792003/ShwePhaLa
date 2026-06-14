import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { useAppStore } from "../stores/appStore";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { useTranslation } from "../hooks/useTranslation";

export const LoginPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const login = useAuthStore((state) => state.login);
  const setAppShopId = useAppStore((state) => state.setShopId);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password.trim()) {
      setError(t("auth", "emailPasswordRequired"));
      return;
    }

    setIsSubmitting(true);
    const result = await login(email.trim(), password);
    setIsSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (result.shopId) setAppShopId(result.shopId);

    if (result.role === "ADMIN") {
      navigate("/app/dashboard");
    } else {
      navigate("/app");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-5xl overflow-hidden p-0">
        <div className="grid gap-0 md:grid-cols-[1.1fr_1fr]">
          <div className="flex flex-col justify-between bg-emerald-900 p-8 text-white">
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-emerald-200">{t("auth", "retailPos")}</div>
              <h1 className="mt-3 text-3xl font-semibold">Shwe PhaLar</h1>
              <p className="mt-3 text-sm text-emerald-100">
                {t("auth", "brandTagline")}
              </p>
            </div>
            <div className="mt-10 text-xs text-emerald-100/70">
              {t("auth", "contactAdmin")}
            </div>
          </div>
          <div className="p-8">
            <div className="text-sm text-slate-500">{t("auth", "signInToAccount")}</div>
            {/* autoComplete off everywhere: this is a shared till, so the
                browser must not cache or auto-fill the previous user's
                credentials. */}
            <form className="mt-6 space-y-4" onSubmit={handleLogin} autoComplete="off">
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">{t("auth", "email")}</div>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError("");
                  }}
                  placeholder="your@email.com"
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  error={!!error}
                />
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">{t("auth", "password")}</div>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError("");
                    }}
                    placeholder={t("auth", "password")}
                    autoComplete="new-password"
                    error={!!error}
                    className="pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? t("auth", "hidePassword") : t("auth", "showPassword")}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 transition-colors hover:text-slate-600"
                  >
                    <span className="material-symbols-rounded text-xl">
                      {showPassword ? "visibility_off" : "visibility"}
                    </span>
                  </button>
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
              <Button className="w-full" type="submit" disabled={isSubmitting}>
                {isSubmitting ? t("auth", "signingIn") : t("auth", "signIn")}
              </Button>
            </form>
            <div className="mt-6 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/70 p-4 text-xs text-emerald-700">
              {t("auth", "firstTimeHint")}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};
