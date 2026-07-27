import { listDepotsAction } from "@/lib/actions/depots";
import { DepotsTable } from "@/components/depots/depots-table";

export default async function DepotsPage() {
  const depots = await listDepotsAction();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="font-mono text-xs tracking-[0.25em] text-blue-400 uppercase">
          Envanter
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Depolar</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Merkez ve konsinye depolarının anlık stok özeti. Detay için depoya
          tıklayın.
        </p>
      </div>

      <DepotsTable depots={depots} />
    </div>
  );
}
