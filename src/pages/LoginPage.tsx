import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { useAppStore } from "../stores/appStore";
import { useDataStore } from "../stores/dataStore";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { getRoleFromEmail, isPasswordValid } from "../features/auth/authTypes";

export const LoginPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [shopId, setShopId] = useState("");
  const [error, setError] = useState("");
  const users = useDataStore((state) => state.users);
  const shops = useDataStore((state) => state.shops);
  const addUser = useDataStore((state) => state.addUser);
  const updateUser = useDataStore((state) => state.updateUser);
  const login = useAuthStore((state) => state.login);
  const setAppShopId = useAppStore((state) => state.setShopId);

  const role = useMemo(() => getRoleFromEmail(email), [email]);
  const requiresShop = role === "MANAGER" || role === "CASHIER";
  const derivedUserId = useMemo(() => `user-${email.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`, [email]);
  const existingUser = useMemo(() => users.find((user) => user.id === derivedUserId), [users, derivedUserId]);

  useEffect(() => {
    if (!requiresShop) return;
    if (existingUser?.shopId) {
      setShopId(existingUser.shopId);
      return;
    }
    if (!shopId && shops.length > 0) setShopId(shops[0].id);
  }, [requiresShop, shopId, shops, existingUser]);

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!role) {
      setError("Use @admin.com, @manager.com, @staff.com, or @buyer.com to select a role.");
      return;
    }
    if (!isPasswordValid(password)) {
      setError("Password is required.");
      return;
    }

    const safeShopId = requiresShop ? shopId || shops[0]?.id || "" : undefined;
    if (requiresShop && !safeShopId) {
      setError("Select a shop to continue.");
      return;
    }

    const userId = derivedUserId;
    const existing = existingUser;
    const name = email.split("@")[0]?.replace(/[^a-z0-9]/gi, " ").trim() || "Staff";
    if (!existing) {
      addUser({ id: userId, name, role, shopId: safeShopId, isActive: true, createdAt: new Date().toISOString() });
    } else if (existing.role !== role || (requiresShop && !existing.shopId)) {
      updateUser({ ...existing, role, shopId: existing.shopId ?? safeShopId });
    }

    login(userId);
    if (role === "ADMIN") {
      setAppShopId(shops[0]?.id ?? null);
      navigate("/app/dashboard");
    } else {
      setAppShopId(safeShopId ?? null);
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
              <h1 className="mt-3 text-3xl font-semibold">Shwe Pha La</h1>
              <p className="mt-3 text-sm text-emerald-100">
                Multi-shop POS + inventory suite with role-based access and real-time shift control.
              </p>
            </div>
            <div className="mt-10 text-xs text-emerald-100/70">
              Login hints: @admin.com, @manager.com, @staff.com, @buyer.com
            </div>
          </div>
          <div className="p-8">
            <div className="text-sm text-slate-500">Sign in with your role email</div>
            <form className="mt-6 space-y-4" onSubmit={handleLogin}>
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Email</div>
                <Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@admin.com" />
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Password</div>
                <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Any password" />
              </div>
              {requiresShop && (
                <div>
                  <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Shop</div>
                  <Select value={shopId} onChange={(event) => setShopId(event.target.value)} disabled={!!existingUser?.shopId}>
                    {shops.map((shop) => (
                      <option key={shop.id} value={shop.id}>
                        {shop.code} - {shop.name}
                      </option>
                    ))}
                  </Select>
                  {existingUser?.shopId && (
                    <div className="mt-1 text-xs text-slate-400">Shop assignment is locked after first login.</div>
                  )}
                </div>
              )}
              {error && <div className="text-sm text-rose-600">{error}</div>}
              <Button className="w-full" type="submit">
                Login {role ? `as ${role}` : ""}
              </Button>
            </form>
            <div className="mt-6 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/70 p-4 text-xs text-emerald-700">
              Demo users are created automatically on first login. Admins can switch shops in the top bar.
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};
