"use client";

import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import type { DepotInventoryRow } from "@/lib/actions/depots";
import type { DepotMovementRow } from "@/lib/actions/transfers";
import type { FailIntakeListItem } from "@/lib/fail/types";
import { DepotInventoryTable } from "@/components/depots/depot-inventory-table";
import { CustomerFailImplantPanel } from "@/components/fail/customer-fail-implant-panel";
import { MovementBadge, Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type HistoryEntry =
  | { kind: "transfer"; at: number; row: DepotMovementRow }
  | { kind: "fail"; at: number; intake: FailIntakeListItem };

export function DepotDetailTabs({
  depotName,
  customerName,
  inventoryRows,
  movements,
  failIntakes,
  showFailTab,
}: {
  depotName: string;
  customerName: string | null;
  inventoryRows: DepotInventoryRow[];
  movements: DepotMovementRow[];
  failIntakes: FailIntakeListItem[];
  showFailTab: boolean;
}) {
  const [tab, setTab] = useState("stock");
  const [printedAt, setPrintedAt] = useState<string | null>(null);

  function handlePrint() {
    setTab("stock");
    setPrintedAt(new Date().toLocaleString("tr-TR"));
    requestAnimationFrame(() => {
      window.print();
    });
  }

  const tabs = [
    { id: "stock", label: "Mevcut Stoklar" },
    ...(showFailTab ? [{ id: "fail", label: "Fail Yönetimi" }] : []),
    { id: "history", label: "Hareket Geçmişi" },
  ];

  const historyFeed = useMemo(() => {
    const entries: HistoryEntry[] = [
      ...movements.map((row) => ({
        kind: "transfer" as const,
        at: new Date(row.createdAt).getTime(),
        row,
      })),
      ...(showFailTab
        ? failIntakes.map((intake) => ({
            kind: "fail" as const,
            at: new Date(intake.createdAt).getTime(),
            intake,
          }))
        : []),
    ];
    return entries.sort((a, b) => b.at - a.at);
  }, [movements, failIntakes, showFailTab]);

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
        {tab !== "fail" ? (
          <Button type="button" variant="outline" onClick={handlePrint}>
            <Printer className="size-4" />
            Yazdır
          </Button>
        ) : null}
      </div>

      {tab === "stock" ? (
        <>
          <div className="print-only mb-6 hidden">
            <h1 className="text-2xl font-bold text-black">{depotName}</h1>
            {customerName ? (
              <p className="text-sm text-black/70">{customerName}</p>
            ) : null}
            <p className="mt-1 text-xs text-black/50">
              Envanter dökümü
              {printedAt ? ` · ${printedAt}` : null}
            </p>
          </div>

          <div className="no-print">
            <DepotInventoryTable rows={inventoryRows} />
          </div>

          <div className="print-area print-only hidden">
            <table className="print-table w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th>Ürün Adı</th>
                  <th>Referans</th>
                  <th>Lot</th>
                  <th className="text-right">Adet</th>
                </tr>
              </thead>
              <tbody>
                {inventoryRows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.productName}</td>
                    <td>{row.referenceCode}</td>
                    <td>{row.lotNumber}</td>
                    <td className="text-right">{row.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-8 text-xs text-black/50">
              Kontrol: _______________ &nbsp;&nbsp; İmza: _______________
            </p>
          </div>
        </>
      ) : null}

      {tab === "fail" && showFailTab ? (
        <div className="no-print">
          <CustomerFailImplantPanel intakes={failIntakes} />
        </div>
      ) : null}

      {tab === "history" ? (
        <div className="no-print space-y-3">
          {historyFeed.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
              Bu depo için hareket kaydı yok.
            </div>
          ) : (
            <ul className="space-y-3">
              {historyFeed.map((entry) =>
                entry.kind === "fail" ? (
                  <FailHistoryCard
                    key={`fail-${entry.intake.id}`}
                    intake={entry.intake}
                  />
                ) : (
                  <TransferHistoryCard
                    key={`tr-${entry.row.key}`}
                    row={entry.row}
                  />
                ),
              )}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function FailHistoryCard({ intake }: { intake: FailIntakeListItem }) {
  const givenText =
    intake.givenProducts.length === 0
      ? "ürün verilmedi"
      : intake.givenProducts
          .map(
            (p) =>
              `${p.referenceCode} ${p.productName} × ${p.quantity}${
                p.disposition === "CONSIGNMENT_EXCESS" ? " (konsinye)" : ""
              }`,
          )
          .join(", ");

  return (
    <li className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
            "bg-amber-500/15 text-amber-800 ring-1 ring-amber-500/30 dark:text-amber-200",
          )}
        >
          Fail
        </span>
        <span className="text-xs text-muted-foreground">
          {new Date(intake.createdAt).toLocaleString("tr-TR")}
        </span>
      </div>
      <p className="mt-2 text-sm text-foreground">
        <span className="font-mono font-semibold">{intake.failCount}</span> fail
        alındı
        {intake.creditQuantity > 0 ? (
          <>
            {" "}
            · Alacak:{" "}
            <span className="font-mono text-blue-600 dark:text-blue-400">
              {intake.creditQuantity}
            </span>
          </>
        ) : null}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Karşılığında verilenler:{" "}
        <span className="text-foreground">{givenText}</span>
      </p>
      {intake.createdByName ? (
        <p className="mt-1 text-xs text-muted-foreground">
          İşleyen: {intake.createdByName}
        </p>
      ) : null}
    </li>
  );
}

function TransferHistoryCard({ row }: { row: DepotMovementRow }) {
  const counterpart = row.direction === "IN" ? row.fromName : row.toName;
  return (
    <li className="rounded-2xl border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <MovementBadge direction={row.direction} />
        <span className="text-xs text-muted-foreground">
          {new Date(row.createdAt).toLocaleString("tr-TR")}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm text-foreground">
            {row.referenceCode} {row.productName}
          </p>
          <p className="font-mono text-xs text-blue-600 dark:text-blue-300">
            Lot {row.lotNumber}
          </p>
        </div>
        <span className="font-mono text-lg text-blue-700 dark:text-blue-200">
          {row.quantity}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Karşı depo: {counterpart}
        {" · "}
        İşleyen: {row.executedByName}
        {row.requestedByName ? ` · Talep: ${row.requestedByName}` : ""}
      </p>
    </li>
  );
}
