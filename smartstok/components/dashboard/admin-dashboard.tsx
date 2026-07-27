import Link from "next/link";
import {
  ClipboardList,
  FilePlus2,
  Package,
  Radio,
  Wallet,
} from "lucide-react";
import type { DashboardData } from "@/lib/actions/dashboard";
import {
  SalesTrendChart,
  TopClinicsChart,
} from "@/components/dashboard/dashboard-charts";
import { CriticalStockPanel } from "@/components/dashboard/critical-stock-panel";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function formatTry(n: number) {
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function AdminDashboard({
  data,
  canMutate = true,
  showCriticalStocks = false,
}: {
  data: DashboardData;
  canMutate?: boolean;
  showCriticalStocks?: boolean;
}) {
  const { stats } = data;

  const statCards = [
    {
      title: "Konsinyedeki Toplam Stok Değeri",
      value: `${formatTry(stats.consignmentStockValue)} ₺`,
      hint: "Klinik depolardaki müsait stok · satış değeri",
      icon: Package,
    },
    {
      title: "Bekleyen ÜTS Bildirimi",
      value: String(stats.pendingUtsCount),
      hint: "Faturalanmış, ÜTS bildirimi bekleyen ürün",
      icon: Radio,
      href: "/dashboard/uts-tracking",
    },
    {
      title: "Cari Alacak Toplamı",
      value: `${formatTry(stats.receivablesTotal)} ₺`,
      hint: "Faturalanan net tutar (ödeme kaydı yok)",
      icon: Wallet,
    },
    {
      title: "Bu Ay Kesilen Fatura Hacmi",
      value: `${formatTry(stats.monthInvoiceVolume)} ₺`,
      hint: "Bu ay oluşturulan faturaların net toplamı",
      icon: ClipboardList,
      href: "/dashboard/invoices",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-xs tracking-[0.25em] text-blue-400 uppercase">
            Yönetim
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">
            Kontrol Paneli
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Klinik stok, satış ve ÜTS özeti — anlık görünüm.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/uts-tracking"
            className={buttonVariants({ variant: "outline" })}
          >
            <Radio className="size-4" />
            ÜTS Takibine Git
          </Link>
          {canMutate ? (
            <Link href="/dashboard/invoices/new" className={buttonVariants()}>
              <FilePlus2 className="size-4" />
              Yeni Satış / Fatura
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          const inner = (
            <>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <CardTitle>{card.title}</CardTitle>
                <Icon className="size-4 shrink-0 text-blue-400" />
              </CardHeader>
              <CardContent>
                <p className="font-mono text-2xl font-semibold tracking-tight text-white">
                  {card.value}
                </p>
                <p className="mt-1 text-xs text-zinc-500">{card.hint}</p>
              </CardContent>
            </>
          );

          if (card.href) {
            return (
              <Link
                key={card.title}
                href={card.href}
                className="block transition-opacity hover:opacity-90"
              >
                <Card className="h-full hover:border-blue-500/40">{inner}</Card>
              </Link>
            );
          }

          return (
            <Card key={card.title} className="h-full">
              {inner}
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SalesTrendChart data={data.salesTrend} />
        <TopClinicsChart data={data.topClinics} />
      </div>

      {showCriticalStocks ? (
        <CriticalStockPanel items={data.criticalStocks} />
      ) : null}
    </div>
  );
}
