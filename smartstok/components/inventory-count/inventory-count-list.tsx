"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ClipboardList, Loader2, Plus, Trash2 } from "lucide-react";
import {
  deleteInventoryCountDraftAction,
  startInventoryCountAction,
} from "@/lib/actions/inventory-count";
import type { InventoryCountListItem } from "@/lib/actions/inventory-count";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function InventoryCountList({
  counts,
  canMutate,
}: {
  counts: InventoryCountListItem[];
  canMutate: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function handleStart() {
    setError(null);
    startTransition(async () => {
      const result = await startInventoryCountAction();
      if (result.countId) {
        router.push(`/dashboard/sayim/${result.countId}`);
        router.refresh();
        return;
      }
      setError(result.error ?? "Sayım başlatılamadı.");
    });
  }

  function handleDeleteDraft(countId: string) {
    if (
      !window.confirm(
        "Bu taslak sayım silinecek. Sayılan miktarlar kaybolur; stoklar değişmez. Emin misiniz?",
      )
    ) {
      return;
    }
    setError(null);
    setDeletingId(countId);
    startTransition(async () => {
      const result = await deleteInventoryCountDraftAction(countId);
      setDeletingId(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-400">
          Merkez depo için sayım fişleri. Taslak kaydedilir; stok yalnızca
          &quot;Stokları Güncelle ve Kapat&quot; ile değişir.
        </p>
        {canMutate ? (
          <Button type="button" onClick={handleStart} disabled={isPending}>
            {isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Yeni Sayım Başlat
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      {counts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/40 px-6 py-16 text-center">
          <ClipboardList className="size-10 text-zinc-600" />
          <p className="text-sm text-zinc-400">Henüz sayım fişi yok.</p>
          {canMutate ? (
            <Button type="button" onClick={handleStart} disabled={isPending}>
              İlk Sayımı Başlat
            </Button>
          ) : null}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tarih</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead className="text-right">Satır</TableHead>
              <TableHead className="text-right">Toplam |Fark|</TableHead>
              <TableHead className="text-right">Özet</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {counts.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="whitespace-nowrap text-zinc-200">
                  {formatDate(c.createdAt)}
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
                      c.status === "DRAFT"
                        ? "bg-amber-500/15 text-amber-200"
                        : "bg-emerald-500/15 text-emerald-200",
                    )}
                  >
                    {c.status === "DRAFT" ? "Taslak" : "Tamamlandı"}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono text-zinc-300">
                  {c.itemCount}
                </TableCell>
                <TableCell className="text-right font-mono text-zinc-300">
                  {c.totalDifference}
                </TableCell>
                <TableCell className="text-right text-xs text-zinc-500">
                  <span className="text-emerald-400">{c.matchedCount} OK</span>
                  {" · "}
                  <span className="text-red-400">{c.shortCount} eksik</span>
                  {" · "}
                  <span className="text-amber-300">{c.overCount} fazla</span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/dashboard/sayim/${c.id}`)}
                    >
                      {c.status === "DRAFT" ? "Devam Et" : "İncele"}
                    </Button>
                    {canMutate && c.status === "DRAFT" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-w-11 px-0 text-red-400 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300"
                        aria-label="Taslak sayımı sil"
                        title="Taslak sayımı sil"
                        disabled={isPending}
                        onClick={() => handleDeleteDraft(c.id)}
                      >
                        {deletingId === c.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Trash2 className="size-4" />
                        )}
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
