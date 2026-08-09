import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { loadFailPageData } from "@/lib/fail/page-data";
import { canAccessFailManagement, canMutateData } from "@/lib/roles";
import type { UserRole } from "@/types/next-auth";
import { FailWorkspace } from "@/components/fail/fail-workspace";

export default async function FailYonetimiPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const roles = (session.user.roles ?? []) as UserRole[];
  if (!canAccessFailManagement(roles)) {
    redirect("/dashboard/unauthorized");
  }

  const result = await loadFailPageData();
  if (result.error || !result.data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">Fail Yönetimi</h1>
        <p className="text-sm text-red-500">
          {result.error ?? "Veriler yüklenemedi."}
        </p>
        <p className="text-xs text-muted-foreground">
          Geliştirme sunucusunu durdurup şu komutları sırayla çalıştırın:{" "}
          <code className="font-mono">npx prisma generate</code>, ardından{" "}
          <code className="font-mono">npm run dev</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="font-mono text-xs tracking-[0.25em] text-blue-500 uppercase dark:text-blue-400">
          Operasyon
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-foreground">
          Fail Yönetimi
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Implant değişim ve iade süreçleri — müşteri alımı, tedarikçi gönderimi
          ve teslim.
          {!canMutateData(roles) ? (
            <span className="ml-1 text-amber-600">(Salt okunur)</span>
          ) : null}
        </p>
      </div>
      <FailWorkspace data={result.data} />
    </div>
  );
}
