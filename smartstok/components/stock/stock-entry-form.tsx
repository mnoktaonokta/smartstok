"use client";

import { useState, useTransition } from "react";
import { Loader2, PackagePlus } from "lucide-react";
import type { ProductSearchHit } from "@/lib/actions/products";
import { createStockEntryAction } from "@/lib/actions/stock";
import { ProductTypeahead } from "@/components/products/product-typeahead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function StockEntryForm({ mainDepotName }: { mainDepotName: string }) {
  const [product, setProduct] = useState<ProductSearchHit | null>(null);
  const [lotNumber, setLotNumber] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!product) {
      setError("Önce ürün seçin.");
      return;
    }

    startTransition(async () => {
      const result = await createStockEntryAction({
        productId: product.productId,
        lotNumber,
        quantity: Number(quantity),
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setSuccess(
        `${result.data?.createdCount ?? 0} adet StockItem ${mainDepotName} deposuna eklendi (Lot: ${lotNumber.trim().toUpperCase()}).`,
      );
      setLotNumber("");
      setQuantity("1");
      setProduct(null);
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-6"
    >
      <div>
        <h2 className="flex items-center gap-2 text-lg font-medium text-white">
          <PackagePlus className="size-5 text-blue-400" />
          Mal Kabul
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Girilen adet kadar tekil kutu (StockItem) oluşturulur ve otomatik olarak{" "}
          <span className="text-blue-300">{mainDepotName}</span> konumuna
          atanır.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Ürün Ara</Label>
        <ProductTypeahead
          mode="catalog"
          onSelect={setProduct}
          selectedLabel={
            product ? `${product.referenceCode} · ${product.name}` : null
          }
          placeholder="Referans, ad veya barkod ile ürün bul…"
        />
        {product ? (
          <p className="text-xs text-blue-300">
            Seçili: {product.referenceCode} · {product.brand} · {product.name}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="lot">Lot Numarası</Label>
          <Input
            id="lot"
            value={lotNumber}
            onChange={(e) => setLotNumber(e.target.value)}
            placeholder="LOT-2026-001"
            required
            disabled={isPending}
            className="font-mono uppercase"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="qty">Adet</Label>
          <Input
            id="qty"
            type="number"
            min={1}
            max={5000}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
            disabled={isPending}
          />
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

      {success ? (
        <p className="rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-300">
          {success}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={isPending || !product}>
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Kaydediliyor…
          </>
        ) : (
          "Stok Girişini Onayla"
        )}
      </Button>
    </form>
  );
}
