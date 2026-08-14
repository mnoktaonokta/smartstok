import Link from "next/link";
import { Plus } from "lucide-react";
import { auth } from "@/auth";
import { listInvoicesAction } from "@/lib/actions/invoices";
import { canMutateData } from "@/lib/roles";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function listStatusLabel(inv: {
  docStatus: string | null;
  documentType: string | null;
  bizimHesapGuid: string | null;
}) {
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
    default:
      return inv.docStatus ?? "—";
  }
}

export default async function InvoicesPage() {
  const session = await auth();
  const canMutate = canMutateData(session?.user?.roles);
  const invoices = await listInvoicesAction();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs tracking-[0.25em] text-blue-400 uppercase">
            Muhasebe
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Faturalar</h1>
          <p className="mt-2 text-sm text-zinc-400">
            E-belge taslakları, e-irsaliye ve faturalaşmış belgeler; Bizim Hesap
            arşivi.
          </p>
        </div>
        {canMutate ? (
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/e-belge-fatura"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-blue-600 px-5 text-sm font-medium text-white shadow-[0_0_20px_rgba(37,99,235,0.35)] transition-colors hover:bg-blue-500"
            >
              <Plus className="size-4" />
              E-belge fatura
            </Link>
            <Link
              href="/dashboard/invoices/new"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-zinc-700 px-5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-900"
            >
              Bizim Hesap
            </Link>
          </div>
        ) : null}
      </div>

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
          ) : (
            invoices.map((inv) => (
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
                    <span
                      className={
                        inv.docStatus === "FAILED"
                          ? "text-red-400"
                          : inv.docStatus === "COMPLETED" ||
                              inv.docStatus === "SENT"
                            ? "text-emerald-400"
                            : inv.docStatus === "DESPATCHED"
                              ? "text-sky-300"
                              : inv.docStatus === "DRAFT"
                                ? "text-amber-300"
                                : inv.docStatus === "PROCESSING"
                                  ? "text-amber-300"
                                  : "text-zinc-400"
                      }
                    >
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
