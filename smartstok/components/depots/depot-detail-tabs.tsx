"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import type { DepotInventoryRow } from "@/lib/actions/depots";
import type { DepotMovementRow } from "@/lib/actions/transfers";
import { DepotInventoryTable } from "@/components/depots/depot-inventory-table";
import { MovementBadge, Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function DepotDetailTabs({
  depotName,
  customerName,
  inventoryRows,
  movements,
}: {
  depotName: string;
  customerName: string | null;
  inventoryRows: DepotInventoryRow[];
  movements: DepotMovementRow[];
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

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          tabs={[
            { id: "stock", label: "Mevcut Stoklar" },
            { id: "history", label: "Hareket Geçmişi" },
          ]}
          active={tab}
          onChange={setTab}
        />
        <Button type="button" variant="outline" onClick={handlePrint}>
          <Printer className="size-4" />
          Yazdır
        </Button>
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

          {/* Yazdırma için sade tablo */}
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
      ) : (
        <div className="no-print">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Yön</TableHead>
                <TableHead>Tarih</TableHead>
                <TableHead>Ürün / Lot</TableHead>
                <TableHead>Adet</TableHead>
                <TableHead>Karşı Depo</TableHead>
                <TableHead>İşleyen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-zinc-500"
                  >
                    Bu depo için hareket kaydı yok.
                  </TableCell>
                </TableRow>
              ) : (
                movements.map((row) => {
                  const counterpart =
                    row.direction === "IN" ? row.fromName : row.toName;
                  return (
                    <TableRow key={row.key}>
                      <TableCell>
                        <MovementBadge direction={row.direction} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-zinc-400">
                        {new Date(row.createdAt).toLocaleString("tr-TR")}
                      </TableCell>
                      <TableCell>
                        <span className="text-white">
                          {row.referenceCode} {row.productName}
                        </span>
                        <span className="mt-0.5 block font-mono text-xs text-blue-300">
                          Lot {row.lotNumber}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-lg text-blue-200">
                          {row.quantity}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-zinc-300">
                        {counterpart}
                      </TableCell>
                      <TableCell>{row.executedByName}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
