"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  createInvoiceAction,
  getLocationStockForInvoiceAction,
  type InvoiceStockRow,
} from "@/lib/actions/invoices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const TAX_RATE = 10;

type CustomerOption = {
  id: string;
  name: string;
  vknTckn: string;
  locations: Array<{ id: string; name: string }>;
};

type LineState = {
  selected: boolean;
  quantity: number;
  unitPrice: string;
  /** Satır iskontosu yüzde (0–100) */
  discountPercent: string;
};

type ComputedLine = {
  key: string;
  productId: string;
  lotNumber: string;
  quantity: number;
  unitPrice: number;
  gross: number;
  lineDiscountTl: number;
  footerShareTl: number;
  discountTl: number;
  net: number;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function computeFinancials(
  stockRows: InvoiceStockRow[],
  lines: Record<string, LineState>,
  targetTotalInput: string,
) {
  const baseLines: Array<
    Omit<ComputedLine, "footerShareTl" | "discountTl" | "net"> & {
      netAfterLine: number;
    }
  > = [];

  for (const row of stockRows) {
    const state = lines[row.key];
    if (!state?.selected) continue;

    const quantity = Math.min(state.quantity, row.available);
    const unitPrice = Number(state.unitPrice) || 0;
    const pct = Math.min(100, Math.max(0, Number(state.discountPercent) || 0));
    const gross = round2(unitPrice * quantity);
    const lineDiscountTl = round2((gross * pct) / 100);
    const netAfterLine = round2(Math.max(0, gross - lineDiscountTl));

    baseLines.push({
      key: row.key,
      productId: row.productId,
      lotNumber: row.lotNumber,
      quantity,
      unitPrice,
      gross,
      lineDiscountTl,
      netAfterLine,
    });
  }

  const quantityTotal = baseLines.reduce((s, l) => s + l.quantity, 0);
  const grossTotal = round2(baseLines.reduce((s, l) => s + l.gross, 0));
  const lineDiscountTotal = round2(
    baseLines.reduce((s, l) => s + l.lineDiscountTl, 0),
  );
  const netAfterLines = round2(baseLines.reduce((s, l) => s + l.netAfterLine, 0));
  const taxMultiplier = 1 + TAX_RATE / 100;
  const grandAfterLines = round2(netAfterLines * taxMultiplier);

  // Hedef tutar KDV dahil (TOPLAM). Fark, KDV hariç TL iskontoya çevrilir.
  let footerDiscountTl = 0;
  const targetParsed =
    targetTotalInput.trim() === "" ? null : Number(targetTotalInput);
  if (targetParsed != null && !Number.isNaN(targetParsed) && netAfterLines > 0) {
    const targetTotalInclVat = Math.max(0, targetParsed);
    if (targetTotalInclVat < grandAfterLines) {
      const targetNetExclVat = round2(targetTotalInclVat / taxMultiplier);
      footerDiscountTl = round2(Math.max(0, netAfterLines - targetNetExclVat));
    }
  }

  // Fatura altı iskontuyu satır netlerine oranla dağıt
  const computed: ComputedLine[] = [];
  let allocated = 0;

  baseLines.forEach((line, index) => {
    let footerShareTl = 0;
    if (footerDiscountTl > 0 && netAfterLines > 0) {
      if (index === baseLines.length - 1) {
        footerShareTl = round2(footerDiscountTl - allocated);
      } else {
        footerShareTl = round2(
          (footerDiscountTl * line.netAfterLine) / netAfterLines,
        );
        allocated = round2(allocated + footerShareTl);
      }
    }

    const discountTl = round2(
      Math.min(line.gross, line.lineDiscountTl + footerShareTl),
    );
    const net = round2(Math.max(0, line.gross - discountTl));

    computed.push({
      key: line.key,
      productId: line.productId,
      lotNumber: line.lotNumber,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      gross: line.gross,
      lineDiscountTl: line.lineDiscountTl,
      footerShareTl,
      discountTl,
      net,
    });
  });

  const totalDiscount = round2(computed.reduce((s, l) => s + l.discountTl, 0));
  const netTotal = round2(Math.max(0, grossTotal - totalDiscount));
  const taxTotal = round2(netTotal * (TAX_RATE / 100));
  const grandTotal = round2(netTotal + taxTotal);

  return {
    computed,
    summary: {
      quantityTotal,
      grossTotal,
      totalDiscount,
      lineDiscountTotal,
      footerDiscountTl,
      netTotal,
      taxTotal,
      grandTotal,
      taxRate: TAX_RATE,
    },
  };
}

function formatTry(n: number) {
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function NewInvoiceForm({
  customers,
}: {
  customers: CustomerOption[];
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [note, setNote] = useState("");
  const [targetTotal, setTargetTotal] = useState("");
  const [stockRows, setStockRows] = useState<InvoiceStockRow[]>([]);
  const [lines, setLines] = useState<Record<string, LineState>>({});
  const [loadingStock, setLoadingStock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const customer = customers.find((c) => c.id === customerId);
  const locations = customer?.locations ?? [];

  useEffect(() => {
    const locs = customers.find((c) => c.id === customerId)?.locations ?? [];
    if (locs.length === 1) {
      setLocationId(locs[0].id);
    } else {
      setLocationId("");
    }
  }, [customerId, customers]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!locationId) {
        setStockRows([]);
        setLines({});
        setTargetTotal("");
        return;
      }

      setLoadingStock(true);
      try {
        const rows = await getLocationStockForInvoiceAction(locationId);
        if (cancelled) return;
        setStockRows(rows);
        const next: Record<string, LineState> = {};
        for (const row of rows) {
          next[row.key] = {
            selected: false,
            quantity: 1,
            unitPrice: row.defaultSalePrice,
            discountPercent: "0",
          };
        }
        setLines(next);
        setTargetTotal("");
      } finally {
        if (!cancelled) setLoadingStock(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  const { computed, summary } = useMemo(
    () => computeFinancials(stockRows, lines, targetTotal),
    [stockRows, lines, targetTotal],
  );

  const selectedCount = computed.length;

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (computed.length === 0) {
      setError("Fatura için en az bir ürün seçin.");
      return;
    }

    if (targetTotal.trim() !== "") {
      const target = Number(targetTotal);
      if (Number.isNaN(target) || target < 0) {
        setError("Fatura altı hedef tutar (KDV dahil) geçersiz.");
        return;
      }
    }

    // API'ye yüzde değil, satır bazlı TL indirim gönder
    const payloadLines = computed.map((line) => ({
      productId: line.productId,
      lotNumber: line.lotNumber,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discount: line.discountTl,
    }));

    startTransition(async () => {
      const result = await createInvoiceAction({
        customerId,
        locationId,
        note: note || undefined,
        lines: payloadLines,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.bizimHesapUrl) {
        window.open(result.bizimHesapUrl, "_blank", "noopener,noreferrer");
      }

      router.push("/dashboard/invoices");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="customer">Müşteri / Klinik</Label>
          <Select
            id="customer"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            required
          >
            <option value="">Seçin…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.vknTckn})
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="location">Konsinye Deposu</Label>
          <Select
            id="location"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            required
            disabled={!customerId}
          >
            <option value="">Seçin…</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="note">Not (opsiyonel)</Label>
          <Input
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Fatura açıklaması"
          />
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-white">Depo Stokları</h2>
          <span className="font-mono text-xs text-blue-400">
            {selectedCount} kalem seçili
          </span>
        </div>

        {loadingStock ? (
          <p className="text-sm text-zinc-500">Stoklar yükleniyor…</p>
        ) : null}

        {!locationId ? (
          <p className="text-sm text-zinc-500">Önce müşteri ve depo seçin.</p>
        ) : stockRows.length === 0 && !loadingStock ? (
          <p className="text-sm text-amber-300/90">
            Bu depoda faturalandırılacak müsait stok yok.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full min-w-[780px] text-sm">
              <thead className="bg-zinc-900/80 text-zinc-400">
                <tr>
                  <th className="px-3 py-3 text-left">Seç</th>
                  <th className="px-3 py-3 text-left">Ürün / Lot</th>
                  <th className="px-3 py-3 text-left">Müsait</th>
                  <th className="px-3 py-3 text-left">Adet</th>
                  <th className="px-3 py-3 text-left">Birim Fiyat</th>
                  <th className="px-3 py-3 text-left">İskonto %</th>
                </tr>
              </thead>
              <tbody>
                {stockRows.map((row) => {
                  const state = lines[row.key];
                  if (!state) return null;
                  return (
                    <tr key={row.key} className="border-t border-zinc-800">
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={state.selected}
                          onChange={(e) =>
                            updateLine(row.key, { selected: e.target.checked })
                          }
                          className="size-4 accent-blue-500"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-medium text-white">
                          {row.referenceCode} {row.productName}
                        </p>
                        <p className="font-mono text-xs text-blue-300">
                          Lot {row.lotNumber}
                        </p>
                      </td>
                      <td className="px-3 py-3 font-mono text-zinc-300">
                        {row.available}
                      </td>
                      <td className="px-3 py-3">
                        <Input
                          type="number"
                          min={1}
                          max={row.available}
                          className="h-9 w-20"
                          disabled={!state.selected}
                          value={state.quantity}
                          onChange={(e) =>
                            updateLine(row.key, {
                              quantity: Math.min(
                                row.available,
                                Math.max(1, Number(e.target.value) || 1),
                              ),
                            })
                          }
                        />
                      </td>
                      <td className="px-3 py-3">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          className="h-9 w-28"
                          disabled={!state.selected}
                          value={state.unitPrice}
                          onChange={(e) =>
                            updateLine(row.key, { unitPrice: e.target.value })
                          }
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            className="h-9 w-20"
                            disabled={!state.selected}
                            value={state.discountPercent}
                            onChange={(e) =>
                              updateLine(row.key, {
                                discountPercent: e.target.value,
                              })
                            }
                          />
                          <span className="text-xs text-zinc-500">%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-white">
            Fatura Altı İskonto
          </h3>
          <p className="text-xs text-zinc-500">
            Faturanın kapanmasını istediğiniz{" "}
            <strong className="text-zinc-300">KDV dahil toplam tutarı</strong> girin.
            Fark KDV hariç TL iskontoya çevrilip seçili satırlara oranlanır.
          </p>
          <div className="space-y-2">
            <Label htmlFor="target-total">Hedef Toplam (KDV dahil)</Label>
            <Input
              id="target-total"
              type="number"
              min={0}
              step="0.01"
              value={targetTotal}
              onChange={(e) => setTargetTotal(e.target.value)}
              placeholder={`Örn: ${formatTry(summary.grandTotal)}`}
              disabled={selectedCount === 0}
            />
            {summary.footerDiscountTl > 0 ? (
              <p className="text-xs text-blue-300">
                Dağıtılacak genel iskonto (KDV hariç):{" "}
                {formatTry(summary.footerDiscountTl)} ₺
              </p>
            ) : (
              <p className="text-xs text-zinc-600">
                Boş bırakırsanız yalnızca satır % iskontoları uygulanır.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
          <h3 className="mb-3 text-sm font-medium text-blue-200">
            Canlı Finansal Özet
          </h3>
          <dl className="space-y-2 text-sm">
            <SummaryRow label="Toplam Miktar" value={`${summary.quantityTotal} adet`} />
            <SummaryRow
              label="Brüt Toplam"
              value={`${formatTry(summary.grossTotal)} ₺`}
            />
            <SummaryRow
              label="Toplam İndirim"
              value={`${formatTry(summary.totalDiscount)} ₺`}
              muted
            />
            <SummaryRow
              label="Net Toplam"
              value={`${formatTry(summary.netTotal)} ₺`}
            />
            <SummaryRow
              label={`KDV (%${summary.taxRate})`}
              value={`${formatTry(summary.taxTotal)} ₺`}
            />
            <div className="my-2 border-t border-blue-500/20" />
            <SummaryRow
              label="TOPLAM"
              value={`${formatTry(summary.grandTotal)} ₺`}
              emphasize
            />
          </dl>
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

      <Button
        type="submit"
        size="lg"
        disabled={isPending || !customerId || !locationId || selectedCount === 0}
      >
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Bizim Hesap’a gönderiliyor…
          </>
        ) : (
          "Faturayı Oluştur"
        )}
      </Button>
    </form>
  );
}

function SummaryRow({
  label,
  value,
  muted,
  emphasize,
}: {
  label: string;
  value: string;
  muted?: boolean;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={emphasize ? "font-medium text-white" : "text-zinc-400"}>
        {label}
      </dt>
      <dd
        className={
          emphasize
            ? "font-mono text-base font-semibold text-blue-300"
            : muted
              ? "font-mono text-amber-300/90"
              : "font-mono text-zinc-100"
        }
      >
        {value}
      </dd>
    </div>
  );
}
