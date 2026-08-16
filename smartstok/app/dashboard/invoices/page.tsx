import Link from "next/link";
import { Inbox } from "lucide-react";
import { auth } from "@/auth";
import { listInvoicesAction } from "@/lib/actions/invoices";
import { canMutateData } from "@/lib/roles";
import { InvoicesTable } from "@/components/invoices/invoices-table";

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
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/invoices/gelen"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-blue-600 px-5 text-sm font-medium text-white shadow-[0_0_20px_rgba(37,99,235,0.35)] transition-colors hover:bg-blue-500"
          >
            <Inbox className="size-4" />
            Gelen e-Belgeler
          </Link>
          {canMutate ? (
            <Link
              href="/dashboard/invoices/new"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-zinc-700 px-5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-900"
            >
              Bizim Hesap
            </Link>
          ) : null}
        </div>
      </div>

      <InvoicesTable invoices={invoices} />
    </div>
  );
}
