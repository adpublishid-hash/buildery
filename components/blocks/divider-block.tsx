import type { DividerData } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";

const WIDTHS: Record<DividerData["width"], string> = {
  narrow: "max-w-2xl",
  wide: "max-w-5xl",
  full: "max-w-6xl",
  bleed: "max-w-none",
};

const SPACING: Record<DividerData["spacing"], string> = {
  xs: "py-4",
  sm: "py-6",
  md: "py-10",
  lg: "py-14",
  xl: "py-20",
};

const THICKNESS: Record<DividerData["thickness"], string> = {
  hairline: "border-t",
  thin: "border-t",
  medium: "border-t-2",
  thick: "border-t-4",
};

export function DividerBlock({ data }: { data: DividerData }) {
  const variant = data.variant ?? "line";
  const color = dividerColor(data);

  if (variant === "space") {
    return <div className={cn(SPACING[data.spacing ?? "md"])} aria-hidden />;
  }

  return (
    <section
      className={cn(
        "px-6 md:px-10",
        SPACING[data.spacing ?? "md"],
        data.width === "bleed" && "px-0 md:px-0"
      )}
    >
      <div
        className={cn(
          "mx-auto",
          WIDTHS[data.width ?? "wide"],
          data.align === "left" && "ml-0 mr-auto",
          data.align === "right" && "ml-auto mr-0"
        )}
      >
        {variant === "dots" ? (
          <Dots color={color} thickness={data.thickness} />
        ) : variant === "double" ? (
          <DoubleLine data={data} color={color} />
        ) : variant === "gradient" ? (
          <GradientLine data={data} color={color} />
        ) : variant === "label" ? (
          <LabelDivider data={data} color={color} />
        ) : variant === "icon" ? (
          <IconDivider data={data} color={color} />
        ) : variant === "wave" ? (
          <WaveDivider color={color} />
        ) : (
          <Line data={data} color={color} />
        )}
      </div>
    </section>
  );
}

function Line({ data, color }: { data: DividerData; color: string }) {
  return (
    <div
      className={cn(THICKNESS[data.thickness ?? "thin"], lineStyle(data))}
      style={{ borderColor: color }}
      aria-hidden
    />
  );
}

function DoubleLine({ data, color }: { data: DividerData; color: string }) {
  return (
    <div className="space-y-2" aria-hidden>
      <Line data={data} color={color} />
      <Line data={{ ...data, thickness: "hairline" }} color={color} />
    </div>
  );
}

function GradientLine({ data, color }: { data: DividerData; color: string }) {
  const height =
    data.thickness === "thick" ? "h-1" : data.thickness === "medium" ? "h-0.5" : "h-px";
  return (
    <div
      className={cn("rounded-full", height)}
      style={{
        background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
      }}
      aria-hidden
    />
  );
}

function Dots({
  color,
  thickness,
}: {
  color: string;
  thickness: DividerData["thickness"];
}) {
  const size =
    thickness === "thick"
      ? "h-2.5 w-2.5"
      : thickness === "medium"
        ? "h-2 w-2"
        : "h-1.5 w-1.5";

  return (
    <div className="flex items-center justify-center gap-2" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={cn("rounded-full", size)} style={{ backgroundColor: color }} />
      ))}
    </div>
  );
}

function LabelDivider({ data, color }: { data: DividerData; color: string }) {
  return (
    <div className="flex items-center gap-4">
      <div className={cn("flex-1", THICKNESS[data.thickness ?? "thin"], lineStyle(data))} style={{ borderColor: color }} />
      <span className="shrink-0 rounded-full border bg-white px-3 py-1 text-xs font-medium text-zinc-500" style={{ borderColor: color }}>
        {data.label || "Section"}
      </span>
      <div className={cn("flex-1", THICKNESS[data.thickness ?? "thin"], lineStyle(data))} style={{ borderColor: color }} />
    </div>
  );
}

function IconDivider({ data, color }: { data: DividerData; color: string }) {
  return (
    <div className="flex items-center gap-4">
      <div className={cn("flex-1", THICKNESS[data.thickness ?? "thin"], lineStyle(data))} style={{ borderColor: color }} />
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-white text-sm" style={{ borderColor: color, color }}>
        {data.icon || "*"}
      </span>
      <div className={cn("flex-1", THICKNESS[data.thickness ?? "thin"], lineStyle(data))} style={{ borderColor: color }} />
    </div>
  );
}

function WaveDivider({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 1200 80"
      role="presentation"
      aria-hidden
      className="h-10 w-full"
      preserveAspectRatio="none"
    >
      <path
        d="M0 40 C150 0 300 80 450 40 C600 0 750 80 900 40 C1050 0 1150 55 1200 40"
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function lineStyle(data: DividerData) {
  if (data.lineStyle === "dashed") return "border-dashed";
  if (data.lineStyle === "dotted") return "border-dotted";
  return "border-solid";
}

function dividerColor(data: DividerData) {
  if (data.color) return data.color;
  if (data.tone === "accent") return "var(--bd-accent, #18181b)";
  if (data.tone === "dark") return "#18181b";
  if (data.tone === "light") return "#f4f4f5";
  return "#d4d4d8";
}
