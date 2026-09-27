"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type AnalyticsPoint = {
  label: string;
  views: number;
  orders: number;
};

export function AnalyticsLineChart({ data }: { data: AnalyticsPoint[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="viewsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#18181b" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#18181b" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="ordersFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#f4f4f5" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="#a1a1aa"
            fontSize={11}
            tickMargin={6}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="#a1a1aa"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={32}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              borderColor: "#e4e4e7",
              fontSize: 12,
            }}
            labelStyle={{ color: "#52525b", fontWeight: 500 }}
          />
          <Legend
            iconType="circle"
            wrapperStyle={{ fontSize: 11, color: "#52525b", paddingTop: 8 }}
          />
          <Area
            type="monotone"
            dataKey="views"
            name="Tampilan halaman"
            stroke="#18181b"
            strokeWidth={2}
            fill="url(#viewsFill)"
          />
          <Area
            type="monotone"
            dataKey="orders"
            name="Order"
            stroke="#10b981"
            strokeWidth={2}
            fill="url(#ordersFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
