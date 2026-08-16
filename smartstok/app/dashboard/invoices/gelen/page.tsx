import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { canAccessPath, canMutateData } from "@/lib/roles";
import { IncomingInvoicesTable } from "@/components/invoices/incoming-invoices-table";

export default async function IncomingDocumentsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!canAccessPath(session.user.roles, "/dashboard/invoices")) {
    redirect("/dashboard/unauthorized");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link
          href="/dashboard/invoices"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200"
        >
          <ArrowLeft className="size-4" />
          Faturalar
        </Link>
        <p className="mt-4 font-mono text-xs tracking-[0.25em] text-blue-400 uppercase">
          Muhasebe
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">
          Gelen e-Belgeler
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Entegratördeki gelen e-Faturalar. Ticari senaryoda 8 gün içinde kabul
          veya red gönderilebilir. Temel faturada uygulama yanıtı yoktur.
        </p>
      </div>

      <IncomingInvoicesTable canMutate={canMutateData(session.user.roles)} />
    </div>
  );
}
