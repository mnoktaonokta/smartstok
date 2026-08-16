"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Loader2, Pencil } from "lucide-react";
import {
  cancelEArchiveInvoiceAction,
  finalizeEDocumentInvoiceAction,
  issueDespatchAction,
} from "@/lib/actions/edocument-invoices";
import { InvoiceFetchPdfButton } from "@/components/invoices/invoice-fetch-pdf-button";
import { InvoiceRefreshStatusButton } from "@/components/invoices/invoice-refresh-status-button";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const TAX_RATE = 10;

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function formatTry(n: number) {
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export type InvoiceDetailView = {
  id: string;
  invoiceNo: string | null;
  faturaNo: string | null;
  note: string | null;
  docStatus: string;
  documentType: string | null;
  eDocumentProvider: string | null;
  uuid: string | null;
  belgeOid: string | null;
  despatchUuid: string | null;
  despatchNo: string | null;
  despatchedAt: string | null;
  externalViewUrl: string | null;
  lastError: string | null;
  createdAt: string;
  customerName: string;
  customerVkn: string;
  bizimHesapGuid: string | null;
  bizimHesapUrl: string | null;
  lines: Array<{
    productName: string;
    lotNumber: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    lineTotal: number;
  }>;
  netApprox: number;
  canShowPdf: boolean;
  hasExternalPdf: boolean;
  hasDespatchPdf: boolean;
  itemCount: number;
  cancelEligibility: { canCancel: boolean; reason: string };
};

function statusHeadline(inv: InvoiceDetailView) {
  if (inv.bizimHesapGuid) return "Bizim Hesap";
  switch (inv.docStatus) {
    case "DRAFT":
      return "Taslak";
    case "DESPATCHED":
      return "e-İrsaliye kesildi";
    case "COMPLETED":
    case "SENT":
      if (inv.documentType === "EINVOICE") return "Faturalaşmış (E-Fatura)";
      if (inv.documentType === "EARCHIVE") return "Faturalaşmış (E-Arşiv)";
      return "Faturalaşmış";
    case "PROCESSING":
      return "e-Fatura işleniyor";
    case "FAILED":
      return "Hata";
    case "CANCELLED":
      return "İptal edildi";
    default:
      return inv.docStatus;
  }
}

export function InvoiceDetailActions({
  invoice,
  canMutate,
}: {
  invoice: InvoiceDetailView;
  canMutate: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isDraft = invoice.docStatus === "DRAFT";
  const canDespatch = canMutate && isDraft && !invoice.bizimHesapGuid;
  const canFinalize =
    canMutate &&
    !invoice.bizimHesapGuid &&
    (invoice.docStatus === "DRAFT" || invoice.docStatus === "DESPATCHED");
  const showPrices =
    invoice.docStatus !== "DESPATCHED" || Boolean(invoice.documentType);

  const summary = useMemo(() => {
    const quantityTotal = invoice.lines.reduce((s, l) => s + l.quantity, 0);
    const grossTotal = round2(
      invoice.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0),
    );
    const totalDiscount = round2(
      invoice.lines.reduce((s, l) => s + l.discount, 0),
    );
    const netTotal = round2(
      Math.max(
        0,
        invoice.lines.reduce((s, l) => s + l.lineTotal, 0),
      ),
    );
    const taxTotal = round2(netTotal * (TAX_RATE / 100));
    const grandTotal = round2(netTotal + taxTotal);
    return {
      quantityTotal,
      grossTotal,
      totalDiscount,
      netTotal,
      taxTotal,
      grandTotal,
      taxRate: TAX_RATE,
    };
  }, [invoice.lines]);

  function runDespatch() {
    if (
      !window.confirm(
        "e-İrsaliye kesilecek (fiyatsız). Stok zaten rezerve; ek düşüş yok. Devam?",
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await issueDespatchAction(invoice.id);
      if (r.error) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  function runFinalize() {
    if (
      !window.confirm(
        "e-Fatura veya e-Arşiv kesilecek (mükellef durumuna göre). Devam?",
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await finalizeEDocumentInvoiceAction(invoice.id);
      if (r.error) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  function runCancel() {
    if (!invoice.cancelEligibility.canCancel) return;
    if (
      !window.confirm(
        "Bu e-Arşiv fatura entegratörde iptal edilecek ve stok tekrar müsait işaretlenecek. Devam?",
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await cancelEArchiveInvoiceAction(invoice.id);
      if (r.error) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs tracking-[0.25em] text-blue-400 uppercase">
            Fatura detay
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">
            {statusHeadline(invoice)}
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            {invoice.customerName} · {invoice.customerVkn}
          </p>
          <p className="mt-1 font-mono text-xs text-zinc-500">
            {invoice.faturaNo || invoice.invoiceNo || invoice.id}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/invoices"
            className="inline-flex h-10 items-center rounded-md border border-zinc-700 px-4 text-sm text-zinc-300 hover:bg-zinc-900"
          >
            Listeye dön
          </Link>
          {canMutate && isDraft && !invoice.bizimHesapGuid ? (
            <Link
              href={`/dashboard/invoices/${invoice.id}/edit`}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-zinc-100 px-4 text-sm font-medium text-zinc-900 hover:bg-white"
            >
              <Pencil className="size-4" />
              Düzenle
            </Link>
          ) : null}
          {canMutate &&
          invoice.documentType === "EARCHIVE" &&
          invoice.docStatus !== "DRAFT" ? (
            <Button
              type="button"
              variant="outline"
              disabled={isPending || !invoice.cancelEligibility.canCancel}
              title={invoice.cancelEligibility.reason}
              onClick={runCancel}
            >
              {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              İptal
            </Button>
          ) : null}
        </div>
      </div>

      {invoice.lastError ? (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {invoice.lastError}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      {canMutate &&
      (invoice.documentType === "EARCHIVE" ||
        invoice.documentType === "EINVOICE") &&
      invoice.docStatus !== "DRAFT" &&
      invoice.docStatus !== "CANCELLED" ? (
        <p
          className={
            invoice.cancelEligibility.canCancel
              ? "text-xs text-emerald-300/90"
              : "text-xs text-zinc-500"
          }
        >
          {invoice.cancelEligibility.reason}
        </p>
      ) : null}

      <div className="grid gap-3 text-sm text-zinc-400 sm:grid-cols-2">
        <p>
          Tarih:{" "}
          <span className="text-zinc-200">
            {new Date(invoice.createdAt).toLocaleString("tr-TR")}
          </span>
        </p>
        {invoice.despatchedAt ? (
          <p>
            e-İrsaliye:{" "}
            <span className="text-zinc-200">
              {new Date(invoice.despatchedAt).toLocaleString("tr-TR")}
            </span>
          </p>
        ) : null}
        {invoice.despatchNo ? (
          <p className="font-mono text-xs sm:col-span-2">
            İrsaliye No: {invoice.despatchNo}
          </p>
        ) : null}
        {invoice.despatchUuid ? (
          <p className="font-mono text-xs sm:col-span-2">
            İrsaliye UUID: {invoice.despatchUuid}
          </p>
        ) : null}
        {invoice.uuid ? (
          <p className="font-mono text-xs sm:col-span-2">
            Fatura UUID: {invoice.uuid}
          </p>
        ) : null}
        {invoice.note ? (
          <p className="sm:col-span-2">
            Not: <span className="text-zinc-200">{invoice.note}</span>
          </p>
        ) : null}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ürün</TableHead>
            <TableHead>Lot</TableHead>
            <TableHead className="text-right">Adet</TableHead>
            {showPrices ? (
              <>
                <TableHead className="text-right">Birim</TableHead>
                <TableHead className="text-right">İskonto</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </>
            ) : (
              <TableHead className="text-right">Tutar</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoice.lines.map((line) => (
            <TableRow key={`${line.productName}-${line.lotNumber}`}>
              <TableCell className="text-zinc-100">{line.productName}</TableCell>
              <TableCell className="font-mono text-xs text-zinc-400">
                {line.lotNumber}
              </TableCell>
              <TableCell className="text-right font-mono">
                {line.quantity}
              </TableCell>
              {showPrices ? (
                <>
                  <TableCell className="text-right font-mono">
                    {line.unitPrice.toLocaleString("tr-TR", {
                      minimumFractionDigits: 2,
                    })}
                  </TableCell>
                  <TableCell className="text-right font-mono text-amber-300/90">
                    {line.discount.toLocaleString("tr-TR", {
                      minimumFractionDigits: 2,
                    })}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {line.lineTotal.toLocaleString("tr-TR", {
                      minimumFractionDigits: 2,
                    })}
                  </TableCell>
                </>
              ) : (
                <TableCell className="text-right font-mono text-zinc-500">
                  0,00
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {showPrices ? (
        <div className="ml-auto w-full max-w-sm rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
          <h3 className="mb-3 text-sm font-medium text-blue-200">
            Finansal Özet
          </h3>
          <dl className="space-y-2 text-sm">
            <SummaryRow
              label="Toplam Miktar"
              value={`${summary.quantityTotal} adet`}
            />
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
      ) : (
        <p className="text-sm text-zinc-500">
          e-İrsaliye görünümü: yalnızca ürün ve adet (tutar 0,00).
        </p>
      )}

      {(canDespatch || canFinalize) && (
        <div className="flex flex-wrap gap-3 border-t border-zinc-800 pt-6">
          {canDespatch ? (
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={runDespatch}
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              E-İrsaliye
            </Button>
          ) : null}
          {canFinalize ? (
            <Button type="button" disabled={isPending} onClick={runFinalize}>
              {isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Fatura
            </Button>
          ) : null}
        </div>
      )}

      {invoice.despatchUuid ? (
        <div className="flex flex-wrap gap-2 border-t border-zinc-800 pt-6">
          <a
            href={`/dashboard/invoices/${invoice.id}/despatch-print`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-300"
          >
            e-İrsaliye yazdır
          </a>
          <a
            href={`/api/invoices/${invoice.id}/despatch-pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-300"
          >
            e-İrsaliye PDF
          </a>
        </div>
      ) : null}

      {(invoice.documentType === "EARCHIVE" ||
        invoice.documentType === "EINVOICE") &&
      (invoice.docStatus === "COMPLETED" ||
        invoice.docStatus === "PROCESSING" ||
        invoice.docStatus === "SENT" ||
        invoice.docStatus === "FAILED") ? (
        <div className="flex flex-wrap gap-2 border-t border-zinc-800 pt-6">
          {invoice.externalViewUrl ? (
            <a
              href={invoice.externalViewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-300"
            >
              Harici PDF
            </a>
          ) : null}
          <a
            href={`/api/invoices/${invoice.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-300"
          >
            Fatura PDF
          </a>
          {canMutate && invoice.eDocumentProvider ? (
            <InvoiceFetchPdfButton invoiceId={invoice.id} />
          ) : null}
          {canMutate &&
          invoice.documentType === "EINVOICE" &&
          (invoice.docStatus === "PROCESSING" ||
            invoice.docStatus === "SENT") ? (
            <InvoiceRefreshStatusButton invoiceId={invoice.id} />
          ) : null}
        </div>
      ) : invoice.bizimHesapUrl ? (
        <a
          href={invoice.bizimHesapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-300"
        >
          Bizim Hesap PDF
        </a>
      ) : null}
    </div>
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
