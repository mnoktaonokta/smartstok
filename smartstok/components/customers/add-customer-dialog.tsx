"use client";

import { useEffect, useState, useTransition } from "react";
import { Building2, Loader2, Plus } from "lucide-react";
import {
  createCustomerWithDepotAction,
  fetchUtsKurumNoByVknAction,
  type SahaRepOption,
} from "@/lib/actions/customers";
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

const emptyForm = {
  vknTckn: "",
  name: "",
  taxOffice: "",
  address: "",
  phone: "",
  bizimHesapId: "",
  utsInstitutionNumber: "",
  assignedUserId: "",
  isPublicEntity: false,
  spendingUnitVkn: "",
};

export function AddCustomerDialog({
  showRepSelect = false,
  reps = [],
}: {
  showRepSelect?: boolean;
  reps?: SahaRepOption[];
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [utsLookupPending, startUtsLookup] = useTransition();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  function reset() {
    setForm(emptyForm);
    setError(null);
    setToast(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  function setField(
    key: keyof typeof emptyForm,
    value: string | boolean,
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await createCustomerWithDepotAction({
        vknTckn: form.vknTckn,
        name: form.name,
        taxOffice: form.taxOffice || undefined,
        address: form.address || undefined,
        phone: form.phone || undefined,
        bizimHesapId: form.bizimHesapId || undefined,
        utsInstitutionNumber: form.utsInstitutionNumber || null,
        assignedUserId: showRepSelect
          ? form.assignedUserId || null
          : undefined,
        isPublicEntity: Boolean(form.isPublicEntity),
        spendingUnitVkn: form.isPublicEntity
          ? form.spendingUnitVkn.replace(/\D/g, "") || null
          : null,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      handleOpenChange(false);
    });
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Yeni Müşteri Ekle
      </Button>

      {toast ? (
        <div
          className={
            toast.type === "ok"
              ? "fixed right-4 bottom-4 z-[60] max-w-sm rounded-lg border border-emerald-500/40 bg-zinc-950 px-4 py-3 text-sm text-emerald-100 shadow-lg"
              : "fixed right-4 bottom-4 z-[60] max-w-sm rounded-lg border border-red-500/40 bg-zinc-950 px-4 py-3 text-sm text-red-100 shadow-lg"
          }
          role="status"
        >
          <p>{toast.text}</p>
          <button
            type="button"
            className="mt-2 text-xs text-zinc-400 underline"
            onClick={() => setToast(null)}
          >
            Kapat
          </button>
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={handleOpenChange} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Yeni Müşteri</DialogTitle>
          <DialogDescription>
            Klinik bilgilerini girin. Kayıt ile otomatik konsinye deposu
            oluşturulur.
          </DialogDescription>
        </DialogHeader>

        <DialogContent className="max-h-[70vh] space-y-4 overflow-y-auto">
          <div className="space-y-2">
            <Label htmlFor="vkn">VKN / TCKN</Label>
            <div className="flex gap-2">
              <Input
                id="vkn"
                value={form.vknTckn}
                onChange={(e) =>
                  setField("vknTckn", e.target.value.replace(/\D/g, ""))
                }
                placeholder="10 veya 11 haneli numara"
                maxLength={11}
                className="font-mono"
                disabled={isPending}
                required
              />
              <Button
                type="button"
                size="sm"
                disabled={
                  isPending ||
                  utsLookupPending ||
                  form.vknTckn.length < 10
                }
                onClick={() => {
                  setError(null);
                  setToast(null);
                  startUtsLookup(async () => {
                    const result = await fetchUtsKurumNoByVknAction(
                      form.vknTckn,
                    );
                    if (result.error) {
                      setError(result.error);
                      setToast({ type: "err", text: result.error });
                      return;
                    }
                    setField("utsInstitutionNumber", result.data ?? "");
                    setToast({
                      type: "ok",
                      text: "ÜTS Kurum No başarıyla getirildi.",
                    });
                  });
                }}
                title="ÜTS'den Sorgula"
              >
                {utsLookupPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Building2 className="size-4" />
                )}
                ÜTS'den Sorgula
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Ünvan</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="Klinik / müşteri ünvanı"
              disabled={isPending}
              required
            />
          </div>

          <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-4 rounded border-zinc-600"
                checked={Boolean(form.isPublicEntity)}
                disabled={isPending}
                onChange={(e) => {
                  setField("isPublicEntity", e.target.checked);
                  if (!e.target.checked) setField("spendingUnitVkn", "");
                }}
              />
              <span>
                <span className="block text-sm font-medium text-zinc-200">
                  Cari bir kamu kurumu mu?
                </span>
                <span className="mt-0.5 block text-xs text-zinc-500">
                  İşaretlenince fatura senaryosu KAMUFATURASI olur; ana VKN
                  muhasebe birimi, harcama birimi ayrı VKN ile gider.
                </span>
              </span>
            </label>
            {form.isPublicEntity ? (
              <div className="space-y-2 pl-7">
                <Label htmlFor="spending-unit-vkn">Harcama Birimi VKN</Label>
                <Input
                  id="spending-unit-vkn"
                  value={form.spendingUnitVkn}
                  onChange={(e) =>
                    setField(
                      "spendingUnitVkn",
                      e.target.value.replace(/\D/g, ""),
                    )
                  }
                  placeholder="10 haneli VKN (fakülte / birim)"
                  maxLength={10}
                  className="font-mono"
                  disabled={isPending}
                  required
                />
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="tax-office">Vergi Dairesi</Label>
            <Input
              id="tax-office"
              value={form.taxOffice}
              onChange={(e) => setField("taxOffice", e.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Adres</Label>
            <Input
              id="address"
              value={form.address}
              onChange={(e) => setField("address", e.target.value)}
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

          <div className="space-y-2">
            <Label htmlFor="uts-kurum-no">ÜTS Kurum No</Label>
            <Input
              id="uts-kurum-no"
              value={form.utsInstitutionNumber}
              onChange={(e) => setField("utsInstitutionNumber", e.target.value)}
              placeholder="ÜTS'den Sorgula ile doldurulabilir"
              className="font-mono"
              disabled={isPending || utsLookupPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bizim-hesap-id">Bizim Hesap Cari Kodu</Label>
            <Input
              id="bizim-hesap-id"
              value={form.bizimHesapId}
              onChange={(e) => setField("bizimHesapId", e.target.value)}
              placeholder="İsteğe bağlı"
              className="font-mono"
              disabled={isPending}
            />
          </div>

          {showRepSelect ? (
            <div className="space-y-2">
              <Label htmlFor="assigned-rep">Sorumlu Temsilci</Label>
              <Select
                id="assigned-rep"
                value={form.assignedUserId}
                onChange={(e) => setField("assignedUserId", e.target.value)}
                disabled={isPending}
              >
                <option value="">Atanmamış</option>
                {reps.map((rep) => (
                  <option key={rep.id} value={rep.id}>
                    {rep.fullName}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <p className="text-xs text-amber-200/80">
              Bu müşteri portföyünüze otomatik atanacak.
            </p>
          )}

          {form.name.trim() ? (
            <p className="text-xs text-blue-300/80">
              Kayıt ile birlikte &quot;{form.name.trim()} Konsinye Deposu&quot;
              oluşturulacak.
            </p>
          ) : null}

          {error ? (
            <p
              className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </DialogContent>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            İptal
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={
              isPending ||
              form.vknTckn.length < 10 ||
              form.name.trim().length < 2 ||
              (form.isPublicEntity && form.spendingUnitVkn.length !== 10)
            }
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Kaydet
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
