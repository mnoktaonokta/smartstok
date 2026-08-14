"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, MoreHorizontal, Pencil, Power, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  deleteProductAction,
  toggleProductStatusAction,
  updateProductAction,
  type ProductListItem,
} from "@/lib/actions/catalog";
import { CATEGORY_OPTIONS } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BarcodeInput } from "@/components/ui/barcode-input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { datesFromBarcodeParse } from "@/lib/utils/barcode-parser";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ProductRowActions({
  product,
  showPurchasePrice,
  showSalePrice,
}: {
  product: ProductListItem;
  showPurchasePrice: boolean;
  showSalePrice: boolean;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    referenceCode: product.referenceCode,
    brand: product.brand,
    category: product.category,
    name: product.name,
    diameter: product.diameter?.toString() ?? "",
    length: product.length?.toString() ?? "",
    barcode: product.barcode ?? "",
    productionDate: product.productionDate ?? "",
    expiryDate: product.expiryDate ?? "",
    quantity: product.mainDepotStockCount.toString(),
    purchasePrice: product.purchasePrice ?? "",
    salePrice: product.salePrice,
    minStockLevel: product.minStockLevel.toString(),
  });

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  function openEdit() {
    setForm({
      referenceCode: product.referenceCode,
      brand: product.brand,
      category: product.category,
      name: product.name,
      diameter: product.diameter?.toString() ?? "",
      length: product.length?.toString() ?? "",
      barcode: product.barcode ?? "",
      productionDate: product.productionDate ?? "",
      expiryDate: product.expiryDate ?? "",
      quantity: product.mainDepotStockCount.toString(),
      purchasePrice: product.purchasePrice ?? product.salePrice,
      salePrice: product.salePrice,
      minStockLevel: product.minStockLevel.toString(),
    });
    setError(null);
    setMenuOpen(false);
    setEditOpen(true);
  }

  function setField(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateProductAction({
        id: product.id,
        referenceCode: form.referenceCode,
        brand: form.brand,
        category: form.category,
        name: form.name,
        diameter: form.diameter ? Number(form.diameter) : null,
        length: form.length ? Number(form.length) : null,
        barcode: form.barcode || null,
        productionDate: form.productionDate || null,
        expiryDate: form.expiryDate || null,
        ...(showSalePrice ? { salePrice: Number(form.salePrice || 0) } : {}),
        ...(showPurchasePrice
          ? { purchasePrice: Number(form.purchasePrice || 0) }
          : {}),
        quantity: form.quantity === "" ? null : Number(form.quantity),
        minStockLevel: Number(form.minStockLevel || 0),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditOpen(false);
      router.refresh();
    });
  }

  function handleToggle() {
    setMenuOpen(false);
    setToast(null);
    startTransition(async () => {
      const result = await toggleProductStatusAction(product.id);
      if (result.error) {
        setToast(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteProductAction(product.id);
      if (result.error) {
        setError(result.error);
        setToast(result.error);
        return;
      }
      setDeleteOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <div className="relative flex justify-end" ref={menuRef}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="İşlemler"
          onClick={() => setMenuOpen((o) => !o)}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <MoreHorizontal className="size-4 text-zinc-400" />
          )}
        </Button>

        {menuOpen ? (
          <div className="absolute top-full right-0 z-30 mt-1 min-w-[11rem] overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 py-1 shadow-xl">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-900"
              onClick={openEdit}
            >
              <Pencil className="size-3.5 text-blue-400" />
              Düzenle
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-900"
              onClick={handleToggle}
            >
              <Power className="size-3.5 text-amber-400" />
              {product.isActive ? "Pasife Al" : "Aktif Et"}
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-300 hover:bg-zinc-900"
              onClick={() => {
                setMenuOpen(false);
                setError(null);
                setDeleteOpen(true);
              }}
            >
              <Trash2 className="size-3.5" />
              Sil
            </button>
          </div>
        ) : null}
      </div>

      {toast ? (
        <div className="fixed right-4 bottom-4 z-50 max-w-sm rounded-lg border border-amber-500/40 bg-zinc-950 px-4 py-3 text-sm text-amber-100 shadow-lg">
          <p>{toast}</p>
          <button
            type="button"
            className="mt-2 text-xs text-zinc-400 underline"
            onClick={() => setToast(null)}
          >
            Kapat
          </button>
        </div>
      ) : null}

      <Dialog open={editOpen} onOpenChange={setEditOpen} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Ürünü Düzenle</DialogTitle>
          <DialogDescription>
            Katalog bilgilerini ve merkez depo miktarını güncelleyin.
          </DialogDescription>
        </DialogHeader>
        <DialogContent className="max-h-[70vh] space-y-4 overflow-y-auto">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`edit-ref-${product.id}`}>Referans</Label>
              <Input
                id={`edit-ref-${product.id}`}
                value={form.referenceCode}
                onChange={(e) => setField("referenceCode", e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-barcode-${product.id}`}>Barkod</Label>
              <BarcodeInput
                id={`edit-barcode-${product.id}`}
                value={form.barcode}
                onValueChange={(v) => setField("barcode", v)}
                onParsed={(parsed) => {
                  const dates = datesFromBarcodeParse(parsed);
                  setForm((prev) => ({
                    ...prev,
                    barcode: parsed.barkod || prev.barcode,
                    ...(dates.productionDate
                      ? { productionDate: dates.productionDate }
                      : {}),
                    ...(dates.expiryDate
                      ? { expiryDate: dates.expiryDate }
                      : {}),
                  }));
                }}
                placeholder="Barkod veya karekod okutun…"
                disabled={isPending}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor={`edit-name-${product.id}`}>Ad</Label>
              <Input
                id={`edit-name-${product.id}`}
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-brand-${product.id}`}>Marka</Label>
              <Input
                id={`edit-brand-${product.id}`}
                value={form.brand}
                onChange={(e) => setField("brand", e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-cat-${product.id}`}>Kategori</Label>
              <Select
                id={`edit-cat-${product.id}`}
                value={
                  CATEGORY_OPTIONS.some((o) => o.value === form.category)
                    ? form.category
                    : form.category
                }
                onChange={(e) => setField("category", e.target.value)}
                disabled={isPending}
              >
                {!CATEGORY_OPTIONS.some((o) => o.value === form.category) &&
                form.category ? (
                  <option value={form.category}>{form.category}</option>
                ) : null}
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-dia-${product.id}`}>Çap</Label>
              <Input
                id={`edit-dia-${product.id}`}
                type="number"
                step="0.1"
                value={form.diameter}
                onChange={(e) => setField("diameter", e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-len-${product.id}`}>Boy</Label>
              <Input
                id={`edit-len-${product.id}`}
                type="number"
                step="0.1"
                value={form.length}
                onChange={(e) => setField("length", e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-urt-${product.id}`}>
                Üretim Tarihi (URT)
              </Label>
              <Input
                id={`edit-urt-${product.id}`}
                type="date"
                value={form.productionDate}
                onChange={(e) => setField("productionDate", e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-skt-${product.id}`}>
                Son Kullanma Tarihi (SKT)
              </Label>
              <Input
                id={`edit-skt-${product.id}`}
                type="date"
                value={form.expiryDate}
                onChange={(e) => setField("expiryDate", e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-qty-${product.id}`}>Miktar (merkez)</Label>
              <Input
                id={`edit-qty-${product.id}`}
                type="number"
                min={0}
                step={1}
                value={form.quantity}
                onChange={(e) => setField("quantity", e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-min-${product.id}`}>
                Kritik Stok Seviyesi (Alarm)
              </Label>
              <Input
                id={`edit-min-${product.id}`}
                type="number"
                min={0}
                step={1}
                value={form.minStockLevel}
                onChange={(e) => setField("minStockLevel", e.target.value)}
                disabled={isPending}
              />
            </div>
            {showSalePrice ? (
              <div className="space-y-2">
                <Label htmlFor={`edit-sale-${product.id}`}>Satış Fiyatı</Label>
                <Input
                  id={`edit-sale-${product.id}`}
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.salePrice}
                  onChange={(e) => setField("salePrice", e.target.value)}
                  disabled={isPending}
                />
              </div>
            ) : null}
            {showPurchasePrice ? (
              <div className="space-y-2">
                <Label htmlFor={`edit-purchase-${product.id}`}>Alış Fiyatı</Label>
                <Input
                  id={`edit-purchase-${product.id}`}
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.purchasePrice}
                  onChange={(e) => setField("purchasePrice", e.target.value)}
                  disabled={isPending}
                />
              </div>
            ) : null}
          </div>
          {error ? (
            <p className="text-sm text-red-300" role="alert">
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
          <Button type="button" onClick={handleSave} disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Kaydet
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogHeader>
          <DialogTitle>Ürünü sil</DialogTitle>
          <DialogDescription>
            {product.name} ({product.referenceCode}) kalıcı olarak silinecek.
            İşlem görmüş ürünler silinemez.
          </DialogDescription>
        </DialogHeader>
        <DialogContent>
          {error ? (
            <p className="text-sm text-red-300" role="alert">
              {error}
            </p>
          ) : null}
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
            variant="outline"
            onClick={handleDelete}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Sil
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
