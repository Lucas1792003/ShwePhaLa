import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { useAppStore } from "../stores/appStore";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

export const LoginPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const login = useAuthStore((state) => state.login);
  const setAppShopId = useAppStore((state) => state.setShopId);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password.trim()) {
      setError("Email and password are required.");
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
              <div className="text-xs uppercase tracking-[0.3em] text-emerald-200">Retail POS</div>
              <h1 className="mt-3 text-3xl font-semibold">Shwe PhaLar</h1>
              <p className="mt-3 text-sm text-emerald-100">
                Multi-shop POS + inventory suite with role-based access and real-time shift control.
              </p>
            </div>
            <div className="mt-10 text-xs text-emerald-100/70">
              Contact your administrator if you need access.
            </div>
          </div>
          <div className="p-8">
            <div className="text-sm text-slate-500">Sign in to your account</div>
            <form className="mt-6 space-y-4" onSubmit={handleLogin}>
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Email</div>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  autoComplete="email"
                />
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Password</div>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  autoComplete="current-password"
                />
              </div>
              {error && <div className="text-sm text-rose-600">{error}</div>}
              <Button className="w-full" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Signing in…" : "Sign in"}
              </Button>
            </form>
            <div className="mt-6 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/70 p-4 text-xs text-emerald-700">
              First time? Sign in with any email to create the admin account. Staff accounts are created by the admin.
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};
