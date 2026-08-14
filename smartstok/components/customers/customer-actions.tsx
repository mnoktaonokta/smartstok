"use client";

import { useEffect, useState, useTransition } from "react";
import { Building2, Loader2, Pencil, Trash2 } from "lucide-react";
import {
  deleteCustomerAction,
  updateCustomerAction,
  fetchUtsKurumNoByVknAction,
} from "@/lib/actions/customers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type CustomerRow = {
  id: string;
  vknTckn: string;
  name: string;
  taxOffice: string | null;
  address: string | null;
  phone: string | null;
  bizimHesapId: string | null;
  utsInstitutionNumber: string | null;
  isPublicEntity?: boolean;
  spendingUnitVkn?: string | null;
};

export function CustomerActions({
  customer,
  canDelete = false,
}: {
  customer: CustomerRow;
  canDelete?: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
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

  const [name, setName] = useState(customer.name);
  const [taxOffice, setTaxOffice] = useState(customer.taxOffice ?? "");
  const [address, setAddress] = useState(customer.address ?? "");
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [bizimHesapId, setBizimHesapId] = useState(customer.bizimHesapId ?? "");
  const [utsInstitutionNumber, setUtsInstitutionNumber] = useState(
    customer.utsInstitutionNumber ?? "",
  );
  const [isPublicEntity, setIsPublicEntity] = useState(
    () => Boolean(customer.isPublicEntity),
  );
  const [spendingUnitVkn, setSpendingUnitVkn] = useState(
    () => customer.spendingUnitVkn ?? "",
  );

  function openEdit() {
    setName(customer.name);
    setTaxOffice(customer.taxOffice ?? "");
    setAddress(customer.address ?? "");
    setPhone(customer.phone ?? "");
    setBizimHesapId(customer.bizimHesapId ?? "");
    setUtsInstitutionNumber(customer.utsInstitutionNumber ?? "");
    setIsPublicEntity(Boolean(customer.isPublicEntity));
    setSpendingUnitVkn(customer.spendingUnitVkn ?? "");
    setError(null);
    setToast(null);
    setEditOpen(true);
  }

  function handleUpdate() {
    setError(null);
    startTransition(async () => {
      const result = await updateCustomerAction({
        id: customer.id,
        name,
        taxOffice,
        address,
        phone,
        bizimHesapId,
        utsInstitutionNumber: utsInstitutionNumber || null,
        isPublicEntity: Boolean(isPublicEntity),
        spendingUnitVkn: isPublicEntity
          ? spendingUnitVkn.replace(/\D/g, "") || null
          : null,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setEditOpen(false);
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteCustomerAction(customer.id);

      if (result.error) {
        setError(result.error);
        return;
      }

      setDeleteOpen(false);
    });
  }

  return (
    <>
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

      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={openEdit}
          aria-label="Düzenle"
          className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md p-2 text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
        >
          <Pencil className="size-4 text-blue-400" />
        </button>
        {canDelete ? (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setDeleteOpen(true);
            }}
            aria-label="Sil"
            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md p-2 text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
          >
            <Trash2 className="size-4 text-red-400" />
          </button>
        ) : null}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogHeader>
          <DialogTitle>Müşteri Düzenle</DialogTitle>
          <DialogDescription>
            VKN/TCKN değiştirilemez. Ünvan güncellenirse konsinye depo adı da
            senkronlanır.
          </DialogDescription>
        </DialogHeader>

        <DialogContent className="space-y-4">
          <div className="space-y-2">
            <Label>VKN / TCKN</Label>
            <div className="flex gap-2">
              <Input value={customer.vknTckn} disabled className="font-mono" />
              <Button
                type="button"
                size="sm"
                disabled={isPending || utsLookupPending}
                onClick={() => {
                  setError(null);
                  setToast(null);
                  startUtsLookup(async () => {
                    const result = await fetchUtsKurumNoByVknAction(
                      customer.vknTckn,
                    );
                    if (result.error) {
                      setError(result.error);
                      setToast({ type: "err", text: result.error });
                      return;
                    }
                    setUtsInstitutionNumber(result.data ?? "");
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
            <Label htmlFor={`uts-${customer.id}`}>ÜTS Kurum No</Label>
            <Input
              id={`uts-${customer.id}`}
              value={utsInstitutionNumber}
              onChange={(e) => setUtsInstitutionNumber(e.target.value)}
              disabled={isPending || utsLookupPending}
              placeholder="ÜTS kurum numarası"
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`name-${customer.id}`}>Ünvan</Label>
            <Input
              id={`name-${customer.id}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isPending}
              required
            />
          </div>

          <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-4 rounded border-zinc-600"
                checked={Boolean(isPublicEntity)}
                disabled={isPending}
                onChange={(e) => {
                  setIsPublicEntity(e.target.checked);
                  if (!e.target.checked) setSpendingUnitVkn("");
                }}
              />
              <span>
                <span className="block text-sm font-medium text-zinc-200">
                  Cari bir kamu kurumu mu?
                </span>
                <span className="mt-0.5 block text-xs text-zinc-500">
                  Fatura senaryosu KAMUFATURASI; ana VKN muhasebe, ikinci VKN
                  harcama birimi.
                </span>
              </span>
            </label>
            {isPublicEntity ? (
              <div className="space-y-2 pl-7">
                <Label htmlFor={`spend-${customer.id}`}>
                  Harcama Birimi VKN
                </Label>
                <Input
                  id={`spend-${customer.id}`}
                  value={spendingUnitVkn}
                  onChange={(e) =>
                    setSpendingUnitVkn(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="10 haneli VKN"
                  maxLength={10}
                  className="font-mono"
                  disabled={isPending}
                  required
                />
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={`tax-${customer.id}`}>Vergi Dairesi</Label>
            <Input
              id={`tax-${customer.id}`}
              value={taxOffice}
              onChange={(e) => setTaxOffice(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`address-${customer.id}`}>Adres</Label>
            <Input
              id={`address-${customer.id}`}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`phone-${customer.id}`}>Telefon</Label>
            <Input
              id={`phone-${customer.id}`}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`bh-${customer.id}`}>Bizim Hesap Cari Kodu</Label>
            <Input
              id={`bh-${customer.id}`}
              value={bizimHesapId}
              onChange={(e) => setBizimHesapId(e.target.value)}
              disabled={isPending}
              placeholder="Bizim Hesap müşteri ID"
              className="font-mono"
            />
            <p className="text-xs text-zinc-500">
              Cari ekstre sorgusu için Bizim Hesap’taki müşteri kodu.
            </p>
          </div>

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
            onClick={() => setEditOpen(false)}
            disabled={isPending}
          >
            İptal
          </Button>
          <Button
            type="button"
            onClick={handleUpdate}
            disabled={
              isPending ||
              (isPublicEntity && spendingUnitVkn.replace(/\D/g, "").length !== 10)
            }
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Kaydet
          </Button>
        </DialogFooter>
      </Dialog>

      {canDelete ? (
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogHeader>
            <DialogTitle>Müşteriyi Sil</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-zinc-200">{customer.name}</span>{" "}
              kaydı ve bağlı konsinye deposu silinecek. Bu işlem geri alınamaz.
            </DialogDescription>
          </DialogHeader>

          <DialogContent>
            {error ? (
              <p
                className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
                role="alert"
              >
                {error}
              </p>
            ) : (
              <p className="text-sm text-zinc-400">
                Depoda stok veya transfer geçmişi varsa silme engellenir.
              </p>
            )}
          </DialogContent>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={isPending}
            >
              Vazgeç
            </Button>
            <Button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Sil
            </Button>
          </DialogFooter>
        </Dialog>
      ) : null}
    </>
  );
}
