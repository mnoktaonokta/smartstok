import { Suspense } from "react";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getHomePath } from "@/lib/roles";
import { UnauthorizedGate } from "@/components/dashboard/unauthorized-gate";

export default async function UnauthorizedPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const home = getHomePath(session.user.roles ?? []);

  return (
    <Suspense
      fallback={
        <p className="py-20 text-center text-sm text-zinc-500">Yükleniyor…</p>
      }
    >
      <UnauthorizedGate defaultNext={home} />
    </Suspense>
  );
}
