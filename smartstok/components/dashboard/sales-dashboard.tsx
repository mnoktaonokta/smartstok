import Link from "next/link";
import { ArrowLeftRight, Package, Users } from "lucide-react";
import type { SalesDashboardData } from "@/lib/actions/dashboard";
import { SalesAgendaCard } from "@/components/dashboard/sales-agenda-card";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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

function formatTry(n: number) {
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function SalesDashboard({ data }: { data: SalesDashboardData }) {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-xs tracking-[0.25em] text-blue-400 uppercase">
            Saha Satış
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Özet</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Konsinye stok, müşteriler, hatırlatmalar ve son transferler.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/transfers"
            className={buttonVariants({ variant: "outline" })}
          >
            <ArrowLeftRight className="size-4" />
            Transferler
          </Link>
          <Link href="/dashboard/customers" className={buttonVariants()}>
            <Users className="size-4" />
            Müşteriler
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <CardTitle>Kliniklerdeki Ürünler</CardTitle>
            <Package className="size-4 text-blue-400" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-zinc-500">Konsinyede bekleyen adet</p>
              <p className="font-mono text-2xl font-semibold text-white">
                {data.consignmentQty.toLocaleString("tr-TR")}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Satış değeri</p>
              <p className="font-mono text-xl font-semibold text-blue-300">
                {formatTry(data.consignmentSaleValue)} ₺
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <CardTitle>Aktif Müşteriler</CardTitle>
            <Users className="size-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <p className="font-mono text-2xl font-semibold text-white">
              {data.activeCustomerCount.toLocaleString("tr-TR")}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Sistemde kayıtlı klinik / müşteri
            </p>
          </CardContent>
        </Card>
      </div>

      <SalesAgendaCard initialTasks={data.pendingTasks} />

      <Card>
        <CardHeader>
          <CardTitle>Son Transferler</CardTitle>
          <CardDescription>
            Son 5 transfer işlemi — klinik, zaman ve adet
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Zaman</TableHead>
                <TableHead>Klinik</TableHead>
                <TableHead>Ürün</TableHead>
                <TableHead className="text-right">Adet</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recentTransfers.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-8 text-center text-zinc-500"
                  >
                    Henüz transfer yok.
                  </TableCell>
                </TableRow>
              ) : (
                data.recentTransfers.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="whitespace-nowrap text-zinc-400">
                      {new Date(row.createdAt).toLocaleString("tr-TR")}
                    </TableCell>
                    <TableCell className="text-zinc-200">
                      {row.clinicName}
                    </TableCell>
                    <TableCell>
                      <span className="text-white">{row.productName}</span>
                      <span className="mt-0.5 block font-mono text-xs text-blue-300">
                        {row.referenceCode}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-blue-200">
                      {row.quantity}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
