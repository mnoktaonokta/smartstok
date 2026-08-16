"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeftRight,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PackagePlus,
  Radio,
  Receipt,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  canAccessPath,
  formatRoles,
  hasRole,
} from "@/lib/roles";
import type { UserRole } from "@/types/next-auth";
import { logoutAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/dashboard", label: "Özet", icon: LayoutDashboard },
  { href: "/dashboard/products", label: "Ürünler", icon: Package },
  { href: "/dashboard/customers", label: "Müşteriler", icon: Users },
  { href: "/dashboard/depots", label: "Depolar", icon: Warehouse },
  { href: "/dashboard/transfers", label: "Transfer Yapma", icon: ArrowLeftRight },
  { href: "/dashboard/fail-yonetimi", label: "Fail Yönetimi", icon: AlertTriangle },
  { href: "/dashboard/e-belge-fatura", label: "E-belge fatura", icon: Receipt },
  { href: "/dashboard/invoices", label: "Faturalar", icon: FileText },
  { href: "/dashboard/malkabul", label: "Mal Kabul", icon: PackagePlus },
  { href: "/dashboard/sayim", label: "Stok Sayımı", icon: ClipboardList },
  { href: "/dashboard/uts-tracking", label: "ÜTS", icon: Radio },
] as const;

function SidebarNav({
  userName,
  userRoles,
  onNavigate,
}: {
  userName: string;
  userRoles: UserRole[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isAdmin = hasRole(userRoles, "ADMIN");
  const items = navItems.filter((item) => canAccessPath(userRoles, item.href));
  const adminActive = pathname.startsWith("/dashboard/admin");

  return (
    <>
      <div className="shrink-0 border-b border-sidebar-border px-5 py-6">
        <p className="font-mono text-[10px] tracking-[0.3em] text-blue-700 uppercase dark:text-blue-400">
          Smart Dental
        </p>
        <h1 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-foreground">SmartStok</h1>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
        {items.map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === item.href
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-blue-600/20 text-blue-700 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.35)] dark:text-blue-300"
                  : "text-zinc-900 hover:bg-muted hover:text-black dark:text-muted-foreground dark:hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border bg-sidebar p-4">
        {isAdmin ? (
          <Link
            href="/dashboard/admin"
            onClick={onNavigate}
            className={cn(
              "block rounded-lg px-2 py-1.5 transition-colors",
              adminActive
                ? "bg-blue-600/20 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.35)]"
                : "hover:bg-muted",
            )}
            title="Admin paneli"
          >
            <p className="truncate text-sm font-medium text-zinc-950 dark:text-foreground">
              {userName}
            </p>
            <p className="text-xs text-blue-700/90 dark:text-blue-400/80">
              {formatRoles(userRoles)} · Admin paneli
            </p>
          </Link>
        ) : (
          <>
            <p className="truncate text-sm font-medium text-zinc-950 dark:text-foreground">
              {userName}
            </p>
            <p className="text-xs text-blue-700/90 dark:text-blue-400/80">
              {formatRoles(userRoles)}
            </p>
          </>
        )}
        <form action={logoutAction} className="mt-3">
          <Button type="submit" variant="outline" size="sm" className="min-h-11 w-full">
            <LogOut className="size-3.5" />
            Çıkış
          </Button>
        </form>
      </div>
    </>
  );
}

export function DashboardSidebar({
  userName,
  userRoles,
}: {
  userName: string;
  userRoles: UserRole[];
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  return (
    <>
      <header className="no-print fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-sidebar/95 px-3 backdrop-blur md:hidden">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 min-w-11 shrink-0 px-0"
          aria-label="Menüyü aç"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="size-5" />
        </Button>
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.25em] text-blue-700 uppercase dark:text-blue-400">
            Smart Dental
          </p>
          <p className="truncate text-sm font-semibold text-zinc-950 dark:text-foreground">SmartStok</p>
        </div>
      </header>

      {/* Masaüstü sidebar */}
      <aside className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <SidebarNav userName={userName} userRoles={userRoles} />
      </aside>

      {/* Mobil drawer */}
      <div
        className={cn(
          "no-print fixed inset-0 z-50 md:hidden",
          mobileOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!mobileOpen}
      >
        <button
          type="button"
          aria-label="Menüyü kapat"
          className={cn(
            "absolute inset-0 bg-black/60 transition-opacity",
            mobileOpen ? "opacity-100" : "opacity-0",
          )}
          onClick={() => setMobileOpen(false)}
        />
        <aside
          className={cn(
            "absolute inset-y-0 left-0 flex w-[min(18rem,88vw)] flex-col border-r border-sidebar-border bg-sidebar shadow-2xl transition-transform duration-200 ease-out",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <button
            type="button"
            aria-label="Kapat"
            className="absolute top-3 right-3 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setMobileOpen(false)}
          >
            <X className="size-5" />
          </button>
          <SidebarNav
            userName={userName}
            userRoles={userRoles}
            onNavigate={() => setMobileOpen(false)}
          />
        </aside>
      </div>
    </>
  );
}
