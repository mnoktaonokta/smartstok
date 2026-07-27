"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  ExternalLink,
  Loader2,
  Package,
  RefreshCw,
  Wallet,
  Warehouse,
} from "lucide-react";
import { getCustomerAbstractAction } from "@/lib/actions/bizim-hesap";
import type { BizimHesapAbstract } from "@/lib/services/bizimHesapTypes";
import type {
  CustomerConsignmentSummary,
  TaskRow,
  VisitRow,
} from "@/lib/actions/crm";
import {
  CustomerTasksPanel,
  CustomerVisitNotesPanel,
} from "@/components/customers/customer-crm-panels";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type CustomerDetail = {
  id: string;
  name: string;
  vknTckn: string;
  taxOffice: string | null;
  address: string | null;
  phone: string | null;
  bizimHesapId: string | null;
  invoiceCount: number;
  locations: Array<{ id: string; name: string }>;
};

function formatTry(n: number) {
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("tr-TR");
}

export function CustomerDetailTabs({
  customer,
  consignment,
  visits,
  tasks,
  canMutate,
}: {
  customer: CustomerDetail;
  consignment: CustomerConsignmentSummary;
  visits: VisitRow[];
  tasks: TaskRow[];
  canMutate: boolean;
}) {
  const [tab, setTab] = useState("crm");
  const [abstract, setAbstract] = useState<BizimHesapAbstract | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();

  function loadAbstract() {
    setError(null);
    startTransition(async () => {
      const result = await getCustomerAbstractAction(customer.id);
      if (result.error) {
        setError(result.error);
        setAbstract(null);
        setLoaded(true);
        return;
      }
      setAbstract(result.data ?? null);
      setLoaded(true);
    });
  }

  // Üst özet bakiyesi + cari sekmesi için lazy load
  useEffect(() => {
    if (loaded || isPending) return;
    if (!customer.bizimHesapId) {
      setLoaded(true);
      return;
    }
    loadAbstract();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab !== "finance" || loaded || isPending) return;
    loadAbstract();
  }, [tab, loaded, isPending]);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          icon={Wallet}
          label="Cari Bakiye"
          value={
            !customer.bizimHesapId
              ? "—"
              : isPending && !abstract
                ? "…"
                : abstract
                  ? `${formatTry(abstract.balance)} ₺`
                  : error
                    ? "Alınamadı"
                    : "—"
          }
          hint={
            customer.bizimHesapId
              ? "Bizim Hesap"
              : "Cari kodu tanımlı değil"
          }
          emphasize
        />
        <SummaryCard
          icon={Package}
          label="Konsinye Ürün"
          value={`${consignment.itemCount} adet`}
          hint={`${formatTry(consignment.saleValue)} ₺ satış değeri`}
        />
        <SummaryCard
          icon={Warehouse}
          label="Konsinye Depo"
          value={String(customer.locations.length)}
          hint={
            customer.locations[0]?.name ?? "Bağlı klinik deposu yok"
          }
        />
      </div>

      {consignment.productLines.length > 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
          <p className="mb-3 text-xs tracking-wide text-zinc-500 uppercase">
            Konsinye stok özeti (ilk 8)
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {consignment.productLines.slice(0, 8).map((line) => (
              <li
                key={line.referenceCode}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="min-w-0 truncate text-zinc-200">
                  <span className="font-mono text-blue-300">
                    {line.referenceCode}
                  </span>{" "}
                  {line.name}
                </span>
                <span className="shrink-0 font-mono text-zinc-400">
                  ×{line.quantity}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Tabs
        tabs={[
          { id: "crm", label: "Ziyaret & Görevler" },
          { id: "info", label: "Genel Bilgiler" },
          { id: "finance", label: "Cari Ekstre" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "crm" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-zinc-300">
              Ziyaret Notları
            </h2>
            <CustomerVisitNotesPanel
              customerId={customer.id}
              initialVisits={visits}
              canMutate={canMutate}
            />
          </section>
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-zinc-300">
              Görevler & Hatırlatıcılar
            </h2>
            <CustomerTasksPanel
              customerId={customer.id}
              customerName={customer.name}
              initialTasks={tasks}
              canMutate={canMutate}
            />
          </section>
        </div>
      ) : null}

      {tab === "info" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5">
            <h2 className="text-sm font-medium text-zinc-300">Kimlik</h2>
            <dl className="space-y-2 text-sm">
              <InfoRow label="Ünvan" value={customer.name} />
              <InfoRow label="VKN / TCKN" value={customer.vknTckn} mono />
              <InfoRow label="Vergi Dairesi" value={customer.taxOffice ?? "—"} />
              <InfoRow label="Telefon" value={customer.phone ?? "—"} />
              <InfoRow label="Adres" value={customer.address ?? "—"} />
              <InfoRow
                label="Bizim Hesap Cari Kodu"
                value={customer.bizimHesapId ?? "Tanımlı değil"}
                mono
                muted={!customer.bizimHesapId}
              />
              <InfoRow
                label="Fatura sayısı"
                value={String(customer.invoiceCount)}
              />
            </dl>
          </div>

          <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5">
            <h2 className="text-sm font-medium text-zinc-300">
              Konsinye Depolar
            </h2>
            {customer.locations.length === 0 ? (
              <p className="text-sm text-zinc-500">Bağlı depo yok.</p>
            ) : (
              <ul className="space-y-2">
                {customer.locations.map((loc) => (
                  <li key={loc.id}>
                    <Link
                      href={`/dashboard/depots/${loc.id}`}
                      className="flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2.5 text-sm text-zinc-200 transition-colors hover:border-blue-500/40 hover:bg-blue-500/5"
                    >
                      <Warehouse className="size-4 text-blue-400" />
                      {loc.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {tab === "finance" ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => {
                setLoaded(false);
                setAbstract(null);
              }}
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Yenile
            </Button>
          </div>

          {isPending && !abstract ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/40 py-16 text-zinc-400">
              <Loader2 className="size-6 animate-spin text-blue-400" />
              <p className="text-sm">Bizim Hesap cari ekstresi yükleniyor…</p>
            </div>
          ) : error ? (
            <p
              className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
              role="alert"
            >
              {error}
            </p>
          ) : abstract ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <BalanceCard
                  label="Güncel Toplam Bakiye"
                  value={abstract.balance}
                  emphasize
                />
                <BalanceCard label="Toplam Borç" value={abstract.debitSum} />
                <BalanceCard label="Toplam Alacak" value={abstract.creditSum} />
              </div>

              {abstract.link ? (
                <a
                  href={abstract.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300"
                >
                  Bizim Hesap’ta aç
                  <ExternalLink className="size-3.5" />
                </a>
              ) : null}

              <p className="text-xs text-zinc-500">
                Salt okunur görünüm · Veri kaynağı: Bizim Hesap
                {abstract.title ? ` · ${abstract.title}` : ""}
              </p>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tarih</TableHead>
                    <TableHead>İşlem Türü / Açıklama</TableHead>
                    <TableHead className="text-right">Borç</TableHead>
                    <TableHead className="text-right">Alacak</TableHead>
                    <TableHead className="text-right">Bakiye</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {abstract.lines.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="py-10 text-center text-zinc-500"
                      >
                        Ekstre hareketi bulunamadı.
                      </TableCell>
                    </TableRow>
                  ) : (
                    abstract.lines.map((line, idx) => (
                      <TableRow key={`${line.date}-${idx}`}>
                        <TableCell className="whitespace-nowrap text-zinc-400">
                          {formatDate(line.date)}
                        </TableCell>
                        <TableCell>
                          <p className="text-white">{line.type || "İşlem"}</p>
                          {line.note ? (
                            <p className="mt-0.5 text-xs text-zinc-500">
                              {line.note}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right font-mono text-red-300/90">
                          {line.debit > 0 ? `${formatTry(line.debit)} ₺` : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-emerald-300/90">
                          {line.credit > 0
                            ? `${formatTry(line.credit)} ₺`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-zinc-100">
                          {formatTry(line.balance)} ₺
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </>
          ) : (
            <p className="rounded-xl border border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500">
              Cari ekstre için Bizim Hesap cari kodu gerekli.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
  emphasize,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  hint: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-5",
        emphasize
          ? "border-blue-500/40 bg-blue-500/10"
          : "border-zinc-800 bg-zinc-950/60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs tracking-wide text-zinc-400 uppercase">{label}</p>
        <Icon className="size-4 shrink-0 text-blue-400" />
      </div>
      <p className="mt-2 font-mono text-xl font-semibold text-white">{value}</p>
      <p className="mt-1 truncate text-xs text-zinc-500">{hint}</p>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
  muted,
}: {
  label: string;
  value: string;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-zinc-500">{label}</dt>
      <dd
        className={cn(
          "text-right text-zinc-100",
          mono && "font-mono text-blue-300",
          muted && "text-amber-300/80",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function BalanceCard({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
}) {
  const negative = value < 0;
  return (
    <div
      className={cn(
        "rounded-2xl border p-5",
        emphasize
          ? "border-blue-500/40 bg-blue-500/10"
          : "border-zinc-800 bg-zinc-950/60",
      )}
    >
      <p className="text-xs tracking-wide text-zinc-400 uppercase">{label}</p>
      <p
        className={cn(
          "mt-2 font-mono text-2xl font-semibold",
          emphasize
            ? negative
              ? "text-red-300"
              : "text-blue-200"
            : "text-white",
        )}
      >
        {formatTry(value)} ₺
      </p>
    </div>
  );
}
