"use client";

import Link from "next/link";
import { Mail, Printer, ArrowLeft } from "lucide-react";
import type { FailShipmentPreview } from "@/lib/fail/types";
import {
  downloadFailShipmentPdf,
  openFailShipmentMailto,
} from "@/lib/fail/shipment-pdf";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FailShipmentPreviewClient({
  shipment,
}: {
  shipment: FailShipmentPreview;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard/fail-yonetimi"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          <ArrowLeft className="size-4" />
          Fail Yönetimi
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" />
            Yazdır
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => downloadFailShipmentPdf(shipment)}
          >
            PDF İndir
          </Button>
          <Button
            type="button"
            onClick={async () => {
              await downloadFailShipmentPdf(shipment);
              openFailShipmentMailto(shipment);
            }}
          >
            <Mail className="size-4" />
            Mail Gönder
          </Button>
        </div>
      </div>

      <div className="print-area space-y-4 rounded-2xl border border-border bg-card p-6">
        <div>
          <p className="font-mono text-xs tracking-[0.2em] text-blue-500 uppercase">
            SmartStok
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">
            Fail Ürün Gönderim Listesi
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Talep: {shipment.id}
            <br />
            Tarih:{" "}
            {new Date(shipment.createdAt).toLocaleString("tr-TR", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        </div>

        <table className="print-table w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-2 py-2">Referans</th>
              <th className="px-2 py-2">Ürün</th>
              <th className="px-2 py-2 text-right">Adet</th>
            </tr>
          </thead>
          <tbody>
            {shipment.lines.map((l) => (
              <tr key={l.referenceCode + l.productName} className="border-b border-border">
                <td className="px-2 py-2 font-mono">{l.referenceCode}</td>
                <td className="px-2 py-2">{l.productName}</td>
                <td className="px-2 py-2 text-right font-mono">{l.quantity}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="px-2 py-3 font-medium" colSpan={2}>
                Toplam
              </td>
              <td className="px-2 py-3 text-right font-mono font-semibold">
                {shipment.totalQuantity}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
