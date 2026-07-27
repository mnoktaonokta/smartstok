import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getDepotInventoryAction } from "@/lib/actions/depots";
import { getDepotMovementsAction } from "@/lib/actions/transfers";
import { DepotDetailTabs } from "@/components/depots/depot-detail-tabs";

export default async function DepotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [{ location, rows }, movements] = await Promise.all([
    getDepotInventoryAction(id),
    getDepotMovementsAction(id),
  ]);

  if (!location) {
    notFound();
  }

  const totalQty = rows.reduce((sum, r) => sum + r.quantity, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="no-print">
        <Link
          href="/dashboard/depots"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-blue-300"
        >
          <ArrowLeft className="size-4" />
          Depolara dön
        </Link>
        <p className="font-mono text-xs tracking-[0.25em] text-blue-400 uppercase">
          {location.type === "MAIN_DEPOT" ? "Merkez Depo" : "Konsinye Depo"}
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">
          {location.name}
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          {location.customerName ? `${location.customerName} · ` : ""}
          {rows.length} kalem · {totalQty} adet müsait stok
        </p>
      </div>

      <DepotDetailTabs
        depotName={location.name}
        customerName={location.customerName}
        inventoryRows={rows}
        movements={movements}
      />
    </div>
  );
}
