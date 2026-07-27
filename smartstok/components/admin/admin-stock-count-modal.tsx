"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, ScanBarcode } from "lucide-react";
import {
  applyStockCountAction,
  lookupProductByBarcodeAction,
  quickAddProductForCountAction,
} from "@/lib/actions/admin";
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

type Phase = "scan" | "count" | "quickAdd";

type FoundProduct = {
  id: string;
  name: string;
  referenceCode: string;
  barcode: string | null;
  currentQty: number;
  salePrice: number;
};

type CountLogItem = {
  barcode: string;
  name: string;
  quantity: number;
  at: string;
};

export function AdminStockCountModal() {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("scan");
  const [barcode, setBarcode] = useState("");
  const [product, setProduct] = useState<FoundProduct | null>(null);
  const [newQty, setNewQty] = useState("");
  const [quickName, setQuickName] = useState("");
  const [quickPrice, setQuickPrice] = useState("");
  const [quickQty, setQuickQty] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [log, setLog] = useState<CountLogItem[]>([]);
  const [isPending, startTransition] = useTransition();

  const barcodeRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const quickNameRef = useRef<HTMLInputElement>(null);

  function resetToScan(message?: string) {
    setPhase("scan");
    setBarcode("");
    setProduct(null);
    setNewQty("");
    setQuickName("");
    setQuickPrice("");
    setQuickQty("1");
    setError(null);
    setStatus(message ?? "Sıradaki barkodu okutun");
    requestAnimationFrame(() => barcodeRef.current?.focus());
  }

  useEffect(() => {
    if (!open) return;
    resetToScan("Barkod okutun");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (phase === "scan") {
      barcodeRef.current?.focus();
    } else if (phase === "count") {
      qtyRef.current?.focus();
      qtyRef.current?.select();
    } else if (phase === "quickAdd") {
      quickNameRef.current?.focus();
    }
  }, [phase, open, product]);

  function pushLog(item: CountLogItem) {
    setLog((prev) => [item, ...prev].slice(0, 5));
  }

  function handleBarcodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = barcode.trim();
    if (!code || isPending) return;

    setError(null);
    setStatus(null);
    startTransition(async () => {
      const result = await lookupProductByBarcodeAction(code);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.notFound || !result.product) {
        setPhase("quickAdd");
        setQuickName("");
        setQuickPrice("");
        setQuickQty("1");
        setStatus(null);
        return;
      }
      setProduct(result.product);
      setNewQty(String(result.product.currentQty));
      setPhase("count");
    });
  }

  function handleCountSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!product || isPending) return;
    const qty = Number(newQty);
    if (!Number.isFinite(qty) || qty < 0) {
      setError("Geçerli bir miktar girin.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await applyStockCountAction({
        productId: product.id,
        newQuantity: qty,
      });
      if (result.error) {
        setError(result.error);
        return;
      }

      pushLog({
        barcode: product.barcode ?? product.referenceCode,
        name: product.name,
        quantity: qty,
        at: new Date().toLocaleTimeString("tr-TR"),
      });

      resetToScan(`Kaydedildi: ${product.name} → ${qty} adet`);
    });
  }

  function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    if (isPending) return;
    const qty = Number(quickQty);
    const price = Number(quickPrice) || 0;

    setError(null);
    startTransition(async () => {
      const result = await quickAddProductForCountAction({
        barcode: barcode.trim(),
        name: quickName,
        price,
        quantity: qty,
      });
      if (result.error) {
        setError(result.error);
        return;
      }

      pushLog({
        barcode: barcode.trim(),
        name: quickName.trim(),
        quantity: qty,
        at: new Date().toLocaleTimeString("tr-TR"),
      });

      resetToScan(`Hızlı eklendi: ${quickName.trim()} → ${qty} adet`);
    });
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <ScanBarcode className="size-4" />
        Sayımı Başlat
      </Button>

      <Dialog open={open} onOpenChange={setOpen} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Akıllı Sayım Asistanı</DialogTitle>
          <DialogDescription>
            Barkodu okutun, miktarı girin, Enter ile kaydedin. Merkez depo stoku
            güncellenir.
          </DialogDescription>
        </DialogHeader>

        <DialogContent className="space-y-4">
          {status ? (
            <p className="rounded-md border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-sm text-blue-200">
              {status}
            </p>
          ) : null}

          {phase === "scan" ? (
            <form onSubmit={handleBarcodeSubmit} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="count-barcode">Barkod Okutun</Label>
                <Input
                  id="count-barcode"
                  ref={barcodeRef}
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="Barkod…"
                  autoFocus
                  disabled={isPending}
                  autoComplete="off"
                />
              </div>
              <Button type="submit" disabled={isPending || !barcode.trim()}>
                {isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                Sorgula
              </Button>
            </form>
          ) : null}

          {phase === "count" && product ? (
            <form onSubmit={handleCountSubmit} className="space-y-3">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                <p className="font-medium text-white">{product.name}</p>
                <p className="mt-1 font-mono text-xs text-blue-300">
                  {product.barcode ?? product.referenceCode}
                </p>
                <p className="mt-2 text-sm text-zinc-400">
                  Mevcut stok (merkez):{" "}
                  <span className="font-mono text-zinc-100">
                    {product.currentQty}
                  </span>
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="count-qty">Yeni Miktar</Label>
                <Input
                  id="count-qty"
                  ref={qtyRef}
                  type="number"
                  min={0}
                  step={1}
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value)}
                  disabled={isPending}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={isPending}>
                  {isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  Kaydet (Enter)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => resetToScan()}
                >
                  İptal
                </Button>
              </div>
            </form>
          ) : null}

          {phase === "quickAdd" ? (
            <form onSubmit={handleQuickAdd} className="space-y-3">
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                Ürün Bulunamadı! Hızlı Ekleme — barkod:{" "}
                <span className="font-mono">{barcode}</span>
              </p>
              <div className="space-y-2">
                <Label htmlFor="qa-name">Ürün Adı</Label>
                <Input
                  id="qa-name"
                  ref={quickNameRef}
                  value={quickName}
                  onChange={(e) => setQuickName(e.target.value)}
                  required
                  disabled={isPending}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="qa-price">Fiyat</Label>
                  <Input
                    id="qa-price"
                    type="number"
                    min={0}
                    step="0.01"
                    value={quickPrice}
                    onChange={(e) => setQuickPrice(e.target.value)}
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="qa-qty">Miktar</Label>
                  <Input
                    id="qa-qty"
                    type="number"
                    min={0}
                    step={1}
                    value={quickQty}
                    onChange={(e) => setQuickQty(e.target.value)}
                    disabled={isPending}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={isPending || quickName.trim().length < 2}>
                  {isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  Ekle ve Devam
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => resetToScan()}
                >
                  Vazgeç
                </Button>
              </div>
            </form>
          ) : null}

          {error ? (
            <p className="text-sm text-red-300" role="alert">
              {error}
            </p>
          ) : null}

          <div className="border-t border-zinc-800 pt-3">
            <p className="mb-2 text-xs font-medium tracking-wide text-zinc-500 uppercase">
              Bu oturumda sayılanlar (son 5)
            </p>
            {log.length === 0 ? (
              <p className="text-xs text-zinc-600">Henüz kayıt yok.</p>
            ) : (
              <ul className="space-y-1.5">
                {log.map((item, i) => (
                  <li
                    key={`${item.barcode}-${item.at}-${i}`}
                    className="flex items-center justify-between gap-2 text-xs text-zinc-400"
                  >
                    <span className="truncate text-zinc-200">
                      {item.name}{" "}
                      <span className="font-mono text-blue-300/80">
                        ({item.barcode})
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-zinc-300">
                      {item.quantity} · {item.at}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Kapat
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
