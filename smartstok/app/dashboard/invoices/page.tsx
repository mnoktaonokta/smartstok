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
            Bizim Hesap’a aktarılan satış faturaları.
          </p>
        </div>
        {canMutate ? (
          <Link
            href="/dashboard/invoices/new"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-blue-600 px-5 text-sm font-medium text-white shadow-[0_0_20px_rgba(37,99,235,0.35)] transition-colors hover:bg-blue-500"
          >
            <Plus className="size-4" />
            Yeni Fatura
          </Link>
        ) : null}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tarih</TableHead>
            <TableHead>Fatura No</TableHead>
            <TableHead>Müşteri</TableHead>
            <TableHead>Kalem</TableHead>
            <TableHead>Net (≈)</TableHead>
            <TableHead>PDF</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-10 text-center text-zinc-500">
                Henüz fatura yok.
              </TableCell>
            </TableRow>
          ) : (
            invoices.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="whitespace-nowrap text-zinc-400">
                  {new Date(inv.createdAt).toLocaleString("tr-TR")}
                </TableCell>
                <TableCell className="font-mono text-blue-300">
                  {inv.invoiceNo ?? "—"}
                </TableCell>
                <TableCell>
                  <p className="text-white">{inv.customerName}</p>
                  <p className="font-mono text-xs text-zinc-500">
                    {inv.customerVkn}
                  </p>
                </TableCell>
                <TableCell className="font-mono">{inv.itemCount}</TableCell>
                <TableCell className="tabular-nums">
                  {Number(inv.netApprox).toLocaleString("tr-TR")} ₺
                </TableCell>
                <TableCell>
                  {inv.bizimHesapUrl ? (
                    <a
                      href={inv.bizimHesapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-300 transition-colors hover:bg-blue-500/20"
                    >
                      PDF Görüntüle
                    </a>
                  ) : (
                    <span className="text-xs text-zinc-600">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
