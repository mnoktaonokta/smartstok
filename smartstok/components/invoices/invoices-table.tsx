"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type InvoiceListRow = {
  id: string;
  invoiceNo: string | null;
  faturaNo: string | null;
  createdAt: string;
  customerName: string;
  customerVkn: string;
  itemCount: number;
  netApprox: string;
  bizimHesapGuid: string | null;
  documentType: string | null;
  eDocumentProvider: string | null;
  docStatus: string | null;
  uuid: string | null;
  lastError: string | null;
};

function listStatusLabel(inv: InvoiceListRow) {
  if (inv.bizimHesapGuid && !inv.documentType) return "Tamam";
  switch (inv.docStatus) {
    case "DRAFT":
      return "Taslak";
    case "DESPATCHED":
      return "e-İrsaliye";
    case "COMPLETED":
    case "SENT":
      if (inv.documentType === "EINVOICE") return "Faturalaşmış (E-Fatura)";
      if (inv.documentType === "EARCHIVE") return "Faturalaşmış (E-Arşiv)";
      return "Faturalaşmış";
    case "PROCESSING":
      return "İşleniyor";
    case "FAILED":
      return "Hata";
    case "CANCELLED":
      return "İptal";
    default:
      return inv.docStatus ?? "—";
  }
}

function statusClass(status: string | null) {
  if (status === "FAILED") return "text-red-400";
  if (status === "CANCELLED") return "text-zinc-500 line-through";
  if (status === "COMPLETED" || status === "SENT") return "text-emerald-400";
  if (status === "DESPATCHED") return "text-sky-300";
  if (status === "DRAFT" || status === "PROCESSING") return "text-amber-300";
  return "text-zinc-400";
}

type DocKind = "ALL" | "DRAFT" | "DESPATCH" | "INVOICED" | "FAILED";
type DatePreset =
  | "ALL"
  | "TODAY"
  | "THIS_MONTH"
  | "LAST_MONTH"
  | "LAST_1_MONTH"
  | "LAST_3_MONTHS"
  | "THIS_YEAR"
  | "CUSTOM";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function parseDateInput(value: string, end: boolean) {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return end ? endOfDay(d) : startOfDay(d);
}

function rangeForPreset(preset: DatePreset): { from: Date | null; to: Date | null } {
  const now = new Date();
  if (preset === "ALL" || preset === "CUSTOM") return { from: null, to: null };
  if (preset === "TODAY") return { from: startOfDay(now), to: endOfDay(now) };
  if (preset === "THIS_MONTH") {
    return {
      from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: endOfDay(now),
    };
  }
  if (preset === "LAST_MONTH") {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: startOfDay(from), to: endOfDay(to) };
  }
  if (preset === "LAST_1_MONTH") {
    const from = new Date(now);
    from.setMonth(from.getMonth() - 1);
    return { from: startOfDay(from), to: endOfDay(now) };
  }
  if (preset === "LAST_3_MONTHS") {
    const from = new Date(now);
    from.setMonth(from.getMonth() - 3);
    return { from: startOfDay(from), to: endOfDay(now) };
  }
  return { from: startOfDay(new Date(now.getFullYear(), 0, 1)), to: endOfDay(now) };
}

function matchesDocKind(inv: InvoiceListRow, kind: DocKind) {
  if (kind === "ALL") return true;
  if (kind === "DRAFT") return inv.docStatus === "DRAFT";
  if (kind === "DESPATCH") return inv.docStatus === "DESPATCHED";
  if (kind === "FAILED") return inv.docStatus === "FAILED";
  return inv.docStatus === "COMPLETED" || inv.docStatus === "SENT";
}

