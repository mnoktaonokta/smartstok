"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import {
  upsertCompanyProfileAction,
  type CompanySettingsForm,
} from "@/lib/actions/company-settings";
import { AdminSettingsBackNav } from "@/components/admin/admin-settings-back-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CompanyProfileSettingsForm({
  initial,
}: {
  initial: CompanySettingsForm;
}) {
  const [form, setForm] = useState({
    companyName: initial.companyName,
    address: initial.address,
    vkn: initial.vkn,
    taxOffice: initial.taxOffice,
    phone: initial.phone,
  });
  const [logoPreview, setLogoPreview] = useState(initial.logoPreviewUrl);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function setField(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await upsertCompanyProfileAction(form);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSuccess("Firma bilgileri kaydedildi.");
    });
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Aynı dosyayı tekrar seçebilsin
    e.target.value = "";
    if (!file) return;
    setError(null);
    setSuccess(null);
    const fd = new FormData();
    fd.append("logo", file, file.name);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/company-logo", {
          method: "POST",
          body: fd,
        });
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          logoPreviewUrl?: string | null;
        } | null;
        if (!res.ok || data?.error) {
          setError(data?.error ?? "Logo yüklenemedi.");
          return;
        }
        setLogoPreview(data?.logoPreviewUrl ?? null);
        setSuccess("Logo yüklendi. Fatura görsellerinde kullanılabilir.");
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Logo yüklenirken bir hata oluştu.",
        );
      }
    });
  }

  function handleClearLogo() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/company-logo", {
          method: "DELETE",
        });
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        if (!res.ok || data?.error) {
          setError(data?.error ?? "Logo silinemedi.");
          return;
        }
        setLogoPreview(null);
        setSuccess("Logo kaldırıldı.");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Logo silinemedi.",
        );
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <AdminSettingsBackNav
        title="Firma Bilgileri"
        description="Unvan, vergi ve iletişim bilgileri; fatura logosu."
      />

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-5 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="companyName">Unvan</Label>
            <Input
              id="companyName"
              value={form.companyName}
              onChange={(e) => setField("companyName", e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vkn">VKN / TCKN</Label>
            <Input
              id="vkn"
              value={form.vkn}
              onChange={(e) => setField("vkn", e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="taxOffice">Vergi Dairesi</Label>
            <Input
              id="taxOffice"
              value={form.taxOffice}
              onChange={(e) => setField("taxOffice", e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Telefon</Label>
            <Input
              id="phone"
              value={form.phone}
              onChange={(e) => setField("phone", e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="address">Adres</Label>
            <Input
              id="address"
              value={form.address}
              onChange={(e) => setField("address", e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-5">
          <div>
            <h2 className="text-sm font-medium text-zinc-200">Firma logosu</h2>
            <p className="mt-1 text-xs text-zinc-500">
              PNG / JPEG / WebP · en fazla 1,5 MB. Fatura görselinde kullanılmak
              üzere saklanır.
            </p>
          </div>
          {logoPreview ? (
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoPreview}
                alt="Firma logosu"
                className="h-16 w-auto rounded-lg border border-zinc-700 bg-white object-contain p-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={handleClearLogo}
              >
                <Trash2 className="size-3.5" />
                Kaldır
              </Button>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="logo-file">Logo yükle</Label>
            <Input
              id="logo-file"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              disabled={isPending}
              onChange={handleLogoChange}
            />
          </div>
        </div>

        {error ? (
          <p className="text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="text-sm text-emerald-300">{success}</p>
        ) : null}

        <Button type="submit" disabled={isPending} className="min-w-40">
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          Kaydet
        </Button>
      </form>
    </div>
  );
}
