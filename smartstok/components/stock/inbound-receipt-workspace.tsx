"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  FileUp,
  Loader2,
  PackagePlus,
  Scale,
  Trash2,
} from "lucide-react";
import { parseInvoiceWithAiAction, type ParsedInvoiceLine } from "@/lib/actions/invoice-parser";
import {
  confirmInboundReceiptAction,
  type ScannedInboundLine,
} from "@/lib/actions/inbound";
import type { ProductSearchHit } from "@/lib/actions/products";
import { ProductTypeahead } from "@/components/products/product-typeahead";
import { Tabs } from "@/components/ui/tabs";
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
import { cn } from "@/lib/utils";

type BasketRow = ScannedInboundLine & { key: string };

type CompareRow = {
  kind: "missing" | "extra" | "match";
  referenceCode: string;
  name: string;
  invoiceQty: number;
  scannedQty: number;
};

function compareLines(
  invoice: ParsedInvoiceLine[],
  scanned: BasketRow[],
): { matches: number; mismatches: number; rows: CompareRow[] } {
  const inv = new Map<string, { qty: number; name: string }>();
  for (const l of invoice) {
    const k = l.referenceCode.trim().toUpperCase();
    const p = inv.get(k);
    inv.set(k, {
      qty: (p?.qty ?? 0) + l.quantity,
      name: l.productName,
    });
  }
  const scan = new Map<string, { qty: number; name: string }>();
  for (const l of scanned) {
    const k = l.referenceCode.trim().toUpperCase();
    const p = scan.get(k);
    scan.set(k, {
      qty: (p?.qty ?? 0) + l.quantity,
      name: l.productName,
    });
  }

  const rows: CompareRow[] = [];
  let matches = 0;
  let mismatches = 0;

  for (const [ref, i] of inv) {
    const s = scan.get(ref);
    if (!s) {
      mismatches += 1;
      rows.push({
        kind: "missing",
        referenceCode: ref,
        name: i.name,
        invoiceQty: i.qty,
        scannedQty: 0,
      });
    } else if (s.qty === i.qty) {
      matches += 1;
      rows.push({
        kind: "match",
        referenceCode: ref,
        name: i.name,
        invoiceQty: i.qty,
        scannedQty: s.qty,
      });
    } else if (s.qty < i.qty) {
      mismatches += 1;
      rows.push({
        kind: "missing",
        referenceCode: ref,
        name: i.name,
        invoiceQty: i.qty,
        scannedQty: s.qty,
      });
    } else {
      mismatches += 1;
      rows.push({
        kind: "extra",
        referenceCode: ref,
        name: s.name,
        invoiceQty: i.qty,
        scannedQty: s.qty,
      });
    }
  }

  for (const [ref, s] of scan) {
    if (!inv.has(ref)) {
      mismatches += 1;
      rows.push({
        kind: "extra",
        referenceCode: ref,
        name: s.name,
        invoiceQty: 0,
        scannedQty: s.qty,
      });
    }
  }

  return { matches, mismatches, rows };
}

