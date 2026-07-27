"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, CalendarClock, Loader2 } from "lucide-react";
import type { SalesAgendaTask } from "@/lib/actions/dashboard";
import { toggleTaskCompletedAction } from "@/lib/actions/crm";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

function formatDue(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SalesAgendaCard({
  initialTasks,
}: {
  initialTasks: SalesAgendaTask[];
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function completeTask(taskId: string) {
    setError(null);
    setBusyId(taskId);
    startTransition(async () => {
      const result = await toggleTaskCompletedAction(taskId);
      setBusyId(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    });
  }

  const now = Date.now();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="size-4 text-blue-400" />
          Hatırlatmalar & Görevler
        </CardTitle>
        <CardDescription>
          Size atanmış, tamamlanmamış yaklaşan görevler
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <p className="text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}

        {tasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/40 px-4 py-10 text-center">
            <CalendarClock className="mx-auto size-8 text-zinc-600" />
            <p className="mt-3 text-sm text-zinc-400">
              Bekleyen görev veya hatırlatmanız yok.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800">
            {tasks.map((task) => {
              const overdue = new Date(task.dueDate).getTime() < now;
              const busy = isPending && busyId === task.id;
              return (
                <li
                  key={task.id}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <Link
                      href={`/dashboard/customers/${task.customerId}`}
                      className="text-sm font-medium text-blue-300 hover:text-blue-200 hover:underline"
                    >
                      {task.customerName}
                    </Link>
                    <p className="truncate text-sm text-white">{task.title}</p>
                    <p
                      className={cn(
                        "text-xs",
                        overdue
                          ? "font-medium text-red-400"
                          : "text-zinc-500",
                      )}
                    >
                      {formatDue(task.dueDate)}
                      {overdue ? " · Gecikmiş" : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => completeTask(task.id)}
                    className="w-full shrink-0 sm:w-auto"
                  >
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Check className="size-4 text-emerald-400" />
                    )}
                    Tamamlandı
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
