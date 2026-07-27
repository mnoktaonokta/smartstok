import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getInvoiceFormDataAction } from "@/lib/actions/invoices";
import { canMutateData } from "@/lib/roles";
import { NewInvoiceForm } from "@/components/invoices/new-invoice-form";

export default async function NewInvoicePage() {
  const session = await auth();
  if (!canMutateData(session?.user?.roles)) {
    redirect("/dashboard/invoices");
  }

  const { customers } = await getInvoiceFormDataAction();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="font-mono text-xs tracking-[0.25em] text-blue-400 uppercase">
          Faturalandırma
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Yeni Fatura</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Klinik deposundaki stokları seçin; Bizim Hesap’a satış faturası
          gönderilir, stoklar kapanır ve ÜTS bekleyenlere düşer.
        </p>
      </div>

      <NewInvoiceForm customers={customers} />
    </div>
  );
}
