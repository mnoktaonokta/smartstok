"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { adminSyncCustomersAction } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";

export function AdminSyncCustomersButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  function handleSync() {
    setBanner(null);
    startTransition(async () => {
      const result = await adminSyncCustomersAction();
      if (result.error) {
        setBanner({ type: "error", text: result.error });
        return;
      }
      setBanner({
        type: "success",
        text:
          result.message ??
          `${result.added ?? 0} eklendi, ${result.updated ?? 0} güncellendi.`,
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <Button type="button" onClick={handleSync} disabled={isPending}>
        {isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <RefreshCw className="size-4" />
        )}
        {isPending
          ? "ERP’den aktarılıyor…"
          : "ERP’den Müşterileri Güncelle"}
      </Button>
      {banner ? (
        <p
          className={
            banner.type === "error"
              ? "text-sm text-red-300"
              : "text-sm text-emerald-300"
          }
        >
          {banner.text}
        </p>
      ) : null}
    </div>
  );
}