export function InboundReceiptWorkspace({
  mainDepotName,
}: {
  mainDepotName: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"invoice" | "manual">("invoice");
  const [analyzing, setAnalyzing] = useState(false);
  const [invoiceLines, setInvoiceLines] = useState<ParsedInvoiceLine[] | null>(
    null,
  );
  const [basket, setBasket] = useState<BasketRow[]>([]);
  const [pendingProduct, setPendingProduct] = useState<ProductSearchHit | null>(
    null,
  );
  const [qty, setQty] = useState("1");
  const [lot, setLot] = useState("");
  const [expiry, setExpiry] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ackError, setAckError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [ackOpen, setAckOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const compare = useMemo(
    () => compareLines(invoiceLines ?? [], basket),
    [invoiceLines, basket],
  );

  const hasExtra =
    mode === "invoice" &&
    compare.rows.some((r) => r.kind === "extra");

  const busy = confirming;

  async function handleFile(file: File | null) {
    if (!file) return;
    setError(null);
    setSuccess(null);
    setAnalyzing(true);
    setInvoiceLines(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const result = await parseInvoiceWithAiAction(fd);
      if (result.error) {
        setError(result.error);
        return;
      }
      setInvoiceLines(result.lines ?? []);
      if (result.supplierName?.trim()) {
        setSupplierName(result.supplierName.trim());
      }
      if (result.invoiceNumber?.trim()) {
        setDocumentNumber(result.invoiceNumber.trim());
      }
    } finally {
      setAnalyzing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function addToBasket() {
    if (!pendingProduct) {
      setError("Önce ürün seçin veya barkod okutun.");
      return;
    }
    if (!lot.trim()) {
      setError("Lot / parti no gerekli.");
      return;
    }
    const quantity = Number(qty);
    if (!Number.isFinite(quantity) || quantity < 1) {
      setError("Geçerli miktar girin.");
      return;
    }

    const invPrice = invoiceLines?.find(
      (l) =>
        l.referenceCode.trim().toUpperCase() ===
        pendingProduct.referenceCode.trim().toUpperCase(),
    )?.unitPrice;

    setBasket((prev) => [
      ...prev,
      {
        key: `${pendingProduct.productId}-${lot}-${Date.now()}`,
        productId: pendingProduct.productId,
        referenceCode: pendingProduct.referenceCode,
        productName: pendingProduct.name,
        quantity,
        lotNumber: lot.trim().toUpperCase(),
        expiryDate: expiry || null,
        unitPrice: invPrice ?? null,
      },
    ]);
    setPendingProduct(null);
    setQty("1");
    setLot("");
    setExpiry("");
    setError(null);
  }

  async function tryConfirm(acknowledgeDiscrepancy: boolean) {
    setError(null);
    setAckError(null);
    setSuccess(null);
    setConfirming(true);
    try {
      const result = await confirmInboundReceiptAction({
        mode,
        supplierName: supplierName || null,
        documentNumber: documentNumber || null,
        invoiceLines: mode === "invoice" ? (invoiceLines ?? []) : [],
        scannedLines: basket.map(({ key: _k, ...rest }) => rest),
        acknowledgeDiscrepancy: Boolean(acknowledgeDiscrepancy),
      });

      if (result.data?.needsAck) {
        setAckOpen(true);
        setAckError(
          result.error ??
            "Faturada görünmeyen veya fazla ürün var. Onaylarsanız yine de eklenecek.",
        );
        return;
      }

      if (result.error) {
        setAckError(result.error);
        setError(result.error);
        return;
      }

      setAckOpen(false);
      setAckError(null);
      setSuccess(
        `${result.data?.createdCount ?? 0} adet stok ${mainDepotName} deposuna eklendi` +
          (result.data?.status === "DISCREPANCY"
            ? " (uyumsuzluk kaydı oluşturuldu)."
            : "."),
      );
      setBasket([]);
      if (mode === "invoice") {
        setInvoiceLines(null);
      }
      router.refresh();
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Beklenmeyen bir hata oluştu.";
      setAckError(msg);
      setError(msg);
    } finally {
      setConfirming(false);
    }
  }

  function handleConfirmClick() {
    if (basket.length === 0) {
      setError("Sepete en az bir ürün ekleyin.");
      return;
    }
    if (hasExtra) {
      setAckError(null);
      setAckOpen(true);
      return;
    }
    void tryConfirm(false);
  }

  return (
    <div className="space-y-6">
      <Tabs
        tabs={[
          { id: "invoice", label: "Fatura İle (Yapay Zeka)" },
          { id: "manual", label: "Manuel Giriş" },
        ]}
        active={mode}
        onChange={(id) => {
          setMode(id as "invoice" | "manual");
          setError(null);
          setSuccess(null);
        }}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="supplier">Tedarikçi (isteğe bağlı)</Label>
          <Input
            id="supplier"
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            placeholder="Firma adı"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="docno">Fatura / İrsaliye No</Label>
          <Input
            id="docno"
            value={documentNumber}
            onChange={(e) => setDocumentNumber(e.target.value)}
            placeholder="Belge numarası"
          />
        </div>
      </div>

      {mode === "invoice" ? (
        <div
          className={cn(
            "relative rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/50 p-8 text-center transition-colors",
            analyzing && "pointer-events-none opacity-70",
          )}
          onDragOver={(e) => {
            e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) void handleFile(f);
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,image/jpeg,image/png,image/jpg"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
          />
          {analyzing ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="size-10 animate-spin text-blue-400" />
              <p className="text-sm font-medium text-blue-200">
                Yapay Zeka Faturayı Analiz Ediyor…
              </p>
              <p className="text-xs text-zinc-500">
                Fatura dosyasını yükleyin; AI satırları çıkarır. Çalışması için
                .env içinde AI_API_KEY tanımlı olmalıdır.
              </p>
            </div>
          ) : (
            <button
              type="button"
              className="mx-auto flex flex-col items-center gap-3"
              onClick={() => fileRef.current?.click()}
            >
              <FileUp className="size-10 text-blue-400" />
              <p className="text-sm font-medium text-zinc-100">
                Fatura Yükle (PDF veya Görsel JPG/PNG)
              </p>
              <p className="text-xs text-zinc-500">
                Sürükleyip bırakın veya tıklayarak seçin
              </p>
            </button>
          )}
        </div>
      ) : null}

      <div
        className={cn(
          "grid gap-6",
          mode === "invoice" && invoiceLines ? "lg:grid-cols-2" : "grid-cols-1",
        )}
      >
        {mode === "invoice" && invoiceLines ? (
          <section className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
            <h2 className="text-sm font-medium text-zinc-300">
              Faturadan Okunanlar
            </h2>
            <ul className="space-y-2">
              {invoiceLines.map((line, idx) => (
                <li
                  key={`${line.referenceCode}-${idx}`}
                  className="rounded-xl border border-zinc-800 px-3 py-2.5 text-sm"
                >
                  <p className="font-medium text-white">{line.productName}</p>
                  <p className="font-mono text-xs text-blue-300">
                    {line.referenceCode}
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">
                    Beklenen: {line.quantity} adet ·{" "}
                    {line.unitPrice.toLocaleString("tr-TR")} ₺
                    {line.lot ? ` · Lot ${line.lot}` : ""}
                    {line.skt ? ` · SKT ${line.skt}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
          <h2 className="text-sm font-medium text-zinc-300">
            Fiziki Sayım / Barkod Sepeti
          </h2>
          <p className="text-xs text-zinc-500">
            Hedef depo: {mainDepotName}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Ürün / Barkod</Label>
              <ProductTypeahead
                mode="catalog"
                onSelect={(p) => setPendingProduct(p)}
                selectedLabel={
                  pendingProduct
                    ? `${pendingProduct.referenceCode} · ${pendingProduct.name}`
                    : null
                }
                placeholder="Barkod okutun veya referans yazın…"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qty">Miktar</Label>
              <Input
                id="qty"
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lot">Lot / Parti No</Label>
              <Input
                id="lot"
                value={lot}
                onChange={(e) => setLot(e.target.value)}
                placeholder="LOT-…"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="skt">SKT</Label>
              <Input
                id="skt"
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
              />
            </div>
          </div>
          <Button type="button" variant="outline" onClick={addToBasket}>
            <PackagePlus className="size-4" />
            Sepete Ekle
          </Button>

          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="px-3 py-2">Ürün</th>
                  <th className="px-3 py-2">Miktar</th>
                  <th className="px-3 py-2">Lot</th>
                  <th className="px-3 py-2">SKT</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {basket.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-8 text-center text-zinc-500"
                    >
                      Sepet boş.
                    </td>
                  </tr>
                ) : (
                  basket.map((row) => (
                    <tr key={row.key} className="border-b border-zinc-900">
                      <td className="px-3 py-2">
                        <p className="text-white">{row.productName}</p>
                        <p className="font-mono text-xs text-blue-300">
                          {row.referenceCode}
                        </p>
                      </td>
                      <td className="px-3 py-2 font-mono">{row.quantity}</td>
                      <td className="px-3 py-2 font-mono text-zinc-300">
                        {row.lotNumber}
                      </td>
                      <td className="px-3 py-2 text-zinc-400">
                        {row.expiryDate ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setBasket((prev) =>
                              prev.filter((b) => b.key !== row.key),
                            )
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {error ? (
        <p
          className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {success}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {mode === "invoice" && invoiceLines ? (
          <Button
            type="button"
            variant="outline"
            disabled={basket.length === 0}
            onClick={() => setCompareOpen(true)}
          >
            <Scale className="size-4" />
            Karşılaştır
          </Button>
        ) : null}
        <Button
          type="button"
          disabled={busy || basket.length === 0}
          onClick={handleConfirmClick}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CheckCircle2 className="size-4" />
          )}
          Stoklara Al ve Onayla
        </Button>
      </div>

      <Dialog
        open={compareOpen}
        onOpenChange={setCompareOpen}
        className="max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>Karşılaştırma Raporu</DialogTitle>
          <DialogDescription>
            {compare.matches} adet eşleşen ürün, {compare.mismatches} eşleşmeyen
            ürün tespit edildi.
          </DialogDescription>
        </DialogHeader>
        <DialogContent className="max-h-[60vh] space-y-2 overflow-y-auto">
          {compare.rows.filter((r) => r.kind !== "match").length === 0 ? (
            <p className="py-6 text-center text-sm text-emerald-300">
              Tüm satırlar eşleşiyor.
            </p>
          ) : (
            compare.rows
              .filter((r) => r.kind !== "match")
              .map((r) => (
                <div
                  key={`${r.kind}-${r.referenceCode}`}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm",
                    r.kind === "missing"
                      ? "border-red-500/40 bg-red-500/10 text-red-100"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-100",
                  )}
                >
                  <p className="font-medium">
                    {r.kind === "missing"
                      ? "Eksik / Eşleşmeyen"
                      : "Fazla / Faturada yok"}
                  </p>
                  <p>
                    {r.name}{" "}
                    <span className="font-mono text-xs">({r.referenceCode})</span>
                  </p>
                  <p className="text-xs opacity-80">
                    Fatura: {r.invoiceQty} · Okutulan: {r.scannedQty}
                  </p>
                </div>
              ))
          )}
        </DialogContent>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setCompareOpen(false)}>
            Kapat
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        open={ackOpen}
        onOpenChange={(open) => {
          if (busy) return;
          setAckOpen(open);
          if (!open) setAckError(null);
        }}
      >
        <DialogHeader>
          <DialogTitle>Uyumsuzluk onayı</DialogTitle>
          <DialogDescription>
            Faturada görünmeyen veya fazla miktarda ürün okuttunuz. Stoklara bu
            şekilde eklemek istediğinize emin misiniz?
          </DialogDescription>
        </DialogHeader>
        {ackError ? (
          <DialogContent>
            <p className="text-sm text-red-300" role="alert">
              {ackError}
            </p>
          </DialogContent>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setAckOpen(false);
              setAckError(null);
            }}
            disabled={busy}
          >
            Vazgeç
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() => void tryConfirm(true)}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Evet, yine de ekle
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
