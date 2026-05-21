import { useState } from "react";
import { useDataStore } from "../stores/dataStore";
import { supabase } from "../lib/supabase";
import type { Role } from "../types";
import { PageHeader } from "../components/layout/PageHeader";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Button } from "../components/ui/Button";

export const UsersPage = () => {
  const users = useDataStore((state) => state.users);
  const shops = useDataStore((state) => state.shops);
  const addUser = useDataStore((state) => state.addUser);
  const updateUser = useDataStore((state) => state.updateUser);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("CASHIER");
  const [shopId, setShopId] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const requiresShop = role === "MANAGER" || role === "CASHIER";

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setEmail("");
    setPassword("");
    setRole("CASHIER");
    setShopId(undefined);
    setFeedback(null);
  };

  const handleSubmit = async () => {
    if (!name.trim()) { setFeedback({ type: "error", message: "Name is required." }); return; }

    if (editingId) {
      // Edit existing user — update profile only (password change not supported from client)
      const existing = users.find((u) => u.id === editingId)!;
      try {
        await updateUser({
          ...existing,
          name: name.trim(),
          role,
          shopId: requiresShop ? shopId : undefined,
        });
        setFeedback({ type: "success", message: "User updated." });
      } catch (error) {
        setFeedback({ type: "error", message: error instanceof Error ? error.message : "Failed to update user." });
      }
      return;
    }

    // Create new user
    if (!email.trim()) { setFeedback({ type: "error", message: "Email is required." }); return; }
    if (password.length < 6) { setFeedback({ type: "error", message: "Password must be at least 6 characters." }); return; }
    if (requiresShop && !shopId) { setFeedback({ type: "error", message: "Select a shop for this role." }); return; }

    const alreadyExists = users.some((u) => u.email === email.trim());
    if (alreadyExists) { setFeedback({ type: "error", message: "A user with this email already exists." }); return; }

    setIsSubmitting(true);
    setFeedback(null);

    // Preserve the admin's session — supabase.auth.signUp() signs the browser
    // in as the new user, which would make the users-table insert run as the
    // new (unprivileged) user and fail RLS.
    const { data: { session: adminSession } } = await supabase.auth.getSession();

    // Create the Supabase Auth account.
    const signUpResult = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (signUpResult.error && !signUpResult.error.message.includes("already registered")) {
      setIsSubmitting(false);
      setFeedback({ type: "error", message: `Auth error: ${signUpResult.error.message}` });
      return;
    }

    // Restore the admin session so the users-table insert runs as the admin.
    if (adminSession) {
      await supabase.auth.setSession({
        access_token: adminSession.access_token,
        refresh_token: adminSession.refresh_token,
      });
    }

    // Create user record in our users table, linked to the new auth account.
    const newAuthId = signUpResult.data.user?.id;
    const userId = `user-${email.trim().replace(/[^a-z0-9]/gi, "-").toLowerCase()}`;
    try {
      await addUser({
        id: userId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        shopId: requiresShop ? shopId : undefined,
        authId: newAuthId,
        isActive: true,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      setIsSubmitting(false);
      setFeedback({
        type: "error",
        message: `Could not save the staff profile: ${error instanceof Error ? error.message : "unknown error"}`,
      });
      return;
    }

    setIsSubmitting(false);
    setFeedback({ type: "success", message: `${name} created. They can now log in with ${email}.` });
    resetForm();
  };

  const handleEdit = (id: string) => {
    const user = users.find((item) => item.id === id);
    if (!user) return;
    setEditingId(id);
    setName(user.name);
    setEmail(user.email ?? "");
    setPassword("");
    setRole(user.role);
    setShopId(user.shopId);
    setFeedback(null);
  };

  const handleToggleActive = async (id: string) => {
    const user = users.find((u) => u.id === id);
    if (!user) return;
    try {
      await updateUser({ ...user, isActive: !user.isActive });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Failed to update user." });
    }
  };

  return (
    <Card>
      <PageHeader
        title="Users"
        subtitle="Create staff accounts and assign roles. Staff log in with the email and password you set here."
      />
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <div className="text-sm font-semibold text-slate-700">
            {editingId ? "Edit user" : "Create staff account"}
          </div>

          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
          />

          {!editingId && (
            <>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="staff@yourcompany.com"
                autoComplete="off"
              />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min 6 characters)"
                autoComplete="new-password"
              />
            </>
          )}

          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="ADMIN">Admin</option>
            <option value="MANAGER">Manager</option>
            <option value="CASHIER">Cashier</option>
            <option value="BUYER">Buyer</option>
          </Select>

          {requiresShop && (
            <Select value={shopId ?? ""} onChange={(e) => setShopId(e.target.value || undefined)}>
              <option value="">Select a shop</option>
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>{shop.name}</option>
              ))}
            </Select>
          )}

          {feedback && (
            <div className={`text-sm rounded-xl px-3 py-2 ${feedback.type === "success" ? "bg-emerald-50 text-emerald-700" : "text-rose-600"}`}>
              {feedback.message}
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : editingId ? "Update" : "Create account"}
            </Button>
            {editingId && (
              <Button variant="secondary" onClick={resetForm}>Cancel</Button>
            )}
          </div>

          {!editingId && (
            <div className="rounded-2xl border border-dashed border-slate-200 p-3 text-xs text-slate-400">
              Make sure email confirmation is disabled in Supabase → Auth → Settings, otherwise staff need to confirm their email before logging in.
            </div>
          )}
        </div>

        <div className="space-y-3">
          {users.map((user) => (
            <div
              key={user.id}
              className={`rounded-2xl border p-4 ${user.isActive ? "border-slate-200/70 bg-slate-50/60" : "border-slate-100 bg-slate-50/30 opacity-60"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-sm">{user.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{user.email ?? "—"}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {user.role}
                    {user.shopId ? ` · ${shops.find((s) => s.id === user.shopId)?.name ?? user.shopId}` : ""}
                    {!user.isActive && " · Inactive"}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="secondary" className="text-xs py-1 px-2" onClick={() => handleEdit(user.id)}>
                    Edit
                  </Button>
                  <Button
                    variant={user.isActive ? "danger" : "secondary"}
                    className="text-xs py-1 px-2"
                    onClick={() => handleToggleActive(user.id)}
                  >
                    {user.isActive ? "Disable" : "Enable"}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
};
