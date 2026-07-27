"use client";

import { useState, useTransition } from "react";
import { CalendarPlus, Loader2, StickyNote } from "lucide-react";
import {
  createTaskAction,
  createVisitAction,
  toggleTaskCompletedAction,
  type TaskRow,
  type VisitRow,
} from "@/lib/actions/crm";
import { buildTaskIcs, downloadIcsFile } from "@/lib/ics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function formatDateTime(iso: string) {
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

function toLocalDatetimeValue(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CustomerVisitNotesPanel({
  customerId,
  initialVisits,
  canMutate,
}: {
  customerId: string;
  initialVisits: VisitRow[];
  canMutate: boolean;
}) {
  const [visits, setVisits] = useState(initialVisits);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createVisitAction({ customerId, note });
      if (result.error) {
        setError(result.error);
        return;
      }
      setNote("");
      // Optimistic: refresh via full list would need another fetch;
      // prepend with session-ish placeholder then router.refresh is cleaner —
      // we re-append from server by calling list isn't available client-side easily.
      // Simple approach: reload page data via location — use prepend with temp until refresh.
      setVisits((prev) => [
        {
          id: result.data?.id ?? `tmp-${Date.now()}`,
          note: note.trim(),
          createdAt: new Date().toISOString(),
          userName: "Siz",
        },
        ...prev,
      ]);
    });
  }

  return (
    <div className="space-y-4">
      {canMutate ? (
        <form
          onSubmit={handleSave}
          className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4"
        >
          <Label htmlFor="visit-note">Ziyaret notu</Label>
          <textarea
            id="visit-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            required
            disabled={isPending}
            placeholder="Klinik ziyaretinde konuşulanlar, ihtiyaçlar…"
            className="flex w-full rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 shadow-sm placeholder:text-zinc-500 focus-visible:border-blue-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 disabled:cursor-not-allowed disabled:opacity-50"
          />
          {error ? (
            <p className="text-sm text-red-300" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={isPending || !note.trim()}>
            {isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <StickyNote className="size-4" />
            )}
            Notu Kaydet
          </Button>
        </form>
      ) : (
        <p className="text-xs text-zinc-500">
          Gözlemci modu: ziyaret notları yalnızca görüntülenir.
        </p>
      )}

      <div className="space-y-3">
        {visits.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-10 text-center text-sm text-zinc-500">
            Henüz ziyaret notu yok.
          </p>
        ) : (
          visits.map((v) => (
            <article
              key={v.id}
              className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-3"
            >
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                <time dateTime={v.createdAt}>{formatDateTime(v.createdAt)}</time>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-400">{v.userName}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-zinc-100">{v.note}</p>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

export function CustomerTasksPanel({
  customerId,
  customerName,
  initialTasks,
  canMutate,
}: {
  customerId: string;
  customerName: string;
  initialTasks: TaskRow[];
  canMutate: boolean;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(toLocalDatetimeValue());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createTaskAction({
        customerId,
        title,
        dueDate: new Date(dueDate).toISOString(),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      const newTask: TaskRow = {
        id: result.data?.id ?? `tmp-${Date.now()}`,
        title: title.trim(),
        dueDate: new Date(dueDate).toISOString(),
        isCompleted: false,
        createdAt: new Date().toISOString(),
        userName: "Siz",
      };
      setTitle("");
      setDueDate(toLocalDatetimeValue());
      setTasks((prev) =>
        [newTask, ...prev].sort((a, b) => {
          if (a.isCompleted !== b.isCompleted) {
            return a.isCompleted ? 1 : -1;
          }
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        }),
      );
    });
  }

  function handleToggle(task: TaskRow) {
    if (!canMutate) return;
    startTransition(async () => {
      const result = await toggleTaskCompletedAction(task.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setTasks((prev) =>
        prev
          .map((t) =>
            t.id === task.id
              ? { ...t, isCompleted: result.data?.isCompleted ?? !t.isCompleted }
              : t,
          )
          .sort((a, b) => {
            if (a.isCompleted !== b.isCompleted) {
              return a.isCompleted ? 1 : -1;
            }
            return (
              new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
            );
          }),
      );
    });
  }

  function handleAddToCalendar(task: TaskRow) {
    const ics = buildTaskIcs({
      id: task.id,
      title: task.title,
      dueDate: new Date(task.dueDate),
      customerName,
    });
    const safeName = task.title
      .slice(0, 40)
      .replace(/[^\w\sığüşöçİĞÜŞÖÇ-]/gi, "")
      .trim()
      .replace(/\s+/g, "-");
    downloadIcsFile(safeName || "gorev", ics);
  }

  return (
    <div className="space-y-4">
      {canMutate ? (
        <form
          onSubmit={handleCreate}
          className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 sm:grid-cols-2"
        >
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="task-title">Ne yapılacak?</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              disabled={isPending}
              placeholder="Örn. Stok kontrolü için ziyaret"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-due">Ne zaman?</Label>
            <Input
              id="task-due"
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
              disabled={isPending}
            />
          </div>
          <div className="flex items-end">
            <Button
              type="submit"
              disabled={isPending || title.trim().length < 2}
              className="w-full"
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Görev Ekle
            </Button>
          </div>
          {error ? (
            <p className="text-sm text-red-300 sm:col-span-2" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      ) : (
        <p className="text-xs text-zinc-500">
          Gözlemci modu: görevler yalnızca görüntülenir; takvime ekleme
          kullanılabilir.
        </p>
      )}

      <ul className="space-y-2">
        {tasks.length === 0 ? (
          <li className="rounded-xl border border-dashed border-zinc-800 px-4 py-10 text-center text-sm text-zinc-500">
            Henüz görev yok.
          </li>
        ) : (
          tasks.map((task) => (
            <li
              key={task.id}
              className={cn(
                "flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
                task.isCompleted && "opacity-60",
              )}
            >
              <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-blue-500"
                  checked={task.isCompleted}
                  disabled={!canMutate || isPending}
                  onChange={() => handleToggle(task)}
                />
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block text-sm font-medium text-white",
                      task.isCompleted && "line-through text-zinc-500",
                    )}
                  >
                    {task.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    {formatDateTime(task.dueDate)}
                    <span className="text-zinc-600"> · </span>
                    {task.userName}
                  </span>
                </span>
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAddToCalendar(task)}
                title="Takvime Ekle (.ics)"
              >
                <CalendarPlus className="size-4" />
                Takvime Ekle
              </Button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
