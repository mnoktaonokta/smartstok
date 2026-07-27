import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { DashboardSidebar } from "@/components/dashboard/sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-background">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(37,99,235,0.12),_transparent_45%)]" />
      <DashboardSidebar
        userName={session.user.name ?? session.user.email ?? "Kullanıcı"}
        userRoles={session.user.roles ?? []}
      />
      <main className="relative z-10 flex-1 overflow-auto px-4 pt-16 pb-6 sm:px-6 md:p-8 md:pt-8">
        {children}
      </main>
    </div>
  );
}
