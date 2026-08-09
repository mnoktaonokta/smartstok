"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createFailIntakeAction,
  scanBarcodeForFailGiveAction,
  searchFailGiveCatalogAction,
} from "@/lib/actions/fail";
import { Button } from "@/components/ui/button";
import { BarcodeInput } from "@/components/ui/barcode-input";
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
import type { FailPageData } from "@/lib/fail/types";

type BasketLine = {
  key: string;
  productId: string;
  referenceCode: string;
  productName: string;
  brand: string;
  lotNumber: string;
  quantity: number;
  maxAvailable: number;
  source: "CLINIC" | "MAIN";
};

type SpecRow = {
  diameter: string;
  length: string;
  lotNumber: string;
};

export function FailIntakeForm({
  customers,
  canMutate,
}: {
  customers: FailPageData["customers"];
  canMutate: boolean;
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [failCount, setFailCount] = useState("1");
  const [wantSpecs, setWantSpecs] = useState<"no" | "yes">("no");
  const [specs, setSpecs] = useState<SpecRow[]>([
    { diameter: "", length: "", lotNumber: "" },
  ]);
  const [barcode, setBarcode] = useState("");
  const [basket, setBasket] = useState<BasketLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [scanning, setScanning] = useState(false);
  const [pendingLots, setPendingLots] = useState<{
    productId: string;
    referenceCode: string;
    productName: string;
    brand: string;
    lots: Array<{ lotNumber: string; available: number; source: "CLINIC" | "MAIN" }>;
  } | null>(null);
  const [selectedLotKey, setSelectedLotKey] = useState("");
  const [excessOpen, setExcessOpen] = useState(false);
  const [excessPick, setExcessPick] = useState<Record<string, number>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const focusScanner = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    focusScanner();
  }, [focusScanner, customerId, pendingLots]);

  useEffect(() => {
    const n = Math.max(1, Math.floor(Number(failCount)) || 1);
    setSpecs((prev) => {
      if (prev.length === n) return prev;
      if (prev.length < n) {
        return [
          ...prev,
          ...Array.from({ length: n - prev.length }, () => ({
            diameter: "",
            length: "",
            lotNumber: "",
          })),
        ];
      }
      return prev.slice(0, n);
    });
  }, [failCount]);

  function addBasket(line: Omit<BasketLine, "key" | "quantity">) {
    setBasket((prev) => {
      const existing = prev.find(
        (p) =>
          p.productId === line.productId &&
          p.lotNumber === line.lotNumber &&
          p.source === line.source,
      );
      if (existing) {
        if (existing.quantity >= existing.maxAvailable) {
          setError(`Lot ${line.lotNumber}: maksimum ${existing.maxAvailable} adet.`);
          return prev;
        }
        return prev.map((p) =>
          p.key === existing.key ? { ...p, quantity: p.quantity + 1 } : p,
        );
      }
      return [
        ...prev,
        {
          ...line,
          key: `${line.productId}-${line.lotNumber}-${line.source}`,
          quantity: 1,
        },
      ];
    });
  }

  async function handleScan(parsed: { barkod: string }) {
    if (!canMutate) return;
    setError(null);
    setSuccess(null);
    if (!customerId) {
      setError("Önce müşteri seçin.");
      return;
    }
    const raw = parsed.barkod;
    setScanning(true);
    const result = await scanBarcodeForFailGiveAction(raw, customerId);
    setScanning(false);
    setBarcode("");
    if (!result.ok) {
      setError(result.error);
      focusScanner();
      return;
    }
    if (result.lots.length === 1) {
      const lot = result.lots[0];
      addBasket({
        productId: result.productId,
        referenceCode: result.referenceCode,
        productName: result.productName,
        brand: result.brand,
        lotNumber: lot.lotNumber,
        maxAvailable: lot.available,
        source: lot.source,
      });
      focusScanner();
      return;
    }
    setPendingLots({
      productId: result.productId,
      referenceCode: result.referenceCode,
      productName: result.productName,
      brand: result.brand,
      lots: result.lots,
    });
    setSelectedLotKey(
      `${result.lots[0].lotNumber}::${result.lots[0].source}`,
    );
  }

  function confirmLot() {
    if (!pendingLots || !selectedLotKey) return;
    const [lotNumber, source] = selectedLotKey.split("::") as [
      string,
      "CLINIC" | "MAIN",
    ];
    const lot = pendingLots.lots.find(
      (l) => l.lotNumber === lotNumber && l.source === source,
    );
    if (!lot) return;
    addBasket({
      productId: pendingLots.productId,
      referenceCode: pendingLots.referenceCode,
      productName: pendingLots.productName,
      brand: pendingLots.brand,
      lotNumber: lot.lotNumber,
      maxAvailable: lot.available,
      source: lot.source,
    });
    setPendingLots(null);
    focusScanner();
  }

  const givenTotal = basket.reduce((s, l) => s + l.quantity, 0);
  const failN = Math.floor(Number(failCount)) || 0;
  const excessNeeded = Math.max(0, givenTotal - failN);

  function buildPayload(excessLines?: Array<{ productId: string; lotNumber: string; quantity: number }>) {
    return {
      customerId,
      failCount: failN,
      includeSpecs: wantSpecs === "yes",
      specs:
        wantSpecs === "yes"
          ? specs.map((s) => ({
              diameter: s.diameter ? Number(s.diameter) : null,
              length: s.length ? Number(s.length) : null,
              lotNumber: s.lotNumber || null,
            }))
          : undefined,
      givenLines: basket.map((b) => ({
        productId: b.productId,
        lotNumber: b.lotNumber,
        quantity: b.quantity,
        source: b.source,
      })),
      excessLines,
    };
  }

  function submit(excessLines?: Array<{ productId: string; lotNumber: string; quantity: number }>) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await createFailIntakeAction(buildPayload(excessLines));
      if (result.error) {
        if (
          result.error.includes("Fazla ürün verdiniz") &&
          excessNeeded > 0 &&
          !excessLines
        ) {
          const init: Record<string, number> = {};
          for (const b of basket) init[b.key] = 0;
          setExcessPick(init);
          setExcessOpen(true);
          setError(result.error);
          return;
        }
        setError(result.error);
        return;
      }
      setExcessOpen(false);
      setBasket([]);
      setFailCount("1");
      setWantSpecs("no");
      setSuccess(
        result.warning ??
          "Fail alma kaydı oluşturuldu. Verilen ürünler Fail Listesi’ne alındı.",
      );
      router.refresh();
    });
  }

  function handleSubmit() {
    setError(null);
    if (!customerId || givenTotal < 1) {
      setError("Müşteri seçin ve en az bir ürün ekleyin.");
      return;
    }
    setConfirmOpen(true);
  }

  function handleConfirmYes() {
    setConfirmOpen(false);
    if (excessNeeded > 0) {
      const init: Record<string, number> = {};
      for (const b of basket) init[b.key] = 0;
      setExcessPick(init);
      setExcessOpen(true);
      setError(
        "Fazla ürün verdiniz. Hangi ürünün konsinye/müşteri deposuna ekleneceğini seçiniz.",
      );
      return;
    }
    submit(undefined);
  }

  function confirmExcess() {
    const lines = basket
      .map((b) => ({
        productId: b.productId,
        lotNumber: b.lotNumber,
        quantity: excessPick[b.key] ?? 0,
      }))
      .filter((l) => l.quantity > 0);
    const total = lines.reduce((s, l) => s + l.quantity, 0);
    if (total !== excessNeeded) {
      setError(`Fazla ürün seçimi ${excessNeeded} adet olmalı (seçilen: ${total}).`);
      return;
    }
    submit(lines);
  }

  if (!canMutate) {
    return (
      <p className="text-sm text-muted-foreground">
        Gözlemci yetkisi ile yeni fail alma kaydı oluşturulamaz.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="fail-customer">Müşteri</Label>
          <Select
            id="fail-customer"
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value);
              setBasket([]);
            }}
          >
            <option value="">Müşteri seçin…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="fail-count">Alınan fail adedi</Label>
          <Input
            id="fail-count"
            type="number"
            min={1}
            value={failCount}
            onChange={(e) => setFailCount(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Alınan faillerin cinsini girmek ister misin?</Label>
          <div className="flex gap-4 pt-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="wantSpecs"
                checked={wantSpecs === "no"}
                onChange={() => setWantSpecs("no")}
              />
              Hayır
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="wantSpecs"
                checked={wantSpecs === "yes"}
                onChange={() => setWantSpecs("yes")}
              />
              Evet
            </label>
          </div>
        </div>
      </div>

      {wantSpecs === "yes" ? (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-medium text-foreground">
            Fail cinsleri (Boy / Çap / Lot)
          </p>
          {specs.map((s, idx) => (
            <div
              key={idx}
              className="grid gap-2 sm:grid-cols-3"
            >
              <Input
                placeholder="Çap"
                value={s.diameter}
                onChange={(e) =>
                  setSpecs((prev) =>
                    prev.map((row, i) =>
                      i === idx ? { ...row, diameter: e.target.value } : row,
                    ),
                  )
                }
              />
              <Input
                placeholder="Boy"
                value={s.length}
                onChange={(e) =>
                  setSpecs((prev) =>
                    prev.map((row, i) =>
                      i === idx ? { ...row, length: e.target.value } : row,
                    ),
                  )
                }
              />
              <Input
                placeholder="Lot"
                value={s.lotNumber}
                onChange={(e) =>
                  setSpecs((prev) =>
                    prev.map((row, i) =>
                      i === idx ? { ...row, lotNumber: e.target.value } : row,
                    ),
                  )
                }
              />
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <p className="text-sm font-medium text-foreground">
          Karşılığında ne verdin?
        </p>
        <p className="text-xs text-muted-foreground">
          Önce müşteri konsinyesi, yetmezse merkez depo kullanılır.
        </p>
        <BarcodeInput
          ref={inputRef}
          value={barcode}
          onValueChange={setBarcode}
          onParsed={handleScan}
          placeholder="Barkod okutun veya referans girin…"
          disabled={!customerId || scanning || isPending}
        />
        <ManualProductAdd
          customerId={customerId}
          onAdd={async (productId, referenceCode, name, brand) => {
            const result = await scanBarcodeForFailGiveAction(
              referenceCode,
              customerId,
            );
            if (!result.ok) {
              setError(result.error);
              return;
            }
            if (result.lots.length === 1) {
              addBasket({
                productId,
                referenceCode,
                productName: name,
                brand,
                lotNumber: result.lots[0].lotNumber,
                maxAvailable: result.lots[0].available,
                source: result.lots[0].source,
              });
            } else {
              setPendingLots({
                productId: result.productId,
                referenceCode: result.referenceCode,
                productName: result.productName,
                brand: result.brand,
                lots: result.lots,
              });
            }
          }}
        />

        {basket.length > 0 ? (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {basket.map((b) => (
              <li
                key={b.key}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium text-foreground">
                    {b.referenceCode} — {b.productName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Lot {b.lotNumber} · {b.source === "CLINIC" ? "Konsinye" : "Merkez"} ·{" "}
                    {b.quantity} adet
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-w-11 px-0"
                    onClick={() =>
                      setBasket((prev) =>
                        prev
                          .map((p) =>
                            p.key === b.key
                              ? { ...p, quantity: Math.max(0, p.quantity - 1) }
                              : p,
                          )
                          .filter((p) => p.quantity > 0),
                      )
                    }
                  >
                    −
                  </Button>
                  <span className="w-6 text-center font-mono">{b.quantity}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-w-11 px-0"
                    disabled={b.quantity >= b.maxAvailable}
                    onClick={() =>
                      setBasket((prev) =>
                        prev.map((p) =>
                          p.key === b.key && p.quantity < p.maxAvailable
                            ? { ...p, quantity: p.quantity + 1 }
                            : p,
                        ),
                      )
                    }
                  >
                    <Plus className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-w-11 px-0 text-red-400"
                    onClick={() =>
                      setBasket((prev) => prev.filter((p) => p.key !== b.key))
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Henüz ürün eklenmedi.</p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <p className="text-sm text-muted-foreground">
            Fail: <span className="font-mono text-foreground">{failN}</span>
            {" · "}
            Verilen:{" "}
            <span className="font-mono text-foreground">{givenTotal}</span>
            {excessNeeded > 0 ? (
              <>
                {" · "}
                Fazla:{" "}
                <span className="font-mono text-amber-600">{excessNeeded}</span>
              </>
            ) : null}
            {failN > givenTotal && givenTotal > 0 ? (
              <>
                {" · "}
                Alacak:{" "}
                <span className="font-mono text-blue-600">
                  {failN - givenTotal}
                </span>
              </>
            ) : null}
          </p>
          <Button
            type="button"
            disabled={isPending || !customerId || givenTotal < 1}
            onClick={handleSubmit}
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Fail Alımını Kaydet
          </Button>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-500" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="text-sm text-emerald-600" role="status">
          {success}
        </p>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogHeader>
          <DialogTitle>Emin misiniz?</DialogTitle>
          <DialogDescription>
            Fail alımı kaydedilecek. Fail: {failN} · Verilen: {givenTotal}
            {failN > givenTotal
              ? ` · Müşteri alacağı: ${failN - givenTotal}`
              : ""}
            {excessNeeded > 0 ? ` · Fazla (konsinye): ${excessNeeded}` : ""}.
            Vazgeç derseniz ürün eklemeye devam edebilirsiniz.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmOpen(false)}
          >
            Vazgeç
          </Button>
          <Button type="button" onClick={handleConfirmYes}>
            Evet, kaydet
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={!!pendingLots} onOpenChange={(o) => !o && setPendingLots(null)}>
        <DialogHeader>
          <DialogTitle>Lot seçin</DialogTitle>
          <DialogDescription>
            {pendingLots?.referenceCode} — birden fazla lot / kaynak var.
          </DialogDescription>
        </DialogHeader>
        <DialogContent>
          <Select
            value={selectedLotKey}
            onChange={(e) => setSelectedLotKey(e.target.value)}
          >
            {pendingLots?.lots.map((l) => (
              <option
                key={`${l.lotNumber}::${l.source}`}
                value={`${l.lotNumber}::${l.source}`}
              >
                Lot {l.lotNumber} · {l.source === "CLINIC" ? "Konsinye" : "Merkez"} ·{" "}
                {l.available} adet
              </option>
            ))}
          </Select>
        </DialogContent>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setPendingLots(null)}>
            Vazgeç
          </Button>
          <Button type="button" onClick={confirmLot}>
            Ekle
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={excessOpen} onOpenChange={setExcessOpen}>
        <DialogHeader>
          <DialogTitle>Fazla ürün seçimi</DialogTitle>
          <DialogDescription>
            {excessNeeded} adet ürün konsinye/müşteri deposuna eklenecek. Fail
            listesine girmeyecek.
          </DialogDescription>
        </DialogHeader>
        <DialogContent className="space-y-3">
          {basket.map((b) => (
            <div
              key={b.key}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span>
                {b.referenceCode} · Lot {b.lotNumber} (en fazla {b.quantity})
              </span>
              <Input
                type="number"
                min={0}
                max={b.quantity}
                className="w-20"
                value={excessPick[b.key] ?? 0}
                onChange={(e) =>
                  setExcessPick((prev) => ({
                    ...prev,
                    [b.key]: Math.max(
                      0,
                      Math.min(b.quantity, Number(e.target.value) || 0),
                    ),
                  }))
                }
              />
            </div>
          ))}
        </DialogContent>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setExcessOpen(false)}>
            Vazgeç
          </Button>
          <Button type="button" disabled={isPending} onClick={confirmExcess}>
            Onayla ve Kaydet
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function ManualProductAdd({
  customerId,
  onAdd,
}: {
  customerId: string;
  onAdd: (
    productId: string,
    referenceCode: string,
    name: string,
    brand: string,
  ) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<
    Array<{
      id: string;
      referenceCode: string;
      name: string;
      brand: string;
    }>
  >([]);

  useEffect(() => {
    if (q.trim().length < 2 || !customerId) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      const rows = await searchFailGiveCatalogAction(q);
      setHits(rows);
    }, 250);
    return () => clearTimeout(t);
  }, [q, customerId]);

  return (
    <div className="relative space-y-1">
      <Label className="text-xs text-muted-foreground">Manuel ürün ara</Label>
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Referans / isim…"
        disabled={!customerId}
      />
      {hits.length > 0 ? (
        <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border bg-card py-1 shadow-lg">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={async () => {
                  setQ("");
                  setHits([]);
                  await onAdd(h.id, h.referenceCode, h.name, h.brand);
                }}
              >
                <span className="font-mono text-xs text-blue-600">
                  {h.referenceCode}
                </span>{" "}
                {h.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
