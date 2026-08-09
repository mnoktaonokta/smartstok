"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { FailPendingLine } from "@/lib/fail/types";
import { confirmSupplierReceiptAction } from "@/lib/actions/fail";
import {
  compareSupplierReceipt,
  type ExcessLine,
  type SupplierReceiptCompare,
} from "@/lib/fail/compare";
import { scanBarcodeForFailGiveAction, searchFailGiveCatalogAction } from "@/lib/actions/fail";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type RecLine = {
  key: string;
  productId: string;
  referenceCode: string;
  productName: string;
  quantity: number;
  lotNumber: string;
};

type SwapRow = {
  expectedProductId: string;
  receivedProductId: string;
  quantity: number;
};

type ExcessReplaceRow = {
  surplusProductId: string;
  replacedProductId: string;
  quantity: number;
};

function productLabel(
  productId: string,
  pending: FailPendingLine[],
  lines: RecLine[],
) {
  const fromPending = pending.find((p) => p.productId === productId);
  if (fromPending) {
    return `${fromPending.referenceCode} — ${fromPending.productName}`;
  }
  const fromLine = lines.find((l) => l.productId === productId);
  if (fromLine) {
    return `${fromLine.referenceCode} — ${fromLine.productName}`;
  }
  return productId;
}

function buildDefaultExcessRows(
  surpluses: ExcessLine[],
  replaceCandidates: ExcessLine[],
): ExcessReplaceRow[] {
  const rows: ExcessReplaceRow[] = [];
  const candidates = replaceCandidates.map((c) => ({ ...c }));
  for (const s of surpluses) {
    let left = s.quantity;
    for (const c of candidates) {
      if (left <= 0) break;
      if (c.quantity <= 0) continue;
      const take = Math.min(left, c.quantity);
      rows.push({
        surplusProductId: s.productId,
        replacedProductId: c.productId,
        quantity: take,
      });
      c.quantity -= take;
      left -= take;
    }
    if (left > 0) {
      rows.push({
        surplusProductId: s.productId,
        replacedProductId: replaceCandidates[0]?.productId ?? "",
        quantity: left,
      });
    }
  }
  return rows.length
    ? rows
    : [
        {
          surplusProductId: surpluses[0]?.productId ?? "",
          replacedProductId: replaceCandidates[0]?.productId ?? "",
          quantity: surpluses[0]?.quantity ?? 1,
        },
      ];
}

