import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { getInventoryCountAction } from "@/lib/actions/inventory-count";
import {
  canAccessInboundReceipt,
  canMutateData,
  hasRole,
} from "@/lib/roles";
import { InventoryCountWorkspace } from "@/components/inventory-count/inventory-count-workspace";

export default async function SayimDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const roles = session?.user?.roles;

  if (
    !canAccessInboundReceipt(roles) &&
    !hasRole(roles, "OBSERVER")
  ) {
    redirect("/dashboard/unauthorized");
  }

  const { id } = await params;
  const result = await getInventoryCountAction(id);
  if (result.error || !result.count) {
    notFound();
  }

  const canMutate = canMutateData(roles) && canAccessInboundReceipt(roles);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link
          href="/dashboard/sayim"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-blue-300"
        >
          <ArrowLeft className="size-4" />
          Sayım listesi
        </Link>
        <h1 className="mt-3 text-3xl font-semibold text-white">Sayım Fişi</h1>
        <p className="mt-2 font-mono text-xs text-zinc-500">{result.count.id}</p>
      </div>

      <InventoryCountWorkspace
        initial={result.count}
        canMutate={canMutate}
      />
    </div>
  );
}
