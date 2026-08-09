import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { getFailShipmentPreviewAction } from "@/lib/actions/fail";
import { canAccessFailManagement } from "@/lib/roles";
import type { UserRole } from "@/types/next-auth";
import { FailShipmentPreviewClient } from "@/components/fail/fail-shipment-preview";

export default async function FailGonderimPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const roles = (session.user.roles ?? []) as UserRole[];
  if (!canAccessFailManagement(roles)) {
    redirect("/dashboard/unauthorized");
  }

  const { id } = await params;
  const result = await getFailShipmentPreviewAction(id);
  if (result.error || !result.shipment) notFound();

  return <FailShipmentPreviewClient shipment={result.shipment} />;
}
