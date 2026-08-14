import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import {
  getCustomerDetailAction,
  listSahaRepsAction,
} from "@/lib/actions/customers";
import {
  getCustomerConsignmentSummaryAction,
  listTasksAction,
  listVisitsAction,
} from "@/lib/actions/crm";
import { canMutateData, hasRole } from "@/lib/roles";
import { AssignedRepBadge } from "@/components/customers/assigned-rep-badge";
import { CustomerDetailTabs } from "@/components/customers/customer-detail-tabs";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;
  const customer = await getCustomerDetailAction(id);

  if (!customer) {
    notFound();
  }

  const isAdmin = hasRole(session?.user?.roles, "ADMIN");
  const [consignment, visits, tasks, reps] = await Promise.all([
    getCustomerConsignmentSummaryAction(id),
    listVisitsAction(id),
    listTasksAction(id),
    isAdmin ? listSahaRepsAction() : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link
          href="/dashboard/customers"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-blue-300"
        >
          <ArrowLeft className="size-4" />
          Müşterilere dön
        </Link>
        <p className="font-mono text-xs tracking-[0.25em] text-blue-400 uppercase">
          Klinik
        </p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-3xl font-semibold text-white">{customer.name}</h1>
          <AssignedRepBadge
            customerId={customer.id}
            assignedUser={customer.assignedUser}
            canEdit={isAdmin}
            reps={reps}
          />
        </div>
        <p className="mt-2 text-sm text-zinc-400">
          VKN {customer.vknTckn}
          {customer.isPublicEntity
            ? ` · Kamu · Harcama birimi: ${customer.spendingUnitVkn ?? "—"}`
            : ""}
          {customer.bizimHesapId
            ? ` · Bizim Hesap: ${customer.bizimHesapId}`
            : " · Bizim Hesap cari kodu tanımlı değil"}
        </p>
      </div>

      <CustomerDetailTabs
        customer={{
          id: customer.id,
          name: customer.name,
          vknTckn: customer.vknTckn,
          taxOffice: customer.taxOffice,
          address: customer.address,
          phone: customer.phone,
          bizimHesapId: customer.bizimHesapId,
          invoiceCount: customer._count.invoices,
          locations: customer.locations.map((l) => ({
            id: l.id,
            name: l.name,
          })),
        }}
        consignment={consignment}
        visits={visits}
        tasks={tasks}
        canMutate={canMutateData(session?.user?.roles)}
      />
    </div>
  );
}
