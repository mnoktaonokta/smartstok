"use client";

import { useState, useTransition } from "react";
import { Loader2, PlugZap } from "lucide-react";
import {
  upsertInvoiceSettingsAction,
  type CompanySettingsForm,
} from "@/lib/actions/company-settings";
import { testQnbConnectionAction } from "@/lib/actions/qnb-connection-test";
import { testElogoConnectionAction } from "@/lib/actions/elogo-connection-test";
import { AdminSettingsBackNav } from "@/components/admin/admin-settings-back-nav";
import { SecretField } from "@/components/admin/secret-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function InvoiceSettingsForm({
  initial,
}: {
  initial: CompanySettingsForm;
}) {
  const [form, setForm] = useState({
    eDocumentProvider: initial.eDocumentProvider,
    qnbUsername: initial.qnbUsername,
    qnbPassword: initial.qnbPassword,
    qnbErpKodu: initial.qnbErpKodu,
    qnbVkn: initial.qnbVkn,
    qnbEnvironment: initial.qnbEnvironment,
    elogoUsername: initial.elogoUsername,
    elogoPassword: initial.elogoPassword,
    elogoEnvironment: initial.elogoEnvironment,
    bankAccountInfo: initial.bankAccountInfo,
  });
  const [companyVkn] = useState(initial.vkn);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [qnbTestVkn, setQnbTestVkn] = useState("");
  const [qnbTestMsg, setQnbTestMsg] = useState<string | null>(null);
  const [qnbTestError, setQnbTestError] = useState<string | null>(null);
  const [qnbTesting, startQnbTest] = useTransition();
  const [elogoTestVkn, setElogoTestVkn] = useState("");
  const [elogoTestMsg, setElogoTestMsg] = useState<string | null>(null);
  const [elogoTestError, setElogoTestError] = useState<string | null>(null);
  const [elogoTesting, startElogoTest] = useTransition();

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await upsertInvoiceSettingsAction(form);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSuccess("Fatura bilgileri kaydedildi.");
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <AdminSettingsBackNav
        title="Fatura Bilgileri"
        description="E-belge sağlayıcısı, bağlantı bilgileri ve banka hesabı."
      />

      <form onSubmit={handleSave} className="space-y-6">
        <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-5">
          <div className="space-y-2">
            <Label htmlFor="eDocumentProvider">E-belge sağlayıcısı</Label>
            <Select
              id="eDocumentProvider"
              value={form.eDocumentProvider}
              onChange={(e) =>
                setField(
                  "eDocumentProvider",
                  e.target.value as CompanySettingsForm["eDocumentProvider"],
                )
              }
              disabled={isPending}
            >
              <option value="QNB">QNB eSolutions</option>
              <option value="ELOGO">e-Logo</option>
            </Select>
          </div>

          {form.eDocumentProvider === "QNB" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <SecretField
                id="qnbUsername"
                label="Kullanıcı adı"
                value={form.qnbUsername}
                onChange={(v) => setField("qnbUsername", v)}
                disabled={isPending}
              />
              <SecretField
                id="qnbPassword"
                label="Şifre"
                value={form.qnbPassword}
                onChange={(v) => setField("qnbPassword", v)}
                disabled={isPending}
              />
              <div className="space-y-2">
                <Label htmlFor="qnbErpKodu">ERP Kodu (opsiyonel)</Label>
                <Input
                  id="qnbErpKodu"
                  value={form.qnbErpKodu}
                  onChange={(e) => setField("qnbErpKodu", e.target.value)}
                  disabled={isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="qnbVkn">QNB VKN (opsiyonel)</Label>
                <Input
                  id="qnbVkn"
                  value={form.qnbVkn}
                  onChange={(e) => setField("qnbVkn", e.target.value)}
                  disabled={isPending}
                  placeholder="Boşsa firma VKN kullanılır"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="qnbEnvironment">Ortam</Label>
                <Select
                  id="qnbEnvironment"
                  value={form.qnbEnvironment}
                  onChange={(e) =>
                    setField(
                      "qnbEnvironment",
                      e.target.value as CompanySettingsForm["qnbEnvironment"],
                    )
                  }
                  disabled={isPending}
                >
                  <option value="TEST">TEST</option>
                  <option value="LIVE">LIVE</option>
                </Select>
              </div>
              <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 sm:col-span-2">
                <div className="space-y-2">
                  <Label htmlFor="qnb-test-vkn">Sorgulanacak VKN / TCKN</Label>
                  <Input
                    id="qnb-test-vkn"
                    value={qnbTestVkn}
                    onChange={(e) => setQnbTestVkn(e.target.value)}
                    disabled={isPending || qnbTesting}
                    placeholder={companyVkn || form.qnbVkn || "VKN"}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending || qnbTesting}
                  onClick={() => {
                    setQnbTestMsg(null);
                    setQnbTestError(null);
                    startQnbTest(async () => {
                      const r = await testQnbConnectionAction({
                        queryVkn: qnbTestVkn || form.qnbVkn || companyVkn,
                        qnbUsername: form.qnbUsername,
                        qnbPassword: form.qnbPassword,
                        qnbErpKodu: form.qnbErpKodu,
                        qnbVkn: form.qnbVkn,
                        qnbEnvironment: form.qnbEnvironment,
                        companyVkn,
                      });
                      if (r.error) {
                        setQnbTestError(r.error);
                        return;
                      }
                      setQnbTestMsg(r.message ?? "Tamam.");
                    });
                  }}
                >
                  {qnbTesting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <PlugZap className="size-4" />
                  )}
                  QNB bağlantısını test et
                </Button>
                {qnbTestError ? (
                  <p className="text-sm text-red-300">{qnbTestError}</p>
                ) : null}
                {qnbTestMsg ? (
                  <p className="text-sm text-emerald-300">{qnbTestMsg}</p>
                ) : null}
              </div>
            </div>
          ) : null}

          {form.eDocumentProvider === "ELOGO" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <SecretField
                id="elogoUsername"
                label="Kullanıcı kodu"
                value={form.elogoUsername}
                onChange={(v) => setField("elogoUsername", v)}
                disabled={isPending}
              />
              <SecretField
                id="elogoPassword"
                label="Şifre"
                value={form.elogoPassword}
                onChange={(v) => setField("elogoPassword", v)}
                disabled={isPending}
              />
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="elogoEnvironment">Ortam</Label>
                <Select
                  id="elogoEnvironment"
                  value={form.elogoEnvironment}
                  onChange={(e) =>
                    setField(
                      "elogoEnvironment",
                      e.target
                        .value as CompanySettingsForm["elogoEnvironment"],
                    )
                  }
                  disabled={isPending}
                >
                  <option value="TEST">TEST (pb-demo.elogo.com.tr)</option>
                  <option value="LIVE">LIVE (pb.elogo.com.tr)</option>
                </Select>
              </div>
              <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 sm:col-span-2">
                <div className="space-y-2">
                  <Label htmlFor="elogo-test-vkn">Sorgulanacak VKN / TCKN</Label>
                  <Input
                    id="elogo-test-vkn"
                    value={elogoTestVkn}
                    onChange={(e) => setElogoTestVkn(e.target.value)}
                    disabled={isPending || elogoTesting}
                    placeholder={companyVkn || "VKN"}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending || elogoTesting}
                  onClick={() => {
                    setElogoTestMsg(null);
                    setElogoTestError(null);
                    startElogoTest(async () => {
                      const r = await testElogoConnectionAction({
                        queryVkn: elogoTestVkn || companyVkn,
                        elogoUsername: form.elogoUsername,
                        elogoPassword: form.elogoPassword,
                        elogoEnvironment: form.elogoEnvironment,
                        companyVkn,
                      });
                      if (r.error) {
                        setElogoTestError(r.error);
                        return;
                      }
                      setElogoTestMsg(r.message ?? "Tamam.");
                    });
                  }}
                >
                  {elogoTesting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <PlugZap className="size-4" />
                  )}
                  e-Logo bağlantısını test et
                </Button>
                {elogoTestError ? (
                  <p className="text-sm text-red-300">{elogoTestError}</p>
                ) : null}
                {elogoTestMsg ? (
                  <p className="text-sm text-emerald-300">{elogoTestMsg}</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-5">
          <div>
            <Label htmlFor="bankAccountInfo">Banka Hesap Bilgileriniz</Label>
            <p className="mt-1 text-xs text-zinc-500">
              Bu metin fatura kesilirken otomatik olarak fatura açıklama
              (Note) alanına eklenir.
            </p>
          </div>
          <textarea
            id="bankAccountInfo"
            value={form.bankAccountInfo}
            onChange={(e) => setField("bankAccountInfo", e.target.value)}
            disabled={isPending}
            rows={5}
            placeholder={"Örn.\nTR12 ACCT-000009 9012 34\nBanka Adı / Şube"}
            className={cn(
              "flex w-full rounded-md border border-input-border bg-input px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:border-blue-500/60 disabled:cursor-not-allowed disabled:opacity-50",
            )}
          />
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