export function FailSupplierReceive({
  pending,
  canMutate,
  /** Barkod tarama için herhangi bir müşteri id (stok kaynağı önemli değil; katalog lookup) */
  fallbackCustomerId,
}: {
  pending: FailPendingLine[];
  canMutate: boolean;
  fallbackCustomerId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<RecLine[]>([]);
  const [barcode, setBarcode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [compare, setCompare] = useState<SupplierReceiptCompare | null>(null);
  const [swapMode, setSwapMode] = useState(false);
  const [excessAskMode, setExcessAskMode] = useState(false);
  const [excessPickMode, setExcessPickMode] = useState(false);
  const [swaps, setSwaps] = useState<SwapRow[]>([]);
  const [excessReplacements, setExcessReplacements] = useState<ExcessReplaceRow[]>(
    [],
  );
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  function resetDialogModes() {
    setSwapMode(false);
    setExcessAskMode(false);
    setExcessPickMode(false);
    setSwaps([]);
    setExcessReplacements([]);
    setCompare(null);
  }

  function addLine(productId: string, referenceCode: string, productName: string) {
    setLines((prev) => {
      const existing = prev.find((p) => p.productId === productId);
      if (existing) {
        return prev.map((p) =>
          p.productId === productId ? { ...p, quantity: p.quantity + 1 } : p,
        );
      }
      return [
        ...prev,
        {
          key: productId,
          productId,
          referenceCode,
          productName,
          quantity: 1,
          lotNumber: "",
        },
      ];
    });
  }

  async function handleScan(parsed: { barkod: string }) {
    setError(null);
    const raw = parsed.barkod;
    const customerId = fallbackCustomerId;
    if (!customerId) {
      const hits = await searchFailGiveCatalogAction(raw);
      const hit =
        hits.find((h) => h.barcode === raw || h.referenceCode === raw) ??
        hits[0];
      if (!hit) {
        setError("Ürün bulunamadı.");
        setBarcode("");
        return;
      }
      addLine(hit.id, hit.referenceCode, hit.name);
      setBarcode("");
      return;
    }
    const result = await scanBarcodeForFailGiveAction(raw, customerId);
    setBarcode("");
    if (!result.ok) {
      const hits = await searchFailGiveCatalogAction(raw);
      const hit = hits[0];
      if (!hit) {
        setError(result.error);
        return;
      }
      addLine(hit.id, hit.referenceCode, hit.name);
      return;
    }
    addLine(result.productId, result.referenceCode, result.productName);
  }

  function previewCompare() {
    const expected = pending.map((p) => ({
      productId: p.productId,
      quantity: p.quantity,
    }));
    const received = lines.map((l) => ({
      productId: l.productId,
      quantity: l.quantity,
    }));
    return compareSupplierReceipt(expected, received);
  }

  function enterExcessAsk(cmp: Extract<SupplierReceiptCompare, { kind: "excess_swap" }>) {
    setExcessAskMode(true);
    setExcessPickMode(false);
    setSwapMode(false);
    setCompare(cmp);
    setMessage(cmp.message);
    setExcessReplacements(
      buildDefaultExcessRows(cmp.surpluses, cmp.replaceCandidates),
    );
  }

  function handleConfirm(opts?: {
    confirmSwap?: boolean;
    confirmExcessSwap?: boolean;
    swaps?: SwapRow[];
    excessReplacements?: ExcessReplaceRow[];
  }) {
    setError(null);
    setMessage(null);
    const cmp = previewCompare();
    setCompare(cmp);

    if (cmp.kind === "over") {
      setError(cmp.message);
      return;
    }
    if (cmp.kind === "excess_swap" && !opts?.confirmExcessSwap) {
      enterExcessAsk(cmp);
      return;
    }
    if (cmp.kind === "swap" && !opts?.confirmSwap) {
      setSwapMode(true);
      setExcessAskMode(false);
      setExcessPickMode(false);
      setMessage(cmp.message);
      if (swaps.length === 0) {
        setSwaps([
          {
            expectedProductId: pending[0]?.productId ?? "",
            receivedProductId: lines[0]?.productId ?? "",
            quantity: lines.reduce((s, l) => s + l.quantity, 0),
          },
        ]);
      }
      return;
    }

    startTransition(async () => {
      const result = await confirmSupplierReceiptAction({
        lines: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          lotNumber: l.lotNumber || null,
        })),
        confirmSwap: opts?.confirmSwap,
        confirmExcessSwap: opts?.confirmExcessSwap,
        swaps: opts?.swaps ?? swaps,
        excessReplacements: opts?.excessReplacements ?? excessReplacements,
      });
      if (result.error) {
        setError(result.error);
        if (result.compare?.kind === "swap") {
          setSwapMode(true);
          setCompare(result.compare);
          setMessage(result.compare.message);
        }
        if (result.compare?.kind === "excess_swap") {
          enterExcessAsk(result.compare);
        }
        return;
      }
      setMessage(result.compare?.message ?? "Stoğa eklendi.");
      setOpen(false);
      setLines([]);
      resetDialogModes();
      router.refresh();
    });
  }

  const surplusLabels =
    compare?.kind === "excess_swap"
      ? compare.surpluses.map((s) => ({
          ...s,
          label: productLabel(s.productId, pending, lines),
        }))
      : [];
  const replaceCandidates =
    compare?.kind === "excess_swap" ? compare.replaceCandidates : [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Tedarikçi Bekleme deposundaki ürünler aşağıda. Gelen ürünleri sayıp
        karşılaştırın.
      </p>

      {pending.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          Bekleyen tedarikçi ürünü yok.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Referans</TableHead>
              <TableHead>Ürün</TableHead>
              <TableHead className="text-right">Beklenen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pending.map((p) => (
              <TableRow key={p.productId}>
                <TableCell className="font-mono">{p.referenceCode}</TableCell>
                <TableCell>{p.productName}</TableCell>
                <TableCell className="text-right font-mono">{p.quantity}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {canMutate ? (
        <Button
          type="button"
          disabled={pending.length === 0}
          onClick={() => {
            setOpen(true);
            setError(null);
            setMessage(null);
            resetDialogModes();
            setLines([]);
          }}
        >
          Tedarikçiden ürünler geldi
        </Button>
      ) : null}

      {message && !open ? (
        <p className="text-sm text-emerald-600" role="status">
          {message}
        </p>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tedarikçiden teslim alma</DialogTitle>
          <DialogDescription>
            Gelen ürünleri barkod veya manuel ekleyin, ardından stoğa ekleyin.
          </DialogDescription>
        </DialogHeader>
        <DialogContent className="space-y-4">
          {!excessAskMode && !excessPickMode && !swapMode ? (
            <>
              <BarcodeInput
                ref={inputRef}
                value={barcode}
                onValueChange={setBarcode}
                onParsed={handleScan}
                placeholder="Gelen ürün barkodu…"
              />
              <ReceiveManualAdd onAdd={addLine} />

              {lines.length > 0 ? (
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {lines.map((l) => (
                    <li
                      key={l.key}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                    >
                      <span>
                        {l.referenceCode} — {l.productName}
                      </span>
                      <div className="flex items-center gap-2">
                        <Input
                          className="w-24"
                          placeholder="Lot"
                          value={l.lotNumber}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((p) =>
                                p.key === l.key
                                  ? { ...p, lotNumber: e.target.value }
                                  : p,
                              ),
                            )
                          }
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="min-w-11 px-0"
                          onClick={() =>
                            setLines((prev) =>
                              prev
                                .map((p) =>
                                  p.key === l.key
                                    ? { ...p, quantity: Math.max(0, p.quantity - 1) }
                                    : p,
                                )
                                .filter((p) => p.quantity > 0),
                            )
                          }
                        >
                          −
                        </Button>
                        <span className="w-6 text-center font-mono">{l.quantity}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="min-w-11 px-0"
                          onClick={() =>
                            setLines((prev) =>
                              prev.map((p) =>
                                p.key === l.key
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
                            setLines((prev) => prev.filter((p) => p.key !== l.key))
                          }
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}

          {compare && (excessAskMode || excessPickMode || swapMode) ? (
            <p className="text-sm text-amber-600 dark:text-amber-300">
              {compare.message}
            </p>
          ) : compare && !excessAskMode && !excessPickMode && !swapMode ? (
            <p className="text-sm text-amber-600 dark:text-amber-300">
              {compare.message}
            </p>
          ) : null}

          {excessAskMode && compare?.kind === "excess_swap" ? (
            <div className="space-y-3 rounded-xl border border-border p-3">
              <ul className="space-y-1 text-sm text-muted-foreground">
                {surplusLabels.map((s) => (
                  <li key={s.productId}>
                    Fazla: <span className="font-medium text-foreground">{s.label}</span>{" "}
                    (+{s.quantity})
                  </li>
                ))}
              </ul>
              <p className="text-sm">
                Bu fazlalığı listedeki gelmeyen bir ürünün yerine saymak ister
                misiniz?
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    setExcessAskMode(false);
                    setExcessPickMode(true);
                  }}
                >
                  Evet, değiştir
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setExcessAskMode(false);
                    setExcessPickMode(false);
                    setCompare(null);
                    setMessage(null);
                    setError(
                      "Adedi düzeltin: fazla girilen ürünü azaltın veya listeden silin.",
                    );
                  }}
                >
                  Hayır, adedi düzelteceğim
                </Button>
              </div>
            </div>
          ) : null}

          {excessPickMode && compare?.kind === "excess_swap" ? (
            <div className="space-y-3 rounded-xl border border-border p-3">
              <p className="text-sm font-medium">
                Fazla gelen hangi ürün, listedeki hangi ürünün yerine sayılsın?
              </p>
              {excessReplacements.map((row, idx) => (
                <div key={idx} className="grid gap-2 sm:grid-cols-3">
                  <div>
                    <Label className="text-xs">Fazla gelen</Label>
                    <Select
                      value={row.surplusProductId}
                      onChange={(e) =>
                        setExcessReplacements((prev) =>
                          prev.map((r, i) =>
                            i === idx
                              ? { ...r, surplusProductId: e.target.value }
                              : r,
                          ),
                        )
                      }
                    >
                      {compare.surpluses.map((s) => (
                        <option key={s.productId} value={s.productId}>
                          {productLabel(s.productId, pending, lines)} (+
                          {s.quantity})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Yerine (listeden silinecek)</Label>
                    <Select
                      value={row.replacedProductId}
                      onChange={(e) =>
                        setExcessReplacements((prev) =>
                          prev.map((r, i) =>
                            i === idx
                              ? { ...r, replacedProductId: e.target.value }
                              : r,
                          ),
                        )
                      }
                    >
                      {replaceCandidates.map((c) => (
                        <option key={c.productId} value={c.productId}>
                          {productLabel(c.productId, pending, lines)} (bekleyen{" "}
                          {c.quantity})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Adet</Label>
                    <Input
                      type="number"
                      min={1}
                      value={row.quantity}
                      onChange={(e) =>
                        setExcessReplacements((prev) =>
                          prev.map((r, i) =>
                            i === idx
                              ? {
                                  ...r,
                                  quantity: Math.max(1, Number(e.target.value) || 1),
                                }
                              : r,
                          ),
                        )
                      }
                    />
                  </div>
                </div>
              ))}
              {compare.surpluses.length > 1 ||
              compare.replaceCandidates.length > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setExcessReplacements((prev) => [
                      ...prev,
                      {
                        surplusProductId: compare.surpluses[0]?.productId ?? "",
                        replacedProductId:
                          compare.replaceCandidates[0]?.productId ?? "",
                        quantity: 1,
                      },
                    ])
                  }
                >
                  Satır ekle
                </Button>
              ) : null}
            </div>
          ) : null}

          {swapMode ? (
            <div className="space-y-3 rounded-xl border border-border p-3">
              <p className="text-sm font-medium">Takas eşleştirmesi</p>
              {swaps.map((s, idx) => (
                <div key={idx} className="grid gap-2 sm:grid-cols-3">
                  <div>
                    <Label className="text-xs">Beklenen</Label>
                    <Select
                      value={s.expectedProductId}
                      onChange={(e) =>
                        setSwaps((prev) =>
                          prev.map((row, i) =>
                            i === idx
                              ? { ...row, expectedProductId: e.target.value }
                              : row,
                          ),
                        )
                      }
                    >
                      {pending.map((p) => (
                        <option key={p.productId} value={p.productId}>
                          {p.referenceCode}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Gelen</Label>
                    <Select
                      value={s.receivedProductId}
                      onChange={(e) =>
                        setSwaps((prev) =>
                          prev.map((row, i) =>
                            i === idx
                              ? { ...row, receivedProductId: e.target.value }
                              : row,
                          ),
                        )
                      }
                    >
                      {lines.map((l) => (
                        <option key={l.productId} value={l.productId}>
                          {l.referenceCode}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Adet</Label>
                    <Input
                      type="number"
                      min={1}
                      value={s.quantity}
                      onChange={(e) =>
                        setSwaps((prev) =>
                          prev.map((row, i) =>
                            i === idx
                              ? {
                                  ...row,
                                  quantity: Math.max(1, Number(e.target.value) || 1),
                                }
                              : row,
                          ),
                        )
                      }
                    />
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setSwaps((prev) => [
                    ...prev,
                    {
                      expectedProductId: pending[0]?.productId ?? "",
                      receivedProductId: lines[0]?.productId ?? "",
                      quantity: 1,
                    },
                  ])
                }
              >
                Satır ekle
              </Button>
            </div>
          ) : null}

          {error ? (
            <p className="text-sm text-red-500" role="alert">
              {error}
            </p>
          ) : null}
          {message && open && !excessAskMode ? (
            <p className="text-sm text-blue-600">{message}</p>
          ) : null}
        </DialogContent>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (excessPickMode) {
                setExcessPickMode(false);
                setExcessAskMode(true);
                return;
              }
              if (excessAskMode || swapMode) {
                resetDialogModes();
                setMessage(null);
                return;
              }
              setOpen(false);
            }}
          >
            {excessAskMode || excessPickMode || swapMode ? "Geri" : "Kapat"}
          </Button>
          {excessAskMode ? null : excessPickMode ? (
            <Button
              type="button"
              disabled={isPending || excessReplacements.length === 0}
              onClick={() =>
                handleConfirm({
                  confirmExcessSwap: true,
                  excessReplacements,
                })
              }
            >
              {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Değiştirmeyi Onayla
            </Button>
          ) : swapMode ? (
            <Button
              type="button"
              disabled={isPending || lines.length === 0}
              onClick={() => handleConfirm({ confirmSwap: true, swaps })}
            >
              {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Takası Onayla ve Stoğa Ekle
            </Button>
          ) : (
            <Button
              type="button"
              disabled={isPending || lines.length === 0}
              onClick={() => handleConfirm()}
            >
              {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Stoğa Ekle
            </Button>
          )}
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function ReceiveManualAdd({
  onAdd,
}: {
  onAdd: (productId: string, referenceCode: string, name: string) => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<
    Array<{ id: string; referenceCode: string; name: string }>
  >([]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      setHits(await searchFailGiveCatalogAction(q));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="relative">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Manuel ürün ara…"
      />
      {hits.length > 0 ? (
        <ul className="absolute z-20 mt-1 max-h-40 w-full overflow-auto rounded-lg border border-border bg-card py-1 shadow-lg">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onAdd(h.id, h.referenceCode, h.name);
                  setQ("");
                  setHits([]);
                }}
              >
                {h.referenceCode} — {h.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
