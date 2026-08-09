"use client";

import { useState } from "react";
import type { FailPageData } from "@/lib/fail/types";
import { Tabs } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FailIntakeForm } from "@/components/fail/fail-intake-form";
import { FailShipmentPanel } from "@/components/fail/fail-shipment-panel";
import { FailSupplierReceive } from "@/components/fail/fail-supplier-receive";
import { cn } from "@/lib/utils";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function FailWorkspace({ data }: { data: FailPageData }) {
  const [tab, setTab] = useState("intake");

  return (
    <div className="space-y-8">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Müşteri Özeti</CardTitle>
          </CardHeader>
          <CardContent>
            {data.customerSummary.length === 0 ? (
              <p className="text-sm text-muted-foreground">Henüz kayıt yok.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Müşteri</TableHead>
                    <TableHead className="text-right">Fail</TableHead>
                    <TableHead className="text-right">Alacak</TableHead>
                    <TableHead className="text-right">Kayıt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.customerSummary.map((c) => (
                    <TableRow key={c.customerId}>
                      <TableCell>{c.customerName}</TableCell>
                      <TableCell className="text-right font-mono">
                        {c.totalFailCount}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {c.totalCredit}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {c.intakeCount}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tedarikçi Özeti</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl border border-border p-3">
                <p className="text-xs text-muted-foreground">Gönderilen</p>
                <p className="mt-1 font-mono text-2xl font-semibold text-foreground">
                  {data.supplierSummary.sentTotal}
                </p>
              </div>
              <div className="rounded-xl border border-border p-3">
                <p className="text-xs text-muted-foreground">Beklenen</p>
                <p className="mt-1 font-mono text-2xl font-semibold text-amber-600">
                  {data.supplierSummary.pendingTotal}
                </p>
              </div>
              <div className="rounded-xl border border-border p-3">
                <p className="text-xs text-muted-foreground">Gelen</p>
                <p className="mt-1 font-mono text-2xl font-semibold text-emerald-600">
                  {data.supplierSummary.receivedTotal}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs
        tabs={[
          { id: "intake", label: "Müşteriden Fail Alma" },
          { id: "ship", label: "Tedarikçiye Gönder" },
          { id: "recv", label: "Tedarikçiden Teslim" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "intake" ? (
        <div className="space-y-8">
          <FailIntakeForm
            customers={data.customers}
            canMutate={data.canMutate}
          />
          <IntakeHistory groups={data.intakesByCustomer} />
        </div>
      ) : null}

      {tab === "ship" ? (
        <FailShipmentPanel
          aggregation={data.aggregation}
          canMutate={data.canMutate}
        />
      ) : null}

      {tab === "recv" ? (
        <FailSupplierReceive
          pending={data.pending}
          canMutate={data.canMutate}
          fallbackCustomerId={data.customers[0]?.id ?? ""}
        />
      ) : null}
    </div>
  );
}

function IntakeHistory({
  groups,
}: {
  groups: FailPageData["intakesByCustomer"];
}) {
  const [openId, setOpenId] = useState<string | null>(
    groups[0]?.customerId ?? null,
  );

  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
        Henüz müşteriden fail alma kaydı yok.
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground">
        Müşteriden alınan faillerin karşılığında verilen ürünler
      </h2>
      <div className="space-y-2">
        {groups.map((g) => {
          const open = openId === g.customerId;
          return (
            <div
              key={g.customerId}
              className="overflow-hidden rounded-2xl border border-border bg-card"
            >
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-3 text-left"
                onClick={() =>
                  setOpenId(open ? null : g.customerId)
                }
              >
                <span className="font-medium text-foreground">
                  {g.customerName}
                </span>
                <span className="text-xs text-muted-foreground">
                  {g.intakes.length} kayıt
                  {(() => {
                    const credit = g.intakes.reduce(
                      (s, i) => s + i.creditQuantity,
                      0,
                    );
                    return credit > 0 ? (
                      <span className="ml-2 text-blue-600 dark:text-blue-400">
                        Alacak: {credit}
                      </span>
                    ) : null;
                  })()}
                </span>
              </button>
              <div className={cn("border-t border-border", open ? "block" : "hidden")}>
                <ul className="divide-y divide-border">
                  {g.intakes.map((intake) => (
                    <li key={intake.id} className="space-y-2 px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-foreground">
                            {formatDate(intake.createdAt)}
                          </p>
                          {intake.createdByName ? (
                            <p className="text-xs text-muted-foreground">
                              Oluşturan: {intake.createdByName}
                            </p>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Fail {intake.failCount} · Verilen {intake.givenCount}
                          {intake.creditQuantity > 0 ? (
                            <span className="ml-2 text-blue-600">
                              Alacak {intake.creditQuantity}
                            </span>
                          ) : null}
                        </p>
                      </div>
                      {intake.specs.length > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Cins:{" "}
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
                      <ul className="space-y-1 text-xs">
                        {intake.givenProducts.map((p, i) => (
                          <li key={`${p.productId}-${p.disposition}-${i}`}>
                            <span className="font-mono">{p.referenceCode}</span>{" "}
                            {p.productName} × {p.quantity}
                            {p.disposition === "CONSIGNMENT_EXCESS" ? (
                              <span className="ml-2 text-amber-600">
                                (konsinye fazla)
                              </span>
                            ) : (
                              <span className="ml-2 text-muted-foreground">
                                (fail listesi)
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
