"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { fetchDespatchPdfAction } from "@/lib/actions/edocument-invoices";
import { Button } from "@/components/ui/button";

export function DespatchFetchPdfButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const r = await fetchDespatchPdfAction(invoiceId);
            if (r.error) {
              setError(r.error);
              return;
            }
            router.refresh();
            window.open(
              `/api/invoices/${invoiceId}/despatch-pdf`,
              "_blank",
            );
          });
        }}
      >
        {isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <FileDown className="size-3.5" />
        )}
        İrsaliye PDF yenile
      </Button>
      {error ? <span className="text-xs text-red-400">{error}</span> : null}
    </div>
  );
}
