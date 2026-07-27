"use client";

import { useEffect, useState, useTransition } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ChevronDown, Loader2, Send, Warehouse } from "lucide-react";
import {
  notifySelectedToUtsAction,
  type UtsPendingGroup,
  type UtsPendingRow,
} from "@/lib/actions/uts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type GroupState = UtsPendingGroup & {
  items: Array<UtsPendingRow & { errorMessage?: string | null }>;
};

export function UtsPendingGroups({
  initialGroups,
  canMutate = true,
}: {
  initialGroups: UtsPendingGroup[];
  canMutate?: boolean;
}) {
  const [groups, setGroups] = useState<GroupState[]>(initialGroups);
  const [openId, setOpenId] = useState<string | null>(null);
  const [selectedByLocation, setSelectedByLocation] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const [banners, setBanners] = useState<
    Record<string, { type: "error" | "success" | "warning"; text: string }>
  >({});
  const [pendingLocationId, setPendingLocationId] = useState<string | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setGroups(initialGroups);
    setOpenId((prev) => {
      if (prev && initialGroups.some((g) => g.locationId === prev)) return prev;
      return null;
    });
  }, [initialGroups]);

  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 px-6 py-12 text-center">
        <Warehouse className="mx-auto size-8 text-zinc-600" />
        <p className="mt-3 text-sm text-zinc-400">
          Bekleyen ÜTS bildirimi olan klinik/depo yok.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const isOpen = openId === group.locationId;
        const selectedMap = selectedByLocation[group.locationId] ?? {};
        const selectedIds = Object.entries(selectedMap)
          .filter(([, v]) => v)
          .map(([id]) => id);
        const allSelected =
          group.items.length > 0 &&
          group.items.every((item) => selectedMap[item.id]);
        const banner = banners[group.locationId];
        const busy = isPending && pendingLocationId === group.locationId;

        return (
          <div
            key={group.locationId}
            className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/60"
          >
            <button
              type="button"
              className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-blue-500/5 sm:px-5"
              onClick={() =>
                setOpenId((prev) =>
                  prev === group.locationId ? null : group.locationId,
                )
              }
              aria-expanded={isOpen}
            >
              <ChevronDown
                className={cn(
                  "size-5 shrink-0 text-zinc-500 transition-transform",
                  isOpen && "rotate-180 text-blue-400",
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-white">
                  {group.locationName}
                </p>
                {group.customerName ? (
                  <p className="truncate text-xs text-zinc-500">
                    {group.customerName}
                    {group.customerVkn ? ` · VKN ${group.customerVkn}` : ""}
                  </p>
                ) : null}
              </div>
              <span className="shrink-0 rounded-md border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 font-mono text-xs text-blue-300">
                {group.pendingCount} Ürün
              </span>
            </button>

            {isOpen ? (
              <div className="space-y-4 border-t border-zinc-800 px-4 py-4 sm:px-5">
                {canMutate ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-400">
                    <input
                      type="checkbox"
                      className="size-4 accent-blue-500"
                      checked={allSelected}
                      disabled={busy || group.items.length === 0}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSelectedByLocation((prev) => {
                          const next: Record<string, boolean> = {};
                          if (checked) {
                            for (const item of group.items) {
                              next[item.id] = true;
                            }
                          }
                          return { ...prev, [group.locationId]: next };
                        });
                      }}
                    />
                    Tümünü seç
                  </label>

                  <Button
                    type="button"
                    onClick={() => {
                      setBanners((prev) => {
                        const next = { ...prev };
                        delete next[group.locationId];
                        return next;
                      });
                      setPendingLocationId(group.locationId);
                      startTransition(async () => {
                        const result =
                          await notifySelectedToUtsAction(selectedIds);

                        if (result.error) {
                          setBanners((prev) => ({
                            ...prev,
                            [group.locationId]: {
                              type: "error",
                              text: result.error!,
                            },
                          }));
                          if (result.results?.length) {
                            applyResults(
                              group.locationId,
                              result.results,
                              setGroups,
                              setSelectedByLocation,
                            );
                          }
                          setPendingLocationId(null);
                          return;
                        }

                        if (result.results) {
                          applyResults(
                            group.locationId,
                            result.results,
                            setGroups,
                            setSelectedByLocation,
                          );
                        }

                        const failCount = result.failCount ?? 0;
                        const successCount = result.successCount ?? 0;
                        setBanners((prev) => ({
                          ...prev,
                          [group.locationId]: {
                            type:
                              failCount > 0
                                ? successCount > 0
                                  ? "warning"
                                  : "error"
                                : "success",
                            text:
                              result.summary ??
                              `${successCount} ürün bildirildi.`,
                          },
                        }));
                        setPendingLocationId(null);
                      });
                    }}
                    disabled={busy || selectedIds.length === 0}
                  >
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    {busy
                      ? "ÜTS’ye bildiriliyor…"
                      : "Seçili Ürünleri ÜTS’ye Bildir"}
                  </Button>
                </div>
                ) : (
                  <p className="text-xs text-zinc-500">
                    Gözlemci modu: bildirim gönderilemez.
                  </p>
                )}

                {banner ? (
                  <div
                    className={
                      banner.type === "error"
                        ? "rounded-md border border-red-500/30 bg-red-500/10 px-3 py-3 text-sm text-red-200"
                        : banner.type === "warning"
                          ? "rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm text-amber-100"
                          : "rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-200"
                    }
                    role="status"
                  >
                    <p className="whitespace-pre-line leading-relaxed">
                      {banner.text}
                    </p>
                  </div>
                ) : null}

                <Table>
                  <TableHeader>
                    <TableRow>
                      {canMutate ? (
                        <TableHead className="w-12">Seç</TableHead>
                      ) : null}
                      <TableHead>Ürün</TableHead>
                      <TableHead>Lot</TableHead>
                      <TableHead>Fatura</TableHead>
                      <TableHead>Bildirim Durumu</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.items.map((item) => (
                      <TableRow
                        key={item.id}
                        className={
                          item.errorMessage
                            ? "bg-red-500/5 hover:bg-red-500/10"
                            : undefined
                        }
                      >
                        {canMutate ? (
                          <TableCell>
                            <input
                              type="checkbox"
                              className="size-4 accent-blue-500"
                              checked={!!selectedMap[item.id]}
                              disabled={busy}
                              onChange={(e) =>
                                setSelectedByLocation((prev) => ({
                                  ...prev,
                                  [group.locationId]: {
                                    ...prev[group.locationId],
                                    [item.id]: e.target.checked,
                                  },
                                }))
                              }
                            />
                          </TableCell>
                        ) : null}
                        <TableCell>
                          <p className="font-medium text-white">
                            {item.referenceCode} {item.productName}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {item.brand}
                            {item.sizeLabel ? ` · ${item.sizeLabel}` : ""}
                          </p>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-blue-300">
                            {item.lotNumber}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs text-zinc-400">
                            {item.invoiceNo ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell>
                          {item.errorMessage ? (
                            <div className="max-w-sm space-y-1">
                              <p className="text-xs font-medium uppercase tracking-wide text-red-300">
                                Hata
                              </p>
                              <p className="text-sm leading-snug text-red-200">
                                {item.errorMessage}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-zinc-500">
                              Bildirim bekliyor
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function applyResults(
  locationId: string,
  results: Array<{ id: string; success: boolean; errorMessage?: string }>,
  setGroups: Dispatch<SetStateAction<GroupState[]>>,
  setSelectedByLocation: Dispatch<
    SetStateAction<Record<string, Record<string, boolean>>>
  >,
) {
  const successIds = new Set(
    results.filter((r) => r.success).map((r) => r.id),
  );
  const errorById = new Map(
    results
      .filter((r) => !r.success)
      .map((r) => [r.id, r.errorMessage ?? "Hata: Bildirim başarısız."]),
  );

  setGroups((prev) =>
    prev
      .map((g) => {
        if (g.locationId !== locationId) return g;
        const items = g.items
          .filter((item) => !successIds.has(item.id))
          .map((item) =>
            errorById.has(item.id)
              ? { ...item, errorMessage: errorById.get(item.id) }
              : item,
          );
        return {
          ...g,
          items,
          pendingCount: items.length,
        };
      })
      .filter((g) => g.pendingCount > 0),
  );

  setSelectedByLocation((prev) => {
    const current = { ...(prev[locationId] ?? {}) };
    for (const id of successIds) {
      delete current[id];
    }
    return { ...prev, [locationId]: current };
  });
}
