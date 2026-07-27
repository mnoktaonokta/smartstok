import { auth } from "@/auth";
import { redirect } from "next/navigation";
import {
  getDashboardDataAction,
  getSalesDashboardDataAction,
  getWarehouseDashboardDataAction,
} from "@/lib/actions/dashboard";
import { getDashboardVariant, canMutateData, hasRole } from "@/lib/roles";
import { AdminDashboard } from "@/components/dashboard/admin-dashboard";
import { SalesDashboard } from "@/components/dashboard/sales-dashboard";
import { WarehouseDashboard } from "@/components/dashboard/warehouse-dashboard";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const roles = session.user.roles ?? [];
  const variant = getDashboardVariant(roles);
  const canMutate = canMutateData(roles);

  if (variant === "warehouse") {
    const data = await getWarehouseDashboardDataAction();
    return <WarehouseDashboard data={data} />;
  }

  if (variant === "sales") {
    const data = await getSalesDashboardDataAction();
    return <SalesDashboard data={data} />;
  }

  const data = await getDashboardDataAction();
  return (
    <AdminDashboard
      data={data}
      canMutate={canMutate}
      showCriticalStocks={hasRole(roles, "ADMIN")}
    />
  );
}
