import { auth } from "@/auth";
import { listInventoryCountsAction } from "@/lib/actions/inventory-count";
import {
  canAccessInboundReceipt,
  canMutateData,
  hasRole,
} from "@/lib/roles";
import { InventoryCountList } from "@/components/inventory-count/inventory-count-list";
import { redirect } from "next/navigation";

export default async function SayimPage() {
  const session = await auth();
  const roles = session?.user?.roles;

  if (
    !canAccessInboundReceipt(roles) &&
    !hasRole(roles, "OBSERVER")
  ) {
    redirect("/dashboard/unauthorized");
  }

  const result = await listInventoryCountsAction();
  const canMutate = canMutateData(roles) && canAccessInboundReceipt(roles);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="font-mono text-xs tracking-[0.25em] text-blue-400 uppercase">
          Stok
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Stok Sayımı</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Merkez depo envanter sayımı — taslak kaydet veya stokları güncelle.
        </p>
      </div>

      {result.error ? (
        <p className="text-sm text-red-300">{result.error}</p>
      ) : (
        <InventoryCountList
          counts={result.counts ?? []}
          canMutate={canMutate}
        />
      )}
    </div>
  );
}
