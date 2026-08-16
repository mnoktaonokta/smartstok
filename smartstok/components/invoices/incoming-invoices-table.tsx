"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { FileDown, Loader2, Search } from "lucide-react";
import {
  listIncomingInvoicesAction,
  respondIncomingInvoiceAction,
} from "@/lib/actions/incoming-invoices";
import {
  incomingResponseEligibility,
  isTemelProfile,
} from "@/lib/services/edocument/incoming-invoice";
import type { IncomingInvoice } from "@/lib/services/edocument/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function profileLabel(profileId: string | null) {
  const p = (profileId ?? "").toUpperCase();
  if (p.includes("TICARI")) return "Ticari";
  if (p.includes("TEMEL")) return "Temel";
  return profileId || "—";
}

function statusLabel(inv: IncomingInvoice) {
  if (isTemelProfile(inv.profileId) && inv.appStatus === "NONE") {
    return "Yanıt yok (Temel)";
  }
  switch (inv.appStatus) {
    case "ACCEPTED":
      return "Kabul";
    case "REJECTED":
      return "Red";
    case "AUTO_ACCEPTED":
      return "Otomatik kabul";
    case "NOT_APPLICABLE":
      return "Yanıt yok (Temel)";
    default:
      return "Yanıt bekliyor";
  }
}

function statusClass(inv: IncomingInvoice) {
  switch (inv.appStatus) {
    case "ACCEPTED":
    case "AUTO_ACCEPTED":
      return "text-emerald-400";
    case "REJECTED":
      return "text-red-400";
    case "NOT_APPLICABLE":
      return "text-zinc-500";
    default:
      return "text-amber-300";
  }
}

function formatAmount(value: string | null, currency: string | null) {
  if (!value) return "—";
  const n = Number(String(value).replace(/\s/g, "").replace(",", "."));
  if (Number.isNaN(n)) return `${value} ${currency ?? ""}`.trim();
  return `${n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency === "TRY" || !currency ? "₺" : currency}`;
}

export function IncomingInvoicesTable({ canMutate }: { canMutate: boolean }) {
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(todayIso());
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<IncomingInvoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyUuid, setBusyUuid] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function load() {
    setError(null);
    startTransition(async () => {
      const r = await listIncomingInvoicesAction({ from, to });
      if (r.error) {
        setError(r.error);
        setRows([]);
        return;
      }
      setRows(r.invoices ?? []);
    });
  }

  useEffect(() => {
    load();
    // İlk yükleme — tarih değişince "Listele" ile yenilenir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    if (!q) return rows;
    return rows.filter((inv) =>
      [
        inv.invoiceNo ?? "",
        inv.uuid,
        inv.supplierName ?? "",
        inv.supplierVkn ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(q),
    );
  }, [rows, query]);

  function openPdf(uuid: string) {
    window.open(
      `/api/invoices/incoming-pdf?uuid=${encodeURIComponent(uuid)}`,
      "_blank",
    );
  }

  function respond(inv: IncomingInvoice, decision: "KABUL" | "RED") {
    const eligibility = incomingResponseEligibility(inv);
    if (decision === "KABUL" && !eligibility.canAccept) {
      setError(eligibility.reason);
      return;
    }
    if (decision === "RED" && !eligibility.canReject) {
      setError(eligibility.reason);
      return;
    }

    let description =
      decision === "KABUL" ? "Kabul edilmiştir." : "";
    if (decision === "RED") {
      const typed = window.prompt("Red nedeni (zorunlu):", "");
      if (typed == null) return;
      description = typed.trim();
      if (!description) {
        setError("Red için açıklama zorunlu.");
        return;
      }
    } else if (
      !window.confirm(
        `${inv.invoiceNo || inv.uuid} faturasını kabul etmek istiyor musunuz?`,
      )
    ) {
      return;
    }

    setError(null);
    setBusyUuid(inv.uuid);
    startTransition(async () => {
      const r = await respondIncomingInvoiceAction({
        uuid: inv.uuid,
        decision,
        description,
        alias: inv.gbAlias ?? undefined,
        profileId: inv.profileId,
        appStatus: inv.appStatus,
        issueDate: inv.issueDate,
        receivedAt: inv.receivedAt,
      });
      setBusyUuid(null);
      if (r.error) {
        setError(r.error);
        return;
      }
      const listed = await listIncomingInvoicesAction({ from, to });
      if (listed.error) {
        setError(listed.error);
        return;
      }
      setRows(listed.invoices ?? []);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="incoming-from">Başlangıç</Label>
            <Input
              id="incoming-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="incoming-to">Bitiş</Label>
            <Input
              id="incoming-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={load}
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Listele
            </Button>
          </div>
        </div>
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Fatura no / VKN / unvan…"
            className="pl-9"
            aria-label="Gelen fatura ara"
          />
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tarih</TableHead>
            <TableHead>Satıcı</TableHead>
            <TableHead>No</TableHead>
            <TableHead>Senaryo</TableHead>
            <TableHead>Tutar</TableHead>
            <TableHead>Durum</TableHead>
            <TableHead className="text-right">İşlem</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending && rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-zinc-500">
                Gelen faturalar yükleniyor…
              </TableCell>
            </TableRow>
          ) : filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-zinc-500">
                Bu aralıkta gelen e-Fatura yok.
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((inv) => {
              const eligibility = incomingResponseEligibility(inv);
              const busy = isPending && busyUuid === inv.uuid;
              return (
                <TableRow key={inv.uuid}>
                  <TableCell className="whitespace-nowrap text-zinc-400">
                    {inv.issueDate
                      ? new Date(`${inv.issueDate}T00:00:00`).toLocaleDateString(
                          "tr-TR",
                        )
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <p className="text-white">{inv.supplierName || "—"}</p>
                    <p className="font-mono text-xs text-zinc-500">
                      {inv.supplierVkn || inv.uuid}
                    </p>
                  </TableCell>
                  <TableCell className="font-mono text-blue-300">
                    {inv.invoiceNo || "—"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "text-xs",
                        profileLabel(inv.profileId) === "Ticari"
                          ? "text-sky-300"
                          : "text-zinc-400",
                      )}
                    >
                      {profileLabel(inv.profileId)}
                    </span>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatAmount(inv.payableAmount, inv.currency)}
                  </TableCell>
                  <TableCell>
                    <span className={statusClass(inv)}>{statusLabel(inv)}</span>
                    {eligibility.daysLeft != null &&
                    eligibility.canAccept ? (
                      <p className="mt-0.5 text-[10px] text-zinc-500">
                        {eligibility.daysLeft} gün
                      </p>
                    ) : (
                      <p className="mt-0.5 max-w-[180px] text-[10px] text-zinc-600">
                        {eligibility.reason}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openPdf(inv.uuid)}
                      >
                        <FileDown className="size-3.5" />
                        PDF
                      </Button>
                      {canMutate ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            disabled={busy || !eligibility.canAccept}
                            title={eligibility.reason}
                            onClick={() => respond(inv, "KABUL")}
                          >
                            {busy ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : null}
                            Kabul
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-red-500/40 text-red-300 hover:bg-red-500/10"
                            disabled={busy || !eligibility.canReject}
                            title={eligibility.reason}
                            onClick={() => respond(inv, "RED")}
                          >
                            Red
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
