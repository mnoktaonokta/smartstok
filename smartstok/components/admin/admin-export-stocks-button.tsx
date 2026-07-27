"use client";

import { useState, useTransition } from "react";
import { Download, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import { getAllStocksForExportAction } from "@/lib/actions/exportAllStocks";
import { Button } from "@/components/ui/button";

function todayStamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function AdminExportStocksButton() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleExport() {
    setError(null);
    startTransition(async () => {
      const result = await getAllStocksForExportAction();
      if (result.error) {
        setError(result.error);
        return;
      }

      const rows = result.data ?? [];
      const sheet = XLSX.utils.aoa_to_sheet([
        [
          "İlgili Eleman",
          "Depo İsmi",
          "Referans No",
          "Ürün Adı",
          "Barkod",
          "Adet",
        ],
        ...rows.map((r) => [
          r.ilgiliEleman,
          r.depoIsmi,
          r.referansNo,
          r.urunAdi,
          r.barkod,
          r.adet,
        ]),
      ]);

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "Stok Raporu");
      XLSX.writeFile(workbook, `Genel_Stok_Raporu_${todayStamp()}.xlsx`);
    });
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <Button
        type="button"
        onClick={handleExport}
        disabled={isPending}
        className="min-h-11"
      >
        {isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Download className="size-4" />
        )}
        Tüm Stok Raporunu İndir
      </Button>
      {error ? (
        <p className="max-w-xs text-right text-xs text-red-300" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
