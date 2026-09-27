import { cn } from "@/lib/utils";

/**
 * A small trend line for KPI cards: green when the period went up, red when it
 * went down, grey when there is nothing to compare. It draws itself in from
 * the left like Kravio's.
 */
export function Sparkline({
  data,
  trend = "neutral",
  width = 92,
  height = 36,
  className,
  delay = 0,
}: {
  data: number[];
  trend?: "up" | "down" | "neutral";
  width?: number;
  height?: number;
  className?: string;
  delay?: number;
}) {
  if (data.length < 2) return null;

  const color = trend === "up" ? "#059669" : trend === "down" ? "#ef4444" : "#9ca3af";
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const pad = 2;
  const step = (width - pad * 2) / (data.length - 1);
  const points = data.map((value, i) => {
    const x = pad + i * step;
    // A flat series sits in the middle rather than on the floor.
    const y = max === min ? height / 2 : pad + (1 - (value - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const line = points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  // Server-safe gradient id: derived from the drawing, no hooks needed.
  const id = hash(`${trend}${line}`);
  const area = `${line} L${points[points.length - 1][0].toFixed(2)} ${height} L${points[0][0].toFixed(2)} ${height} Z`;

  return (
    <svg
      aria-hidden
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      className={cn("block shrink-0 animate-kv-draw", className)}
      style={{ animationDelay: `${delay}ms` }}
    >
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.14} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${id})`} />
      <path d={line} stroke={color} strokeWidth={1.2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function hash(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
