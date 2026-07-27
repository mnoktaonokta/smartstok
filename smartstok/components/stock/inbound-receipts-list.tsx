"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import {
  resolveInboundDiscrepancyAction,
  type InboundReceiptListItem,
} from "@/lib/actions/inbound";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<InboundReceiptListItem["status"], string> = {
  PENDING: "Bekliyor",
  COMPLETED: "Tamamlandı",
  DISCREPANCY: "Uyumsuzluk",
};

export function InboundReceiptsList({
  receipts,
  isAdmin,
}: {
  receipts: InboundReceiptListItem[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function resolve(id: string) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const result = await resolveInboundDiscrepancyAction(id);
      setBusyId(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (receipts.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500">
        Henüz mal kabul kaydı yok.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="space-y-2">
        {receipts.map((r) => (
          <li
            key={r.id}
            className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-3"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-md px-2 py-0.5 text-[11px] font-medium uppercase",
                      r.status === "COMPLETED" &&
                        "bg-emerald-500/15 text-emerald-300",
                      r.status === "DISCREPANCY" &&
                        "bg-amber-500/15 text-amber-300",
                      r.status === "PENDING" && "bg-zinc-700/40 text-zinc-300",
                    )}
                  >
                    {STATUS_LABEL[r.status]}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {new Date(r.createdAt).toLocaleString("tr-TR")}
                  </span>
                </div>
                <p className="text-sm text-zinc-200">
                  {r.documentNumber
                    ? `Belge: ${r.documentNumber}`
                    : "Belge no yok"}
                  {r.supplierName ? ` · ${r.supplierName}` : ""}
                </p>
                {r.createdByName ? (
                  <p className="text-xs text-zinc-500">
                    İşleyen: {r.createdByName}
                  </p>
                ) : null}
                {r.discrepancyNote ? (
                  <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 font-sans text-xs text-amber-100/90">
                    {r.discrepancyNote}
                  </pre>
                ) : null}
              </div>
              {isAdmin && r.status === "DISCREPANCY" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isPending && busyId === r.id}
                  onClick={() => resolve(r.id)}
                >
                  {isPending && busyId === r.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  Tamamlandı Olarak İşaretle
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
