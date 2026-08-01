"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, CheckCircle2 } from "lucide-react";
import {
  completeInventoryCountAction,
  incrementCountByBarcodeAction,
  saveInventoryCountDraftAction,
  setCountItemQuantityAction,
  type InventoryCountDetail,
  type InventoryCountLine,
} from "@/lib/actions/inventory-count";
import { BarcodeInput } from "@/components/ui/barcode-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

function rowTone(diff: number) {
  if (diff === 0) {
    return "bg-emerald-500/10 hover:bg-emerald-500/15";
  }
  if (diff < 0) {
    return "bg-red-500/10 hover:bg-red-500/15";
  }
  return "bg-amber-500/10 hover:bg-amber-500/15";
}

function diffLabel(diff: number) {
  if (diff === 0) return "0";
  return diff > 0 ? `+${diff}` : String(diff);
}

export function InventoryCountWorkspace({
  initial,
  canMutate,
}: {
  initial: InventoryCountDetail;
  canMutate: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState<InventoryCountLine[]>(initial.items);
  const [status, setStatus] = useState(initial.status);
  const [barcode, setBarcode] = useState("");
  const [filter, setFilter] = useState<"all" | "diff" | "short" | "over">(
    "all",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [lastScannedId, setLastScannedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const readOnly = status !== "DRAFT" || !canMutate;

  const focusScanner = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    focusScanner();
  }, [focusScanner]);

  const stats = useMemo(() => {
    let matched = 0;
    let short = 0;
    let over = 0;
    let absDiff = 0;
    for (const i of items) {
      const d = i.countedQuantity - i.expectedQuantity;
      absDiff += Math.abs(d);
      if (d === 0) matched += 1;
      else if (d < 0) short += 1;
      else over += 1;
    }
    return { matched, short, over, absDiff, total: items.length };
  }, [items]);

  const visible = useMemo(() => {
    return items.filter((i) => {
      const d = i.countedQuantity - i.expectedQuantity;
      if (filter === "diff") return d !== 0;
      if (filter === "short") return d < 0;
      if (filter === "over") return d > 0;
      return true;
    });
  }, [items, filter]);

  function upsertItem(line: InventoryCountLine) {
    setItems((prev) => {
      const idx = prev.findIndex((p) => p.id === line.id);
      if (idx === -1) return [line, ...prev].sort((a, b) =>
        a.productName.localeCompare(b.productName, "tr"),
      );
      const next = [...prev];
      next[idx] = line;
      return next;
    });
    setLastScannedId(line.id);
  }

  function handleScan(code: string) {
    if (readOnly || !code.trim()) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await incrementCountByBarcodeAction({
        countId: initial.id,
        barcode: code,
      });
      setBarcode("");
      focusScanner();
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.item) {
        upsertItem(result.item);
        setMessage(
          `+1 · ${result.item.productName} → ${result.item.countedQuantity}`,
        );
      }
    });
  }

  function handleQtyBlur(itemId: string, raw: string) {
    if (readOnly) return;
    const qty = Math.max(0, Math.floor(Number(raw) || 0));
    const current = items.find((i) => i.id === itemId);
    if (!current || current.countedQuantity === qty) return;

    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId
          ? {
              ...i,
              countedQuantity: qty,
              difference: qty - i.expectedQuantity,
            }
          : i,
      ),
    );

    startTransition(async () => {
      const result = await setCountItemQuantityAction({
        countId: initial.id,
        itemId,
        countedQuantity: qty,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.item) upsertItem(result.item);
    });
  }

  function handleSaveDraft() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await saveInventoryCountDraftAction({
        countId: initial.id,
        items: items.map((i) => ({
          id: i.id,
          countedQuantity: i.countedQuantity,
        })),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage("Taslak kaydedildi. Stoklar değiştirilmedi.");
      router.refresh();
      focusScanner();
    });
  }

  function handleComplete() {
    if (
      !window.confirm(
        "Merkez depo stokları sayılan miktarlara eşitlenecek ve fiş kapatılacak. Emin misiniz?",
      )
    ) {
      return;
    }
    setError(null);
    setMessage(null);
    startTransition(async () => {
      // Önce satırları kalıcılaştır
      const saved = await saveInventoryCountDraftAction({
        countId: initial.id,
        items: items.map((i) => ({
          id: i.id,
          countedQuantity: i.countedQuantity,
        })),
      });
      if (saved.error) {
        setError(saved.error);
        return;
      }

      const result = await completeInventoryCountAction(initial.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setStatus("COMPLETED");
      setMessage("Stoklar güncellendi. Sayım tamamlandı.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={cn(
            "rounded-md px-2 py-1 font-medium",
            status === "DRAFT"
              ? "bg-amber-500/15 text-amber-200"
              : "bg-emerald-500/15 text-emerald-200",
          )}
        >
          {status === "DRAFT" ? "Taslak" : "Tamamlandı"}
        </span>
        <span className="text-zinc-500">
          {stats.total} satır · |fark| {stats.absDiff} ·{" "}
          <span className="text-emerald-400">{stats.matched} OK</span> ·{" "}
          <span className="text-red-400">{stats.short} eksik</span> ·{" "}
          <span className="text-amber-300">{stats.over} fazla</span>
        </span>
      </div>

      {!readOnly ? (
        <div className="space-y-2 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
          <Label htmlFor="sayim-barcode">Barkod Okut</Label>
          <BarcodeInput
            ref={inputRef}
            id="sayim-barcode"
            value={barcode}
            onValueChange={setBarcode}
            onEnter={(parsed) => handleScan(parsed.barkod)}
            placeholder="Barkod veya karekod okutun…"
            className="h-14 font-mono text-lg tracking-wide"
            disabled={isPending}
          />
          <p className="text-xs text-zinc-500">
            Enter ile +1. Karekoddan EAN ayrıştırılır.
          </p>
        </div>
      ) : null}

      {message ? (
        <p className="rounded-md border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-sm text-blue-200">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", "Tümü"],
            ["diff", "Farklılar"],
            ["short", "Eksikler"],
            ["over", "Fazlalar"],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={filter === key ? "default" : "outline"}
            onClick={() => setFilter(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ürün</TableHead>
            <TableHead>Barkod</TableHead>
            <TableHead className="text-right">Sistem</TableHead>
            <TableHead className="text-right">Sayılan</TableHead>
            <TableHead className="text-right">Fark</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((row) => {
            const diff = row.countedQuantity - row.expectedQuantity;
            return (
              <TableRow
                key={row.id}
                className={cn(
                  rowTone(diff),
                  lastScannedId === row.id && "ring-1 ring-inset ring-blue-400/40",
                )}
              >
                <TableCell>
                  <p className="font-medium text-zinc-100">{row.productName}</p>
                  <p className="text-xs text-zinc-500">
                    {row.brand} · {row.referenceCode}
                  </p>
                </TableCell>
                <TableCell className="font-mono text-xs text-zinc-300">
                  {row.barcode ?? "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-zinc-200">
                  {row.expectedQuantity}
                </TableCell>
                <TableCell className="text-right">
                  {readOnly ? (
                    <span className="font-mono text-zinc-100">
                      {row.countedQuantity}
                    </span>
                  ) : (
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      defaultValue={row.countedQuantity}
                      key={`${row.id}-${row.countedQuantity}`}
                      className="ml-auto h-9 w-24 text-right font-mono"
                      disabled={isPending}
                      onBlur={(e) => handleQtyBlur(row.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          (e.target as HTMLInputElement).blur();
                          focusScanner();
                        }
                      }}
                    />
                  )}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-mono font-medium",
                    diff === 0 && "text-emerald-300",
                    diff < 0 && "text-red-300",
                    diff > 0 && "text-amber-300",
                  )}
                >
                  {diffLabel(diff)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {!readOnly ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={handleSaveDraft}
          >
            {isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Sayımı Kaydet (Taslak)
          </Button>
          <Button type="button" disabled={isPending} onClick={handleComplete}>
            {isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            Stokları Güncelle ve Kapat
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/dashboard/sayim")}
        >
          Listeye Dön
        </Button>
      )}
    </div>
  );
}
