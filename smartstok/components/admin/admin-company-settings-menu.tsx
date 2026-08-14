"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Building2,
  ChevronDown,
  FileText,
  Plug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MENU_ITEMS = [
  {
    href: "/dashboard/admin/firma-bilgileri",
    label: "Firma Bilgileri",
    icon: Building2,
  },
  {
    href: "/dashboard/admin/entegrator",
    label: "Entegratör Seçimi",
    icon: Plug,
  },
  {
    href: "/dashboard/admin/fatura-bilgileri",
    label: "Fatura Bilgileri",
    icon: FileText,
  },
] as const;

/** Admin panelinde Firma Bilgileri açılır menüsü */
export function AdminCompanySettingsMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Building2 className="size-4" />
        Firma Bilgileri
        <ChevronDown
          className={cn(
            "size-4 transition-transform",
            open && "rotate-180",
          )}
        />
      </Button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 py-1 shadow-xl"
        >
          {MENU_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 text-sm text-zinc-200 hover:bg-zinc-900"
              >
                <Icon className="size-3.5 text-blue-400" />
                {item.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