export function InvoicesTable({ invoices }: { invoices: InvoiceListRow[] }) {
  const [query, setQuery] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const [detailedOpen, setDetailedOpen] = useState(false);
  const [docKind, setDocKind] = useState<DocKind>("ALL");
  const [datePreset, setDatePreset] = useState<DatePreset>("ALL");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    const presetRange = rangeForPreset(datePreset);
    const from =
      datePreset === "CUSTOM"
        ? parseDateInput(customFrom, false)
        : presetRange.from;
    const to =
      datePreset === "CUSTOM"
        ? parseDateInput(customTo, true) ?? (from ? endOfDay(new Date()) : null)
        : presetRange.to;

    return invoices.filter((inv) => {
      if (!showCancelled && inv.docStatus === "CANCELLED") return false;
      if (!matchesDocKind(inv, docKind)) return false;
      if (from || to) {
        const created = new Date(inv.createdAt).getTime();
        if (from && created < from.getTime()) return false;
        if (to && created > to.getTime()) return false;
      }
      if (!q) return true;
      const haystack = [
        inv.faturaNo ?? "",
        inv.invoiceNo ?? "",
        inv.uuid ?? "",
        inv.customerName,
        inv.customerVkn,
      ]
        .join(" ")
        .toLocaleLowerCase("tr-TR");
      return haystack.includes(q);
    });
  }, [
    invoices,
    query,
    showCancelled,
    docKind,
    datePreset,
    customFrom,
    customTo,
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-500" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Fatura no veya müşteri ara…"
              className="pl-9"
              aria-label="Fatura ara"
            />
          </div>
          <span
            role="button"
            tabIndex={0}
            onClick={() => setDetailedOpen((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setDetailedOpen((v) => !v);
              }
            }}
            className={cn(
              "shrink-0 cursor-pointer select-none text-sm underline-offset-4 hover:underline",
              detailedOpen
                ? "text-blue-300"
                : "text-zinc-400 hover:text-zinc-200",
            )}
          >
            Detaylı arama
          </span>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-3 text-sm text-zinc-300">
          <span>İptalleri göster</span>
          <button
            type="button"
            role="switch"
            aria-checked={showCancelled}
            onClick={() => setShowCancelled((v) => !v)}
            className={cn(
              "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
              showCancelled
                ? "border-blue-400 bg-blue-600"
                : "border-zinc-600 bg-zinc-800",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 left-0.5 size-5 rounded-full bg-white transition-transform",
                showCancelled ? "translate-x-5" : "translate-x-0",
              )}
            />
          </button>
        </label>
      </div>

      {detailedOpen ? (
        <div className="grid gap-4 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="invoice-doc-kind">Belge tipi</Label>
            <Select
              id="invoice-doc-kind"
              value={docKind}
              onChange={(e) => setDocKind(e.target.value as DocKind)}
            >
              <option value="ALL">Tüm belge tipleri</option>
              <option value="DRAFT">Taslak</option>
              <option value="DESPATCH">e-İrsaliye</option>
              <option value="INVOICED">Faturalaşmış</option>
              <option value="FAILED">Hata</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="invoice-date-preset">Tarih</Label>
            <Select
              id="invoice-date-preset"
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as DatePreset)}
            >
              <option value="ALL">Tamamını göster</option>
              <option value="TODAY">Bugün</option>
              <option value="THIS_MONTH">Bu ay</option>
              <option value="LAST_MONTH">Geçen ay</option>
              <option value="LAST_1_MONTH">Son 1 ay</option>
              <option value="LAST_3_MONTHS">Son 3 ay</option>
              <option value="THIS_YEAR">Bu yılın satışlarını göster</option>
              <option value="CUSTOM">Tarih aralığı</option>
            </Select>
          </div>
          {datePreset === "CUSTOM" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="invoice-date-from">Başlangıç</Label>
                <Input
                  id="invoice-date-from"
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invoice-date-to">Bitiş (opsiyonel)</Label>
                <Input
                  id="invoice-date-to"
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tarih</TableHead>
            <TableHead>No</TableHead>
            <TableHead>Sağlayıcı</TableHead>
            <TableHead>Durum</TableHead>
            <TableHead>Müşteri</TableHead>
            <TableHead>Kalem</TableHead>
            <TableHead>Net (≈)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-zinc-500">
                Henüz fatura yok.
              </TableCell>
            </TableRow>
          ) : filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-zinc-500">
                Eşleşen fatura bulunamadı.
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((inv) => (
              <TableRow key={inv.id} className="group">
                <TableCell className="whitespace-nowrap text-zinc-400">
                  <Link
                    href={`/dashboard/invoices/${inv.id}`}
                    className="block hover:text-zinc-200"
                  >
                    {new Date(inv.createdAt).toLocaleString("tr-TR")}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-blue-300">
                  <Link
                    href={`/dashboard/invoices/${inv.id}`}
                    className="block hover:underline"
                  >
                    <div>{inv.faturaNo || inv.invoiceNo || "—"}</div>
                    {inv.uuid ? (
                      <div className="mt-0.5 max-w-[140px] truncate text-[10px] text-zinc-600">
                        {inv.uuid}
                      </div>
                    ) : null}
                  </Link>
                </TableCell>
                <TableCell className="text-xs text-zinc-300">
                  {inv.eDocumentProvider ? (
                    <span>{inv.eDocumentProvider}</span>
                  ) : inv.bizimHesapGuid ? (
                    <span className="text-zinc-500">Bizim Hesap</span>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  <Link href={`/dashboard/invoices/${inv.id}`}>
                    <span className={statusClass(inv.docStatus)}>
                      {listStatusLabel(inv)}
                    </span>
                    {inv.lastError ? (
                      <p className="mt-1 max-w-[160px] text-[10px] text-red-400/80">
                        {inv.lastError}
                      </p>
                    ) : null}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={`/dashboard/invoices/${inv.id}`}>
                    <p className="text-white">{inv.customerName}</p>
                    <p className="font-mono text-xs text-zinc-500">
                      {inv.customerVkn}
                    </p>
                  </Link>
                </TableCell>
                <TableCell className="font-mono">{inv.itemCount}</TableCell>
                <TableCell className="tabular-nums">
                  {inv.docStatus === "DESPATCHED" && !inv.documentType
                    ? "0,00 ₺"
                    : `${Number(inv.netApprox).toLocaleString("tr-TR")} ₺`}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
