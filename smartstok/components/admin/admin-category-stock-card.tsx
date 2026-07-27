import type { CategoryStockBreakdown } from "@/lib/actions/admin";
import { cn } from "@/lib/utils";

const STYLE: Record<
  string,
  { bar: string; glow: string; accent: string }
> = {
  implant: {
    bar: "bg-blue-500",
    glow: "from-blue-500/20 to-transparent",
    accent: "text-blue-300",
  },
  abutment: {
    bar: "bg-fuchsia-500",
    glow: "from-fuchsia-500/20 to-transparent",
    accent: "text-fuchsia-300",
  },
  ara_parca: {
    bar: "bg-emerald-500",
    glow: "from-emerald-500/20 to-transparent",
    accent: "text-emerald-300",
  },
};

function formatCount(n: number) {
  return n.toLocaleString("tr-TR");
}

export function AdminCategoryStockCard({
  data,
}: {
  data: CategoryStockBreakdown;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white">
            Kategori Bazlı Stok
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            İmplant, abutment ve diğer bileşenlerin payı
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 font-mono text-xs text-zinc-300">
          {formatCount(data.total)} adet
        </span>
      </div>

      <div className="space-y-3">
        {data.buckets.map((bucket) => {
          const style = STYLE[bucket.key] ?? STYLE.implant;
          return (
            <div
              key={bucket.key}
              className={cn(
                "relative overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-r p-4",
                style.glow,
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-2">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {bucket.label}
                    </p>
                    <p className="text-xs text-zinc-500">{bucket.description}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-zinc-700 bg-zinc-950/80 px-2.5 py-1 text-[11px] text-zinc-300">
                      Depoda{" "}
                      <span className="font-mono text-zinc-100">
                        {formatCount(bucket.mainDepot)}
                      </span>{" "}
                      adet
                    </span>
                    <span className="rounded-full border border-zinc-700 bg-zinc-950/80 px-2.5 py-1 text-[11px] text-zinc-300">
                      Müşteride{" "}
                      <span className="font-mono text-zinc-100">
                        {formatCount(bucket.clinicDepot)}
                      </span>{" "}
                      adet
                    </span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-2xl font-semibold tracking-tight text-white">
                    {formatCount(bucket.total)}
                  </p>
                  <p className={cn("text-xs font-medium", style.accent)}>
                    %{bucket.percent}
                  </p>
                </div>
              </div>

              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={cn("h-full rounded-full transition-all", style.bar)}
                  style={{ width: `${Math.min(100, bucket.percent)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
