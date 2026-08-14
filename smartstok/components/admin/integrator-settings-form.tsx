"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import {
  upsertIntegratorSettingsAction,
  type CompanySettingsForm,
} from "@/lib/actions/company-settings";
import { AdminSettingsBackNav } from "@/components/admin/admin-settings-back-nav";
import { SecretField } from "@/components/admin/secret-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export function IntegratorSettingsForm({
  initial,
}: {
  initial: CompanySettingsForm;
}) {
  const [form, setForm] = useState({
    erpProvider: initial.erpProvider,
    bhFirmId: initial.bhFirmId,
    bhToken: initial.bhToken,
    bhApiKey: initial.bhApiKey,
    parasutCompanyId: initial.parasutCompanyId,
    parasutClientId: initial.parasutClientId,
    parasutClientSecret: initial.parasutClientSecret,
    parasutUsername: initial.parasutUsername,
    parasutPassword: initial.parasutPassword,
    logoFirmNo: initial.logoFirmNo,
    logoApiKey: initial.logoApiKey,
    logoUsername: initial.logoUsername,
    logoPassword: initial.logoPassword,
    aiApiKey: initial.aiApiKey,
    utsFirmNo: initial.utsFirmNo,
    utsToken: initial.utsToken,
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await upsertIntegratorSettingsAction(form);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSuccess("Entegratör ayarları kaydedildi.");
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <AdminSettingsBackNav
        title="Entegratör Seçimi"
        description="Muhasebe / cari entegratörü, ÜTS ve yapay zeka anahtarları."
      />

      <form onSubmit={handleSave} className="space-y-6">
        <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-5">
          <div className="space-y-2">
            <Label htmlFor="erpProvider">Entegratör</Label>
            <Select
              id="erpProvider"
              value={form.erpProvider}
              onChange={(e) =>
                setField(
                  "erpProvider",
                  e.target.value as CompanySettingsForm["erpProvider"],
                )
              }
              disabled={isPending}
            >
              <option value="BIZIMHESAP">Bizim Hesap</option>
              <option value="ELOGO">e-Logo</option>
              <option value="PARASUT">Paraşüt</option>
            </Select>
          </div>

          {form.erpProvider === "BIZIMHESAP" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <SecretField
                id="bhFirmId"
                label="Firm ID"
                value={form.bhFirmId}
                onChange={(v) => setField("bhFirmId", v)}
                disabled={isPending}
              />
              <SecretField
                id="bhToken"
                label="Token (Api Key)"
                value={form.bhToken}
                onChange={(v) => setField("bhToken", v)}
                disabled={isPending}
              />
              <div className="sm:col-span-2">
                <SecretField
                  id="bhApiKey"
                  label="B2B API Key"
                  value={form.bhApiKey}
                  onChange={(v) => setField("bhApiKey", v)}
                  disabled={isPending}
                  placeholder="Farklı bir key yoksa boş bırakın"
                />
              </div>
            </div>
          ) : null}

          {form.erpProvider === "PARASUT" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <SecretField
                id="parasutCompanyId"
                label="Company ID"
                value={form.parasutCompanyId}
                onChange={(v) => setField("parasutCompanyId", v)}
                disabled={isPending}
              />
              <SecretField
                id="parasutClientId"
                label="Client ID"
                value={form.parasutClientId}
                onChange={(v) => setField("parasutClientId", v)}
                disabled={isPending}
              />
              <SecretField
                id="parasutClientSecret"
                label="Client Secret"
                value={form.parasutClientSecret}
                onChange={(v) => setField("parasutClientSecret", v)}
                disabled={isPending}
              />
              <SecretField
                id="parasutUsername"
                label="Kullanıcı adı"
                value={form.parasutUsername}
                onChange={(v) => setField("parasutUsername", v)}
                disabled={isPending}
              />
              <div className="sm:col-span-2">
                <SecretField
                  id="parasutPassword"
                  label="Şifre"
                  value={form.parasutPassword}
                  onChange={(v) => setField("parasutPassword", v)}
                  disabled={isPending}
                />
              </div>
            </div>
          ) : null}

          {form.erpProvider === "ELOGO" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <SecretField
                id="logoFirmNo"
                label="Firma No"
                value={form.logoFirmNo}
                onChange={(v) => setField("logoFirmNo", v)}
                disabled={isPending}
              />
              <SecretField
                id="logoApiKey"
                label="API Key"
                value={form.logoApiKey}
                onChange={(v) => setField("logoApiKey", v)}
                disabled={isPending}
              />
              <SecretField
                id="logoUsername"
                label="Kullanıcı adı"
                value={form.logoUsername}
                onChange={(v) => setField("logoUsername", v)}
                disabled={isPending}
              />
              <SecretField
                id="logoPassword"
                label="Şifre"
                value={form.logoPassword}
                onChange={(v) => setField("logoPassword", v)}
                disabled={isPending}
              />
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-5 sm:grid-cols-2">
          <h2 className="text-sm font-medium text-zinc-200 sm:col-span-2">
            ÜTS & Yapay Zeka
          </h2>
          <SecretField
            id="utsFirmNo"
            label="ÜTS Firma / Kurum No"
            value={form.utsFirmNo}
            onChange={(v) => setField("utsFirmNo", v)}
            disabled={isPending}
          />
          <SecretField
            id="utsToken"
            label="ÜTS Token"
            value={form.utsToken}
            onChange={(v) => setField("utsToken", v)}
            disabled={isPending}
          />
          <div className="sm:col-span-2">
            <SecretField
              id="aiApiKey"
              label="AI API Key"
              value={form.aiApiKey}
              onChange={(v) => setField("aiApiKey", v)}
              disabled={isPending}
              placeholder="Mal kabul fatura OCR / analiz"
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
          {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Kaydet
        </Button>
      </form>
    </div>
  );
}
