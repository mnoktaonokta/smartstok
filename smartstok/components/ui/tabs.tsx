"use client";

import { cn } from "@/lib/utils";

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: string; label: string }>;
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            "flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
            active === tab.id
              ? "bg-blue-600/25 text-blue-700 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.4)] dark:text-blue-200"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function MovementBadge({
  direction,
}: {
  direction: "IN" | "OUT";
}) {
  const isIn = direction === "IN";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        isIn
          ? "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-300"
          : "bg-red-500/15 text-red-700 ring-1 ring-red-500/30 dark:text-red-300",
      )}
    >
      {isIn ? "Giriş" : "Çıkış"}
    </span>
  );
}
