import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasRole } from "@/lib/roles";
import { getCompanySettingsAction } from "@/lib/actions/company-settings";
import { IntegratorSettingsForm } from "@/components/admin/integrator-settings-form";

export default async function EntegratorPage() {
  const session = await auth();
  if (!session?.user || !hasRole(session.user.roles, "ADMIN")) {
    redirect("/dashboard");
  }

  const result = await getCompanySettingsAction();
  if (result.error || !result.settings) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
        {result.error ?? "Entegratör ayarları yüklenemedi."}
      </div>
    );
  }

  return <IntegratorSettingsForm initial={result.settings} />;
}
