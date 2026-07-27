"use client";

import type { DepotInventoryRow } from "@/lib/actions/depots";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

export function DepotInventoryTable({ rows }: { rows: DepotInventoryRow[] }) {
  const columns: DataTableColumn<DepotInventoryRow>[] = [
    {
      id: "label",
      header: "Envanter",
      searchableText: (r) =>
        `${r.label} ${r.referenceCode} ${r.brand} ${r.lotNumber}`,
      cell: (r) => (
        <div>
          <p className="font-medium text-white">{r.label}</p>
          <p className="text-xs text-zinc-500">
            {r.referenceCode} · {r.brand}
          </p>
        </div>
      ),
    },
    {
      id: "lot",
      header: "Lot",
      searchableText: (r) => r.lotNumber,
      cell: (r) => (
        <span className="font-mono text-blue-300">{r.lotNumber}</span>
      ),
    },
    {
      id: "qty",
      header: "Adet",
      className: "text-right",
      cell: (r) => (
        <span className="font-mono text-lg text-blue-200">{r.quantity}</span>
      ),
    },
  ];

  return (
    <DataTable
      data={rows}
      columns={columns}
      getRowId={(r) => r.key}
      searchPlaceholder="Ürün veya lot ara…"
      emptyMessage="Bu depoda müsait stok yok."
      pageSize={15}
    />
  );
}
