"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, UserRound } from "lucide-react";
import {
  assignCustomerRepAction,
  type SahaRepOption,
} from "@/lib/actions/customers";
import { cn } from "@/lib/utils";

export function AssignedRepBadge({
  customerId,
  assignedUser,
  canEdit,
  reps,
}: {
  customerId: string;
  assignedUser: { id: string; fullName: string } | null;
  canEdit: boolean;
  reps: SahaRepOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function assign(nextId: string | null) {
    setError(null);
    startTransition(async () => {
      const result = await assignCustomerRepAction({
        customerId,
        assignedUserId: nextId,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!canEdit) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-300">
        <UserRound className="size-3.5 text-blue-400" />
        <span className="text-zinc-500">Sorumlu Temsilci:</span>
        <span className="font-medium text-zinc-100">
          {assignedUser?.fullName ?? "Atanmamış"}
        </span>
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors",
          "border-blue-500/40 bg-blue-500/10 text-blue-100 hover:bg-blue-500/20",
        )}
      >
        {isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <UserRound className="size-3.5 text-blue-400" />
        )}
        <span className="text-blue-300/80">Sorumlu Temsilci:</span>
        <span className="font-medium">
          {assignedUser?.fullName ?? "Atanmamış"}
        </span>
        <ChevronDown className="size-3.5 opacity-70" />
      </button>

      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 shadow-xl">
          <p className="border-b border-zinc-800 px-3 py-2 text-[11px] tracking-wide text-zinc-500 uppercase">
            Saha Satış personeli
          </p>
          <ul className="max-h-64 overflow-y-auto py-1">
            <li>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                onClick={() => assign(null)}
              >
                Atamayı kaldır
              </button>
            </li>
            {reps.map((rep) => (
              <li key={rep.id}>
                <button
                  type="button"
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm hover:bg-zinc-900",
                    assignedUser?.id === rep.id
                      ? "bg-blue-500/10 text-blue-200"
                      : "text-zinc-200",
                  )}
                  onClick={() => assign(rep.id)}
                >
                  {rep.fullName}
                </button>
              </li>
            ))}
            {reps.length === 0 ? (
              <li className="px-3 py-3 text-sm text-zinc-500">
                Saha Satış yetkili kullanıcı yok.
              </li>
            ) : null}
          </ul>
          {error ? (
            <p className="border-t border-zinc-800 px-3 py-2 text-xs text-red-300">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
