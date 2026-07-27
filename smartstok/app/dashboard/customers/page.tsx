import { auth } from "@/auth";
import {
  getCustomersAction,
  listSahaRepsAction,
} from "@/lib/actions/customers";
import {
  canMutateData,
  hasRole,
  isPortfolioScopedSales,
} from "@/lib/roles";
import { AddCustomerDialog } from "@/components/customers/add-customer-dialog";
import { CustomersTable } from "@/components/customers/customers-table";

export default async function CustomersPage() {
  const session = await auth();
  const roles = session?.user?.roles ?? [];
  const canMutate = canMutateData(roles);
  const canDelete = canMutate && hasRole(roles, "ADMIN");
  const showRepSelect = canMutate && !isPortfolioScopedSales(roles);
  const [customers, reps] = await Promise.all([
    getCustomersAction(),
    showRepSelect ? listSahaRepsAction() : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs tracking-[0.25em] text-blue-400 uppercase">
            CRM
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Müşteriler</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Klinik / hekim kayıtları, ziyaret notları ve hatırlatıcılar. Bizim
            Hesap senkronu Admin panelinde.
          </p>
        </div>
        {canMutate ? (
          <AddCustomerDialog showRepSelect={showRepSelect} reps={reps} />
        ) : null}
      </div>

      <CustomersTable
        customers={customers}
        canMutate={canMutate}
        canDelete={canDelete}
      />
    </div>
  );
}
