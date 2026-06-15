import { useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { PageHeader } from "../components/layout/PageHeader";
import { ProductImageInput } from "../components/forms/ProductImageInput";
import { useToast } from "../components/ui/Toast";
import { useTranslation } from "../hooks/useTranslation";
import { useAuthStore } from "../stores/authStore";
import { useAppStore } from "../stores/appStore";
import { useDataStore } from "../stores/dataStore";
import { getErrorMessage } from "../lib/errors";
import type { BusinessProfile } from "../types";

// Business brand editor: name, logo and contact details shown across the app
// (sidebar header, receipts). Singleton row managed via updateBusinessProfile.
export const ProfilePage = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const currentRole = useAuthStore((state) => state.currentRole);
  const currentShopId = useAppStore((state) => state.currentShopId);
  const businessProfile = useDataStore((state) => state.businessProfile);
  const updateBusinessProfile = useDataStore((state) => state.updateBusinessProfile);

  const [form, setForm] = useState<BusinessProfile>({});
  const [saving, setSaving] = useState(false);
  const seededRef = useRef(false);

  // Seed the form from the loaded profile once it's available (async-first so no
  // setState runs synchronously inside the effect body).
  useEffect(() => {
    if (seededRef.current || !businessProfile) return;
    seededRef.current = true;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setForm(businessProfile);
    });
    return () => {
      cancelled = true;
    };
  }, [businessProfile]);

  if (currentRole !== "ADMIN") return <Navigate to="/app" replace />;

  const set = <K extends keyof BusinessProfile>(key: K, value: BusinessProfile[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await updateBusinessProfile(form);
      toast({ variant: "success", title: t("profile", "saved") });
    } catch (error) {
      toast({ variant: "error", title: t("profile", "saveFailed"), description: getErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <PageHeader title={t("profile", "title")} subtitle={t("profile", "subtitle")} />

      <form className="mt-6 max-w-2xl space-y-5" onSubmit={handleSubmit}>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t("profile", "logo")}</label>
          <ProductImageInput
            productId="brand"
            shopId={currentShopId}
            value={form.logoUrl}
            onChange={(value) => set("logoUrl", value)}
          />
          <p className="mt-1 text-xs text-slate-500">{t("profile", "logoHint")}</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t("profile", "businessName")}</label>
          <Input
            value={form.businessName ?? ""}
            onChange={(e) => set("businessName", e.target.value)}
            placeholder={t("profile", "businessNamePlaceholder")}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t("profile", "tagline")}</label>
          <Input
            value={form.tagline ?? ""}
            onChange={(e) => set("tagline", e.target.value)}
            placeholder={t("profile", "taglinePlaceholder")}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t("profile", "address")}</label>
          <Input
            value={form.address ?? ""}
            onChange={(e) => set("address", e.target.value)}
            placeholder={t("profile", "addressPlaceholder")}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t("profile", "phone")}</label>
            <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder="09…" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t("profile", "email")}</label>
            <Input
              type="email"
              value={form.email ?? ""}
              onChange={(e) => set("email", e.target.value)}
              placeholder="shop@email.com"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={saving}>
            {saving ? t("profile", "saving") : t("profile", "save")}
          </Button>
        </div>
      </form>
    </Card>
  );
};
