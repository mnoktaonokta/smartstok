"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { TransferPageData } from "@/lib/actions/transfers";
import { TransferForm } from "@/components/transfers/transfer-form";
import { BarcodeBasketTransfer } from "@/components/transfers/barcode-basket-transfer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type AccordionId = "classic" | "barcode" | null;

export function TransfersWorkspace({
  data,
  canMutate = true,
}: {
  data: TransferPageData;
  canMutate?: boolean;
}) {
  const [openSection, setOpenSection] = useState<AccordionId>(null);

  function toggle(id: Exclude<AccordionId, null>) {
    setOpenSection((prev) => (prev === id ? null : id));
  }

  return (
    <div className="space-y-8">
      {!canMutate ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Gözlemci modu: transfer geçmişini görebilirsiniz; yeni transfer
          oluşturamazsınız.
        </p>
      ) : null}

      {canMutate ? (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/60">
          <div className="grid grid-cols-1 sm:grid-cols-2">
            <TransferAccordionTrigger
              title="Klasik Transfer"
              description="Ürün seçerek lot ve adet girin."
              open={openSection === "classic"}
              onToggle={() => toggle("classic")}
              className="sm:border-r sm:border-zinc-800"
            />
            <TransferAccordionTrigger
              title="Barkodlu Hızlı İşlem"
              description="Barkod okutup sepete ekleyin, tek seferde transfer edin."
              open={openSection === "barcode"}
              onToggle={() => toggle("barcode")}
            />
          </div>

          {openSection === "classic" ? (
            <div className="border-t border-zinc-800 px-5 py-5">
              <TransferForm
                data={{
                  locations: data.locations,
                  fieldUsers: data.fieldUsers,
                }}
              />
            </div>
          ) : null}

          {openSection === "barcode" ? (
            <div className="border-t border-zinc-800 px-5 py-5">
              <BarcodeBasketTransfer
                locations={data.locations}
                fieldUsers={data.fieldUsers}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-3">
        <h2 className="text-lg font-medium text-white">Son Transferler</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tarih</TableHead>
              <TableHead>Ürün / Lot</TableHead>
              <TableHead>Adet</TableHead>
              <TableHead>Nereden → Nereye</TableHead>
              <TableHead>Talep Eden</TableHead>
              <TableHead>İşleyen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.recentTransfers.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-zinc-500"
                >
                  Henüz transfer kaydı yok.
                </TableCell>
              </TableRow>
            ) : (
              data.recentTransfers.map((log) => (
                <TableRow key={log.key}>
                  <TableCell className="whitespace-nowrap text-zinc-400">
                    {new Date(log.createdAt).toLocaleString("tr-TR")}
                  </TableCell>
                  <TableCell>
                    <span className="text-white">
                      {log.referenceCode} {log.productName}
                    </span>
                    <span className="mt-0.5 block font-mono text-xs text-blue-300">
                      Lot {log.lotNumber}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-lg text-blue-200">
                      {log.quantity}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-zinc-300">
                    <span className="text-zinc-400">{log.fromName}</span>
                    <span className="mx-1.5 text-blue-400">→</span>
                    <span>{log.toName}</span>
                  </TableCell>
                  <TableCell>{log.requestedByName ?? "—"}</TableCell>
                  <TableCell>{log.executedByName}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function TransferAccordionTrigger({
  title,
  description,
  open,
  onToggle,
  className,
}: {
  title: string;
  description: string;
  open: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        "flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-zinc-900/50",
        open && "bg-blue-600/10",
        className,
      )}
    >
      <div>
        <p className="text-base font-medium text-white">{title}</p>
        <p className="mt-0.5 text-sm text-zinc-500">{description}</p>
      </div>
      <ChevronDown
        className={cn(
          "size-5 shrink-0 text-zinc-400 transition-transform duration-200",
          open && "rotate-180 text-blue-300",
        )}
        aria-hidden
      />
    </button>
  );
}
