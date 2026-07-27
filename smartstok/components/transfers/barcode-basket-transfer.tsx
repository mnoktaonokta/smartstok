"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import type { TransferLocationOption } from "@/lib/actions/transfers";
import {
  executeBasketTransferAction,
  scanBarcodeAtLocationAction,
  type BarcodeScanLot,
} from "@/lib/actions/barcode-transfer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatRoles } from "@/lib/roles";
import type { UserRole } from "@/types/next-auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type BasketLine = {
  key: string;
  productId: string;
  barcode: string;
  referenceCode: string;
  productName: string;
  brand: string;
  lotNumber: string;
  quantity: number;
  maxAvailable: number;
};

type PendingLotChoice = {
  productId: string;
  barcode: string;
  referenceCode: string;
  productName: string;
  brand: string;
  lots: BarcodeScanLot[];
};

export function BarcodeBasketTransfer({
  locations,
  fieldUsers,
}: {
  locations: TransferLocationOption[];
  fieldUsers: Array<{
    id: string;
    fullName: string;
    roles: string[];
    email: string;
  }>;
}) {
  const mainDepot = locations.find((l) => l.type === "MAIN_DEPOT");

  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [requestedById, setRequestedById] = useState(
    fieldUsers[0]?.id ?? "",
  );
  const [barcode, setBarcode] = useState("");
  const [basket, setBasket] = useState<BasketLine[]>([]);
  const [errorAlert, setErrorAlert] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingLot, setPendingLot] = useState<PendingLotChoice | null>(null);
  const [selectedLot, setSelectedLot] = useState("");
  const [isPending, startTransition] = useTransition();
  const [scanning, setScanning] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  /** Merkez depo listede en üstte */
  const fromOptions = [
    ...(mainDepot ? [mainDepot] : []),
    ...locations.filter((l) => l.type !== "MAIN_DEPOT"),
  ];
  const toOptions = [
    ...(mainDepot && mainDepot.id !== fromLocationId ? [mainDepot] : []),
    ...locations.filter(
      (l) => l.id !== fromLocationId && l.type !== "MAIN_DEPOT",
    ),
  ];

  const focusScanner = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    focusScanner();
  }, [focusScanner, fromLocationId, toLocationId, pendingLot]);

  function addOrIncrementBasket(line: Omit<BasketLine, "key" | "quantity">) {
    setBasket((prev) => {
      const existing = prev.find(
        (p) =>
          p.productId === line.productId && p.lotNumber === line.lotNumber,
      );

      if (existing) {
        if (existing.quantity >= existing.maxAvailable) {
          setErrorAlert(
            `Lot ${line.lotNumber}: depodaki maksimum adede ulaşıldı (${existing.maxAvailable}).`,
          );
          return prev;
        }
        return prev.map((p) =>
          p.key === existing.key
            ? { ...p, quantity: p.quantity + 1 }
            : p,
        );
      }

      return [
        ...prev,
        {
          ...line,
          key: `${line.productId}::${line.lotNumber}`,
          quantity: 1,
        },
      ];
    });
  }

  function handleScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorAlert(null);
    setSuccess(null);

    const code = barcode.trim();
    if (!code) return;

    if (!fromLocationId || !toLocationId) {
      setErrorAlert("Önce kaynak ve hedef depoyu seçin.");
      return;
    }

    // Okutma sonrası alanı hemen boşalt — sonraki barkod beklenir
    setBarcode("");
    setScanning(true);
    startTransition(async () => {
      try {
        const result = await scanBarcodeAtLocationAction(code, fromLocationId);

        if (!result.ok) {
          setErrorAlert(result.error);
          focusScanner();
          return;
        }

        if (result.autoLotNumber) {
          const lot = result.lots[0];
          addOrIncrementBasket({
            productId: result.productId,
            barcode: result.barcode,
            referenceCode: result.referenceCode,
            productName: result.productName,
            brand: result.brand,
            lotNumber: result.autoLotNumber,
            maxAvailable: lot.available,
          });
          focusScanner();
          return;
        }

        setPendingLot({
          productId: result.productId,
          barcode: result.barcode,
          referenceCode: result.referenceCode,
          productName: result.productName,
          brand: result.brand,
          lots: result.lots,
        });
        setSelectedLot(result.lots[0]?.lotNumber ?? "");
      } finally {
        setScanning(false);
      }
    });
  }

  function confirmLotChoice() {
    if (!pendingLot || !selectedLot) return;
    const lot = pendingLot.lots.find((l) => l.lotNumber === selectedLot);
    if (!lot) return;

    addOrIncrementBasket({
      productId: pendingLot.productId,
      barcode: pendingLot.barcode,
      referenceCode: pendingLot.referenceCode,
      productName: pendingLot.productName,
      brand: pendingLot.brand,
      lotNumber: selectedLot,
      maxAvailable: lot.available,
    });

    setPendingLot(null);
    setSelectedLot("");
    focusScanner();
  }

  function removeLine(key: string) {
    setBasket((prev) => prev.filter((p) => p.key !== key));
  }

  const totalQty = basket.reduce((s, l) => s + l.quantity, 0);

  function confirmBasket() {
    setErrorAlert(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await executeBasketTransferAction({
        fromLocationId,
        toLocationId,
        requestedById,
        items: basket.map((l) => ({
          productId: l.productId,
          lotNumber: l.lotNumber,
          quantity: l.quantity,
        })),
      });

      if (result.error) {
        setErrorAlert(result.error);
        focusScanner();
        return;
      }

      setSuccess(
        `${result.transferredCount} adet ürün başarıyla transfer edildi.`,
      );
      setBasket([]);
      focusScanner();
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="bc-from">Kaynak Depo</Label>
          <Select
            id="bc-from"
            value={fromLocationId}
            onChange={(e) => {
              const next = e.target.value;
              setFromLocationId(next);
              setBasket([]);
              setToLocationId((prev) => (prev === next ? "" : prev));
            }}
          >
            <option value="">Bir depo seçiniz</option>
            {fromOptions.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="bc-to">Hedef Depo</Label>
          <Select
            id="bc-to"
            value={toLocationId}
            onChange={(e) => setToLocationId(e.target.value)}
            disabled={!fromLocationId}
          >
            <option value="">Bir depo seçiniz</option>
            {toOptions.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="bc-req">Talep Eden</Label>
          <Select
            id="bc-req"
            value={requestedById}
            onChange={(e) => setRequestedById(e.target.value)}
          >
            <option value="">Seçin…</option>
            {fieldUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName} ({formatRoles(u.roles as UserRole[])})
              </option>
            ))}
          </Select>
        </div>
      </div>

      <form onSubmit={handleScanSubmit} className="space-y-2">
        <Label htmlFor="barcode-scan">Barkod Okut</Label>
        <Input
          ref={inputRef}
          id="barcode-scan"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          placeholder="Barkodu okutun veya yazıp Enter’a basın…"
          className="h-14 font-mono text-lg tracking-wide"
          autoComplete="off"
          disabled={scanning || isPending || !fromLocationId}
        />
        <p className="text-xs text-zinc-500">
          Okuyucu Enter gönderir; form submit engellenir, arama tetiklenir.
        </p>
      </form>

      {errorAlert ? (
        <div
          className="rounded-xl border-2 border-red-500/60 bg-red-500/15 px-4 py-4 text-center"
          role="alert"
        >
          <p className="text-lg font-semibold text-red-300 sm:text-xl">
            {errorAlert}
          </p>
        </div>
      ) : null}

      {success ? (
        <p className="rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-300">
          {success}
        </p>
      ) : null}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-300">
            Transfer Sepeti
          </h3>
          <span className="font-mono text-xs text-blue-400">
            {basket.length} kalem · {totalQty} adet
          </span>
        </div>

        {basket.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500">
            Sepet boş. Barkod okutarak ürün ekleyin.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="bg-zinc-900/80 text-zinc-400">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Ürün</th>
                  <th className="px-4 py-3 text-left font-medium">Lot</th>
                  <th className="px-4 py-3 text-right font-medium">Adet</th>
                  <th className="px-4 py-3 text-right font-medium" />
                </tr>
              </thead>
              <tbody>
                {basket.map((line) => (
                  <tr key={line.key} className="border-t border-zinc-800">
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">
                        {line.referenceCode} {line.productName}
                      </p>
                      <p className="font-mono text-xs text-zinc-500">
                        {line.barcode}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-mono text-blue-300">
                      {line.lotNumber}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-lg text-blue-200">
                      {line.quantity}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeLine(line.key)}
                        aria-label="Kaldır"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Button
        type="button"
        size="lg"
        className="w-full sm:w-auto"
        disabled={
          isPending ||
          basket.length === 0 ||
          !fromLocationId ||
          !toLocationId ||
          !requestedById
        }
        onClick={confirmBasket}
      >
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Transfer ediliyor…
          </>
        ) : (
          `Sepetteki ${totalQty} Ürünü Transfer Et`
        )}
      </Button>

      <Dialog
        open={!!pendingLot}
        onOpenChange={(open) => {
          if (!open) {
            setPendingLot(null);
            focusScanner();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Hangi Lot?</DialogTitle>
          <DialogDescription>
            {pendingLot
              ? `${pendingLot.referenceCode} ${pendingLot.productName} — birden fazla lot var.`
              : null}
          </DialogDescription>
        </DialogHeader>
        <DialogContent className="space-y-3">
          {pendingLot?.lots.map((lot) => (
            <label
              key={lot.lotNumber}
              className="flex cursor-pointer items-center justify-between rounded-lg border border-zinc-800 px-4 py-3 hover:border-blue-500/40 hover:bg-blue-500/5"
            >
              <span className="flex items-center gap-3">
                <input
                  type="radio"
                  name="lot"
                  value={lot.lotNumber}
                  checked={selectedLot === lot.lotNumber}
                  onChange={() => setSelectedLot(lot.lotNumber)}
                  className="accent-blue-500"
                />
                <span className="font-mono text-blue-300">{lot.lotNumber}</span>
              </span>
              <span className="text-sm text-zinc-400">
                {lot.available} adet
              </span>
            </label>
          ))}
        </DialogContent>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setPendingLot(null);
              focusScanner();
            }}
          >
            İptal
          </Button>
          <Button type="button" onClick={confirmLotChoice}>
            Sepete Ekle
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
