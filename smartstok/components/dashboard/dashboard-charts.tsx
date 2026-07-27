"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SalesTrendPoint, TopClinicPoint } from "@/lib/actions/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function formatTry(n: number) {
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

const tooltipStyle = {
  backgroundColor: "#09090b",
  border: "1px solid #27272a",
  borderRadius: 8,
  color: "#e4e4e7",
  fontSize: 12,
};

export function SalesTrendChart({ data }: { data: SalesTrendPoint[] }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-zinc-200">Satış Trendi</CardTitle>
        <p className="text-xs text-zinc-500">Son 7 gün fatura hacmi (net)</p>
      </CardHeader>
      <CardContent className="h-64">
        {data.every((d) => d.total === 0) ? (
          <EmptyChart message="Son 7 günde fatura kaydı yok." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "#71717a", fontSize: 11 }}
                axisLine={{ stroke: "#3f3f46" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#71717a", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatTry(Number(v))}
                width={56}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value) => [
                  `${formatTry(Number(value ?? 0))} ₺`,
                  "Hacim",
                ]}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#60a5fa"
                strokeWidth={2}
                fill="url(#salesFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function TopClinicsChart({ data }: { data: TopClinicPoint[] }) {
  const chartData = data.map((d) => ({
    name:
      d.clinicName.length > 22
        ? `${d.clinicName.slice(0, 20)}…`
        : d.clinicName,
    fullName: d.clinicName,
    quantity: d.quantity,
  }));

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-zinc-200">
          En Çok Konsinyede Ürünü Olan Klinikler
        </CardTitle>
        <p className="text-xs text-zinc-500">İlk 5 klinik · müsait stok adedi</p>
      </CardHeader>
      <CardContent className="h-64">
        {chartData.length === 0 ? (
          <EmptyChart message="Konsinye stoğu olan klinik yok." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
            >
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: "#71717a", fontSize: 11 }}
                axisLine={{ stroke: "#3f3f46" }}
                tickLine={false}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={110}
                tick={{ fill: "#a1a1aa", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value) => [`${value} adet`, "Stok"]}
                labelFormatter={(_, payload) =>
                  String(payload?.[0]?.payload?.fullName ?? "")
                }
              />
              <Bar dataKey="quantity" fill="#3b82f6" radius={[0, 6, 6, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-zinc-500">
      {message}
    </div>
  );
}
