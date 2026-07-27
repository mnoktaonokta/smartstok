"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export function UnauthorizedGate({ defaultNext }: { defaultNext: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || defaultNext;

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center text-center">
      <ShieldAlert className="mb-4 size-12 text-amber-400" />
      <h1 className="text-2xl font-semibold text-white">Yetkisiz erişim</h1>
      <p className="mt-3 text-sm text-zinc-400">
        Bu alan için yetkili değilsiniz
      </p>
      <Button
        type="button"
        className="mt-8"
        size="lg"
        onClick={() => router.replace(next)}
      >
        Tamam
      </Button>
    </div>
  );
}
