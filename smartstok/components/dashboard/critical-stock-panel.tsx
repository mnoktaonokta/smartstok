import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { CriticalStockAlarmItem } from "@/lib/actions/dashboard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function CriticalStockPanel({
  items,
}: {
  items: CriticalStockAlarmItem[];
}) {
  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-amber-100">
              Kritik Stoklar & Sipariş Listesi
            </CardTitle>
            <CardDescription className="mt-1">
              Merkez depo stoku alarm seviyesinin altında olan ürünler
            </CardDescription>
          </div>
          <AlertTriangle className="size-5 shrink-0 text-amber-400" />
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-5">
            <CheckCircle2 className="size-6 shrink-0 text-emerald-400" />
            <p className="text-sm font-medium text-emerald-200">
              Harika! Kritik seviyede ürün bulunmuyor.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-amber-500/15">
            {items.map((item) => (
              <li
                key={item.productId}
                className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="font-medium text-white">{item.name}</span>
                <span className="font-mono text-sm text-zinc-300">
                  Mevcut:{" "}
                  <span className="font-semibold text-red-400">
                    {item.currentStock}
                  </span>{" "}
                  / Sınır: {item.minStockLevel}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
