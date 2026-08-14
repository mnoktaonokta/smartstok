"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { refreshQnbInvoiceStatusAction } from "@/lib/actions/qnb-invoices";
import { Button } from "@/components/ui/button";

export function InvoiceRefreshStatusButton({ invoiceId }: { invoiceId: string }) {
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
            const r = await refreshQnbInvoiceStatusAction(invoiceId);
            if (r.error) {
              setError(r.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        {isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <RefreshCw className="size-3.5" />
        )}
        Durum sorgula
      </Button>
      {error ? <span className="text-xs text-red-400">{error}</span> : null}
    </div>
  );
}
