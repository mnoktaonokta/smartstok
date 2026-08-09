"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { FailIntakeListItem } from "@/lib/fail/types";
import { cn } from "@/lib/utils";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function CustomerFailImplantPanel({
  intakes,
}: {
  intakes: FailIntakeListItem[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (intakes.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
        Bu müşteri için henüz fail alma kaydı yok.
      </div>
    );
  }

  const totalCredit = intakes.reduce((s, i) => s + i.creditQuantity, 0);

  return (
    <div className="space-y-3">
      {totalCredit > 0 ? (
        <p className="text-sm text-muted-foreground">
          Toplam alacak:{" "}
          <span className="font-mono text-blue-600 dark:text-blue-400">
            {totalCredit} adet
          </span>
        </p>
      ) : null}
      <ul className="space-y-2">
        {intakes.map((intake) => {
          const open = openId === intake.id;
          return (
            <li
              key={intake.id}
              className="overflow-hidden rounded-2xl border border-border bg-card"
            >
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                onClick={() => setOpenId(open ? null : intake.id)}
                aria-expanded={open}
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">
                    {formatDate(intake.createdAt)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Alınan fail:{" "}
                    <span className="font-mono text-foreground">
                      {intake.failCount}
                    </span>
                    {" · "}
                    Verilen:{" "}
                    <span className="font-mono text-foreground">
                      {intake.givenCount}
                    </span>
                    {intake.creditQuantity > 0 ? (
                      <>
                        {" · "}
                        <span className="text-blue-600 dark:text-blue-400">
                          Alacak: {intake.creditQuantity}
                        </span>
                      </>
                    ) : null}
                  </p>
                </div>
                <ChevronDown
                  className={cn(
                    "size-5 shrink-0 text-muted-foreground transition-transform",
                    open && "rotate-180",
                  )}
                />
              </button>
              <div
                className={cn(
                  "border-t border-border px-4 py-3",
                  open ? "block" : "hidden",
                )}
              >
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Karşılığında verilenler
                </p>
                {intake.givenProducts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ürün yok.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {intake.givenProducts.map((p, i) => (
                      <li key={`${p.productId}-${p.disposition}-${i}`}>
                        <span className="font-mono text-blue-600 dark:text-blue-400">
                          {p.referenceCode}
                        </span>{" "}
                        {p.productName} × {p.quantity}
                        {p.disposition === "CONSIGNMENT_EXCESS" ? (
                          <span className="ml-2 text-xs text-amber-600">
                            (konsinye fazla)
                          </span>
                        ) : (
                          <span className="ml-2 text-xs text-muted-foreground">
                            (fail listesi)
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {intake.specs.length > 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Alınan cins:{" "}
                    {intake.specs
                      .map((s) => {
                        const parts = [
                          s.diameter != null ? `Ø${s.diameter}` : null,
                          s.length != null ? `L${s.length}` : null,
                          s.lotNumber ? `Lot ${s.lotNumber}` : null,
                        ].filter(Boolean);
                        return parts.join(" ") || "—";
                      })
                      .join(" · ")}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
