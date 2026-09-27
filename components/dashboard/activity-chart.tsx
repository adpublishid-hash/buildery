"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type ActivityChartPoint = {
  day: string;
  visits: number;
};

export function ActivityChart({ data }: { data: ActivityChartPoint[] }) {
  const hasData = data.some((point) => point.visits > 0);

  return (
    <div className="relative h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
        >
          <defs>
            <linearGradient id="visitsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#18181b" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#18181b" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#e4e4e7"
            vertical={false}
          />
          <XAxis
            dataKey="day"
            stroke="#a1a1aa"
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="#a1a1aa"
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ stroke: "#e4e4e7" }}
            contentStyle={{
              borderRadius: 10,
              border: "1px solid #e4e4e7",
              fontSize: 12,
              padding: "6px 10px",
            }}
            labelStyle={{ color: "#52525b", fontWeight: 500 }}
          />
          <Area
            type="monotone"
            dataKey="visits"
            name="Kunjungan"
            stroke="#18181b"
            strokeWidth={2}
            fill="url(#visitsGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
      {!hasData ? (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center">
          <p className="text-sm font-medium text-zinc-500">
            Belum ada kunjungan real dalam 7 hari terakhir.
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            Grafik akan terisi setelah halaman publik menerima traffic.
          </p>
        </div>
      ) : null}
    </div>
  );
}
