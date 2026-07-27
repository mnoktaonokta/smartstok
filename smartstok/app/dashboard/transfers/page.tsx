import { auth } from "@/auth";
import { getTransferPageDataAction } from "@/lib/actions/transfers";
import { canMutateData } from "@/lib/roles";
import { TransfersWorkspace } from "@/components/transfers/transfers-workspace";

export default async function TransfersPage() {
  const session = await auth();
  const data = await getTransferPageDataAction();
  const canMutate = canMutateData(session?.user?.roles);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="font-mono text-xs tracking-[0.25em] text-blue-400 uppercase">
          Stok
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Transferler</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Klasik lot seçimi veya barkodlu hızlı iade sepeti.
        </p>
      </div>

      <TransfersWorkspace data={data} canMutate={canMutate} />
    </div>
  );
}
