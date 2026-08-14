import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getEDocumentInvoiceDetailAction } from "@/lib/actions/edocument-invoices";
import { canMutateData } from "@/lib/roles";
import { InvoiceDetailActions } from "@/components/invoices/invoice-detail-actions";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const result = await getEDocumentInvoiceDetailAction(id);
  if (result.error || !result.invoice) notFound();

  return (
    <div className="mx-auto max-w-6xl">
      <InvoiceDetailActions
        invoice={result.invoice}
        canMutate={canMutateData(session.user.roles)}
      />
    </div>
  );
}
