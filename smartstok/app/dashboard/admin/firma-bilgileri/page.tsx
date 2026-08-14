import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasRole } from "@/lib/roles";
import { getCompanySettingsAction } from "@/lib/actions/company-settings";
import { CompanyProfileSettingsForm } from "@/components/admin/company-profile-settings-form";

export default async function FirmaBilgileriPage() {
  const session = await auth();
  if (!session?.user || !hasRole(session.user.roles, "ADMIN")) {
    redirect("/dashboard");
  }

  const result = await getCompanySettingsAction();
  if (result.error || !result.settings) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
        {result.error ?? "Firma ayarları yüklenemedi."}
      </div>
    );
  }

  return <CompanyProfileSettingsForm initial={result.settings} />;
}
