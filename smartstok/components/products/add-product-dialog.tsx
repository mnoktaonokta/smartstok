"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { createProductAction } from "@/lib/actions/catalog";
import { CATEGORY_OPTIONS } from "@/lib/categories";
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
import { extractBarcodeOnly } from "@/lib/utils/barcode-parser";

const emptyForm = {
  referenceCode: "",
  brand: "",
  category: "İmplant",
  name: "",
  diameter: "",
  length: "",
  barcode: "",
  purchasePrice: "",
  salePrice: "",
  minStockLevel: "0",
};

export function AddProductDialog({
  showPurchasePrice = true,
  showSalePrice = true,
}: {
  showPurchasePrice?: boolean;
  showSalePrice?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setForm(emptyForm);
      setError(null);
    }
  }

  function setField(key: keyof typeof emptyForm, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await createProductAction({
        referenceCode: form.referenceCode,
        brand: form.brand,
        category: form.category,
        name: form.name,
        diameter: form.diameter ? Number(form.diameter) : null,
        length: form.length ? Number(form.length) : null,
        barcode: form.barcode || null,
        purchasePrice: showPurchasePrice ? Number(form.purchasePrice) : 0,
        salePrice: showSalePrice ? Number(form.salePrice) : 0,
        minStockLevel: Number(form.minStockLevel || 0),
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
        Yeni Ürün
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogHeader>
          <DialogTitle>Ürün Tanımla</DialogTitle>
          <DialogDescription>
            Katalog kaydı oluşturur. Stok girişi ayrı Mal Kabul ekranından
            yapılır.
          </DialogDescription>
        </DialogHeader>

        <DialogContent className="max-h-[70vh] space-y-4 overflow-y-auto">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="referenceCode">Referans Kodu</Label>
              <Input
                id="referenceCode"
                value={form.referenceCode}
                onChange={(e) => setField("referenceCode", e.target.value)}
                placeholder="3510"
                disabled={isPending}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand">Marka</Label>
              <Input
                id="brand"
                value={form.brand}
                onChange={(e) => setField("brand", e.target.value)}
                placeholder="BRN"
                disabled={isPending}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Kategori</Label>
              <Select
                id="category"
                value={form.category}
                onChange={(e) => setField("category", e.target.value)}
                disabled={isPending}
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Ürün Adı</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="İmplant"
                disabled={isPending}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="diameter">Çap (diameter)</Label>
              <Input
                id="diameter"
                type="number"
                step="0.1"
                value={form.diameter}
                onChange={(e) => setField("diameter", e.target.value)}
                placeholder="3.5"
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="length">Boy (length)</Label>
              <Input
                id="length"
                type="number"
                step="0.1"
                value={form.length}
                onChange={(e) => setField("length", e.target.value)}
                placeholder="10"
                disabled={isPending}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="barcode">Barkod</Label>
              <Input
                id="barcode"
                value={form.barcode}
                onChange={(e) =>
                  setField("barcode", extractBarcodeOnly(e.target.value))
                }
                placeholder="Barkod veya karekod okutun…"
                disabled={isPending}
              />
            </div>
            {showPurchasePrice ? (
              <div className="space-y-2">
                <Label htmlFor="purchasePrice">Alış Fiyatı</Label>
                <Input
                  id="purchasePrice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.purchasePrice}
                  onChange={(e) => setField("purchasePrice", e.target.value)}
                  disabled={isPending}
                  required
                />
              </div>
            ) : null}
            {showSalePrice ? (
              <div className="space-y-2">
                <Label htmlFor="salePrice">Satış Fiyatı</Label>
                <Input
                  id="salePrice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.salePrice}
                  onChange={(e) => setField("salePrice", e.target.value)}
                  disabled={isPending}
                  required
                />
              </div>
            ) : null}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="minStockLevel">
                Kritik Stok Seviyesi (Alarm)
              </Label>
              <Input
                id="minStockLevel"
                type="number"
                min={0}
                step={1}
                value={form.minStockLevel}
                onChange={(e) => setField("minStockLevel", e.target.value)}
                disabled={isPending}
              />
              <p className="text-xs text-zinc-500">
                0 = alarm kapalı. Örn. 10 girilirse stok 10 ve altına düşünce
                uyarı verilir.
              </p>
            </div>
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
            onClick={() => handleOpenChange(false)}
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
    </>
  );
}
