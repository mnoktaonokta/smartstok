"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Mail, Printer, Send } from "lucide-react";
import type { FailAggLine } from "@/lib/fail/types";
import { createFailShipmentAction } from "@/lib/actions/fail";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function FailShipmentPanel({
  aggregation,
  canMutate,
}: {
  aggregation: FailAggLine[];
  canMutate: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const result = await createFailShipmentAction();
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.shipmentId) {
        router.push(`/dashboard/fail-yonetimi/gonderim/${result.shipmentId}`);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Açık döngüde Fail Listesi’ndeki ürünler (müşterilere verilen değişimler)
        ürün bazında toplanır. Gönderim talebi oluşturunca Tedarikçi Bekleme
        deposuna geçer ve yeni döngü başlar.
      </p>

      {aggregation.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          Gönderilecek fail ürünü yok.
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Referans</TableHead>
                <TableHead>Ürün</TableHead>
                <TableHead>Marka</TableHead>
                <TableHead className="text-right">Adet</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aggregation.map((row) => (
                <TableRow key={row.productId}>
                  <TableCell className="font-mono text-sm">
                    {row.referenceCode}
                  </TableCell>
                  <TableCell>{row.productName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.brand}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {row.quantity}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {canMutate ? (
            <div className="flex justify-end">
              <Button type="button" disabled={isPending} onClick={handleCreate}>
                {isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Gönderme Talebi Oluştur
              </Button>
            </div>
          ) : null}
        </>
      )}

      {error ? (
        <p className="text-sm text-red-500" role="alert">
          {error}
        </p>
      ) : null}

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Printer className="size-3.5" />
        <Mail className="size-3.5" />
        Önizleme sayfasında yazdırma, PDF ve mail seçenekleri açılır.
      </p>
    </div>
  );
}
