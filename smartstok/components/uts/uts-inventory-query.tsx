"use client";

import { useState, useTransition } from "react";
import { Download, Loader2, PackageSearch } from "lucide-react";
import * as XLSX from "xlsx";
import { queryUtsFirmInventoryAction } from "@/lib/actions/uts";
import type { UtsInventoryItem } from "@/lib/services/utsService";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatExportStamp(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}_${h}-${min}`;
}

function exportToExcel(inventoryData: UtsInventoryItem[]) {
  const rows = inventoryData.map((item) => ({
    "Ürün Adı": item.productName ?? "",
    Barkod: item.barcode,
    Lot: item.lotNumber,
    Miktar: item.quantity,
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "ÜTS Envanter");
  XLSX.writeFile(workbook, `UTS_Envanter_${formatExportStamp()}.xlsx`);
}

export function UtsInventoryQueryButton() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<UtsInventoryItem[]>([]);
  const [notices, setNotices] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleQuery() {
    setError(null);
    setNotices([]);
    setOpen(true);
    setItems([]);
    startTransition(async () => {
      const result = await queryUtsFirmInventoryAction();
      if (result.error) {
        setError(result.error);
        return;
      }
      setItems(result.items ?? []);
      setNotices(result.notices ?? []);
    });
  }

  const canDownload = !isPending && !error && items.length > 0;

  return (
    <>
      <Button type="button" variant="outline" onClick={handleQuery}>
        <PackageSearch className="size-4" />
        ÜTS’deki Stoklarımı Sorgula
      </Button>

      <Dialog open={open} onOpenChange={setOpen} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Envanter Mutabakatı</DialogTitle>
          <DialogDescription>
            Devletin sisteminde üzerinize kayıtlı güncel ürünler
          </DialogDescription>
        </DialogHeader>

        <DialogContent className="max-h-[60vh] space-y-3 overflow-y-auto">
          {isPending ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-zinc-400">
              <Loader2 className="size-6 animate-spin text-blue-400" />
              <p className="text-sm">ÜTS envanteri sorgulanıyor…</p>
            </div>
          ) : error ? (
            <p
              className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
              role="alert"
            >
              {error}
            </p>
          ) : items.length === 0 ? (
            <div className="space-y-3 py-6 text-center">
              <p className="text-sm text-zinc-500">
                ÜTS’de üzerinize kayıtlı ürün bulunamadı.
              </p>
              {notices.length > 0 ? (
                <div
                  className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-left text-sm text-amber-100"
                  role="status"
                >
                  <p className="mb-1 font-medium text-amber-200">
                    ÜTS mesajı / uyarı:
                  </p>
                  <ul className="list-inside list-disc space-y-1 text-amber-100/90">
                    {notices.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-zinc-600">
                  API 200 OK döndü; liste boş. Terminalde &quot;ÜTS RAW
                  RESPONSE&quot; loguna bakarak yanıt yapısını doğrulayın.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {notices.length > 0 ? (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                  {notices.join(" · ")}
                </div>
              ) : null}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ürün</TableHead>
                    <TableHead>Barkod</TableHead>
                    <TableHead>Lot</TableHead>
                    <TableHead className="text-right">Miktar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, idx) => (
                    <TableRow
                      key={`${item.barcode}-${item.lotNumber}-${idx}`}
                    >
                      <TableCell className="text-zinc-200">
                        {item.productName ?? "—"}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-blue-300">
                          {item.barcode}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-zinc-300">
                          {item.lotNumber}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-white">
                        {item.quantity}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={!canDownload}
            onClick={() => exportToExcel(items)}
          >
            <Download className="size-4" />
            İndir
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Kapat
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
