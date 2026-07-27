import Link from "next/link";
import { ArrowLeftRight, Boxes, PackageMinus, PackagePlus } from "lucide-react";
import type { WarehouseDashboardData } from "@/lib/actions/dashboard";
import { CriticalStockPanel } from "@/components/dashboard/critical-stock-panel";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function WarehouseDashboard({
  data,
}: {
  data: WarehouseDashboardData;
}) {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-xs tracking-[0.25em] text-blue-400 uppercase">
            Depo
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Özet</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Kritik stoklar, günlük çıkışlar ve ürün çeşitleri — fiyat yok.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/malkabul"
            className={buttonVariants({ variant: "outline" })}
          >
            <PackagePlus className="size-4" />
            Mal Kabul
          </Link>
          <Link href="/dashboard/transfers" className={buttonVariants()}>
            <ArrowLeftRight className="size-4" />
            Transferler
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <CardTitle>Günlük Çıkışlar</CardTitle>
            <PackageMinus className="size-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <p className="font-mono text-2xl font-semibold text-white">
              {data.todayOutboundQty.toLocaleString("tr-TR")}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Bugün transfer edilen / çıkışı yapılan ürün adedi
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <CardTitle>Toplam Ürün Çeşidi</CardTitle>
            <Boxes className="size-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <p className="font-mono text-2xl font-semibold text-white">
              {data.activeProductCount.toLocaleString("tr-TR")}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Aktif ürün referans sayısı
            </p>
          </CardContent>
        </Card>
      </div>

      <CriticalStockPanel items={data.criticalStocks} />
    </div>
  );
}
