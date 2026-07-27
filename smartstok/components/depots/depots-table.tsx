"use client";

import Link from "next/link";
import type { DepotSummary } from "@/lib/actions/depots";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Warehouse } from "lucide-react";

export function DepotsTable({ depots }: { depots: DepotSummary[] }) {
  const columns: DataTableColumn<DepotSummary>[] = [
    {
      id: "name",
      header: "Depo",
      searchableText: (r) => `${r.name} ${r.customerName ?? ""}`,
      cell: (r) => (
        <Link
          href={`/dashboard/depots/${r.id}`}
          className="group flex items-start gap-3"
        >
          <Warehouse className="mt-0.5 size-4 shrink-0 text-blue-400" />
          <span>
            <span className="block font-medium text-white group-hover:text-blue-200">
              {r.name}
            </span>
            {r.customerName ? (
              <span className="text-xs text-zinc-500">{r.customerName}</span>
            ) : null}
          </span>
        </Link>
      ),
    },
    {
      id: "type",
      header: "Tip",
      searchableText: (r) => r.type,
      cell: (r) => (
        <span className="font-mono text-xs text-blue-300">
          {r.type === "MAIN_DEPOT" ? "MERKEZ" : "KONSİNYE"}
        </span>
      ),
    },
    {
      id: "products",
      header: "Ürün Çeşidi",
      className: "text-right",
      cell: (r) => <span className="tabular-nums">{r.productCount}</span>,
    },
    {
      id: "total",
      header: "Toplam Adet",
      className: "text-right",
      cell: (r) => (
        <span className="font-mono text-blue-300">{r.totalItems}</span>
      ),
    },
  ];

  return (
    <DataTable
      data={depots}
      columns={columns}
      getRowId={(r) => r.id}
      searchPlaceholder="Depo veya klinik ara…"
      emptyMessage="Henüz depo kaydı yok."
    />
  );
}
