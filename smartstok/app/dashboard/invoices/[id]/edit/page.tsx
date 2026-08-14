import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { getDraftInvoiceForEditAction } from "@/lib/actions/edocument-invoices";
import { getInvoiceFormDataAction } from "@/lib/actions/invoices";
import { canMutateData } from "@/lib/roles";
import { NewInvoiceForm } from "@/components/invoices/new-invoice-form";

export default async function InvoiceEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!canMutateData(session?.user?.roles)) {
    redirect("/dashboard/invoices");
  }

  const { id } = await params;
  const [draftResult, formData] = await Promise.all([
    getDraftInvoiceForEditAction(id),
    getInvoiceFormDataAction(),
  ]);

  if (draftResult.error || !draftResult.draft) {
    notFound();
  }

  const draft = draftResult.draft;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link
          href={`/dashboard/invoices/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-blue-300"
        >
          <ArrowLeft className="size-4" />
          Taslak detay
        </Link>
        <h1 className="mt-3 text-3xl font-semibold text-white">
          Taslak düzenle
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Değişiklikler kaydedilince stok rezervasyonu güncellenir.
        </p>
      </div>

      <NewInvoiceForm
        customers={formData.customers}
        mode="edocument"
        draftId={draft.id}
        initialDraft={{
          customerId: draft.customerId,
          locationId: draft.locationId,
          note: draft.note,
          lines: draft.lines,
        }}
      />
    </div>
  );
}
