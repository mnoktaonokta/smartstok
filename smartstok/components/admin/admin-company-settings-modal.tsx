"use client";

import { useEffect, useState, useTransition } from "react";
import { Building2, Eye, EyeOff, Loader2 } from "lucide-react";
import {
  getCompanySettingsAction,
  upsertCompanySettingsAction,
  type CompanySettingsForm,
} from "@/lib/actions/company-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const emptyForm: CompanySettingsForm = {
  companyName: "",
  address: "",
  vkn: "",
  taxOffice: "",
  phone: "",
  aiApiKey: "",
  utsFirmNo: "",
  utsToken: "",
  erpProvider: "BIZIMHESAP",
  bhFirmId: "",
  bhToken: "",
  bhApiKey: "",
  parasutCompanyId: "",
  parasutClientId: "",
  parasutClientSecret: "",
  parasutUsername: "",
  parasutPassword: "",
  logoFirmNo: "",
  logoApiKey: "",
  logoUsername: "",
  logoPassword: "",
};

function SecretField({
  id,
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          autoComplete="off"
          placeholder={placeholder}
          className="pr-11"
        />
        <button
          type="button"
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Gizle" : "Göster"}
          tabIndex={-1}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}

export function AdminCompanySettingsModal() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CompanySettingsForm>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function setField<K extends keyof CompanySettingsForm>(
    key: K,
    value: CompanySettingsForm[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await getCompanySettingsAction();
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.settings) setForm(result.settings);
    });
  }, [open]);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await upsertCompanySettingsAction(form);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.settings) setForm(result.settings);
      setSuccess("Firma bilgileri kaydedildi.");
    });
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Building2 className="size-4" />
        Firma Bilgileri
      </Button>

      <Dialog open={open} onOpenChange={setOpen} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Firma Bilgileri & Entegrasyonlar</DialogTitle>
          <DialogDescription>
            Unvan, ERP anahtarları, ÜTS ve yapay zeka ayarları (id: 1).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave}>
          <DialogContent className="space-y-6">
            <section className="space-y-3">
              <h3 className="text-sm font-medium text-zinc-300">Firma</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="cs-name">Unvan</Label>
                  <Input
                    id="cs-name"
                    value={form.companyName}
                    onChange={(e) => setField("companyName", e.target.value)}
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cs-vkn">VKN / TCKN</Label>
                  <Input
                    id="cs-vkn"
                    value={form.vkn}
                    onChange={(e) => setField("vkn", e.target.value)}
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cs-tax">Vergi Dairesi</Label>
                  <Input
                    id="cs-tax"
                    value={form.taxOffice}
                    onChange={(e) => setField("taxOffice", e.target.value)}
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cs-phone">Telefon</Label>
                  <Input
                    id="cs-phone"
                    value={form.phone}
                    onChange={(e) => setField("phone", e.target.value)}
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="cs-addr">Adres</Label>
                  <Input
                    id="cs-addr"
                    value={form.address}
                    onChange={(e) => setField("address", e.target.value)}
                    disabled={isPending}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-medium text-zinc-300">
                Entegratör Seçimi
              </h3>
              <Select
                id="cs-erp"
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
            </section>

            {form.erpProvider === "BIZIMHESAP" ? (
              <section className="space-y-3">
                <h3 className="text-sm font-medium text-zinc-300">
                  Bizim Hesap API
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SecretField
                    id="cs-bh-firm"
                    label="Firm ID"
                    value={form.bhFirmId}
                    onChange={(v) => setField("bhFirmId", v)}
                    disabled={isPending}
                  />
                  <SecretField
                    id="cs-bh-token"
                    label="Token (Api Key)"
                    value={form.bhToken}
                    onChange={(v) => setField("bhToken", v)}
                    disabled={isPending}
                  />
                  <div className="sm:col-span-2">
                    <SecretField
                      id="cs-bh-key"
                      label="B2B API Key"
                      value={form.bhApiKey}
                      onChange={(v) => setField("bhApiKey", v)}
                      disabled={isPending}
                      placeholder="Bizimhesap farklı bir key vermediyse bu alanı boş bırakabilirsiniz."
                    />
                  </div>
                </div>
              </section>
            ) : null}

            {form.erpProvider === "PARASUT" ? (
              <section className="space-y-3">
                <h3 className="text-sm font-medium text-zinc-300">Paraşüt API</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SecretField
                    id="cs-p-company"
                    label="Company ID"
                    value={form.parasutCompanyId}
                    onChange={(v) => setField("parasutCompanyId", v)}
                    disabled={isPending}
                  />
                  <SecretField
                    id="cs-p-client"
                    label="Client ID"
                    value={form.parasutClientId}
                    onChange={(v) => setField("parasutClientId", v)}
                    disabled={isPending}
                  />
                  <SecretField
                    id="cs-p-secret"
                    label="Client Secret"
                    value={form.parasutClientSecret}
                    onChange={(v) => setField("parasutClientSecret", v)}
                    disabled={isPending}
                  />
                  <SecretField
                    id="cs-p-user"
                    label="Kullanıcı adı"
                    value={form.parasutUsername}
                    onChange={(v) => setField("parasutUsername", v)}
                    disabled={isPending}
                  />
                  <div className="sm:col-span-2">
                    <SecretField
                      id="cs-p-pass"
                      label="Şifre"
                      value={form.parasutPassword}
                      onChange={(v) => setField("parasutPassword", v)}
                      disabled={isPending}
                    />
                  </div>
                </div>
              </section>
            ) : null}

            {form.erpProvider === "ELOGO" ? (
              <section className="space-y-3">
                <h3 className="text-sm font-medium text-zinc-300">e-Logo API</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SecretField
                    id="cs-l-firm"
                    label="Firma No"
                    value={form.logoFirmNo}
                    onChange={(v) => setField("logoFirmNo", v)}
                    disabled={isPending}
                  />
                  <SecretField
                    id="cs-l-key"
                    label="API Key"
                    value={form.logoApiKey}
                    onChange={(v) => setField("logoApiKey", v)}
                    disabled={isPending}
                  />
                  <SecretField
                    id="cs-l-user"
                    label="Kullanıcı adı"
                    value={form.logoUsername}
                    onChange={(v) => setField("logoUsername", v)}
                    disabled={isPending}
                  />
                  <SecretField
                    id="cs-l-pass"
                    label="Şifre"
                    value={form.logoPassword}
                    onChange={(v) => setField("logoPassword", v)}
                    disabled={isPending}
                  />
                </div>
              </section>
            ) : null}

            <section className="space-y-3">
              <h3 className="text-sm font-medium text-zinc-300">
                ÜTS & Yapay Zeka
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <SecretField
                  id="cs-uts-firm"
                  label="ÜTS Firma / Kurum No"
                  value={form.utsFirmNo}
                  onChange={(v) => setField("utsFirmNo", v)}
                  disabled={isPending}
                />
                <SecretField
                  id="cs-uts-token"
                  label="ÜTS Token"
                  value={form.utsToken}
                  onChange={(v) => setField("utsToken", v)}
                  disabled={isPending}
                />
                <div className="sm:col-span-2">
                  <SecretField
                    id="cs-ai"
                    label="AI API Key (OpenAI)"
                    value={form.aiApiKey}
                    onChange={(v) => setField("aiApiKey", v)}
                    disabled={isPending}
                  />
                </div>
              </div>
            </section>

            {error ? (
              <p className="text-sm text-red-300" role="alert">
                {error}
              </p>
            ) : null}
            {success ? (
              <p className="text-sm text-emerald-300">{success}</p>
            ) : null}
          </DialogContent>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Kapat
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Kaydet
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </>
  );
}
