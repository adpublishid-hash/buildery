"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Check,
  ClipboardList,
  Eye,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Newspaper,
  Percent,
  Plus,
  ShoppingBag,
  Wallet,
} from "lucide-react";

import { cn } from "@/lib/utils";

/*
 * An interactive stand-in for the dashboard on the landing hero. It is drawn
 * with the dashboard's own surfaces (kv-frame strips, white cards, the dark
 * gradient for the active state) and every control does something small and
 * local, so a visitor can click around before signing up. No data leaves it.
 */

type View = "overview" | "pages" | "store" | "courses";
type Metric = "visitors" | "revenue" | "conversion";
type Range = 7 | 14;

const VIEWS: { id: View; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Ringkasan", icon: LayoutDashboard },
  { id: "pages", label: "Halaman", icon: FileText },
  { id: "store", label: "Toko", icon: ShoppingBag },
  { id: "courses", label: "Kursus", icon: GraduationCap },
];

const DAYS = [
  "13 Sep", "14 Sep", "15 Sep", "16 Sep", "17 Sep", "18 Sep", "19 Sep",
  "20 Sep", "21 Sep", "22 Sep", "23 Sep", "24 Sep", "25 Sep", "26 Sep",
];

const SERIES: Record<Metric, number[]> = {
  visitors: [820, 940, 870, 1120, 1040, 690, 910, 1060, 1280, 1190, 1010, 1390, 1270, 1480],
  revenue: [2.1, 3.4, 2.8, 4.9, 4.2, 1.6, 3.1, 3.9, 5.6, 4.8, 3.6, 6.2, 5.1, 6.9],
  conversion: [3.1, 3.6, 3.3, 4.4, 4.0, 2.7, 3.5, 3.9, 4.8, 4.5, 3.8, 4.9, 4.6, 5.2],
};

const METRICS: { id: Metric; label: string; icon: LucideIcon; delta: Record<Range, string> }[] = [
  { id: "visitors", label: "Pengunjung", icon: Eye, delta: { 7: "+12,4%", 14: "+9,1%" } },
  { id: "revenue", label: "Pendapatan", icon: Wallet, delta: { 7: "+8,8%", 14: "+15,2%" } },
  { id: "conversion", label: "Konversi", icon: Percent, delta: { 7: "−1,3%", 14: "+0,6%" } },
];

function formatMetric(metric: Metric, value: number) {
  if (metric === "visitors") return Math.round(value).toLocaleString("id-ID");
  if (metric === "revenue") return `Rp ${value.toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  return `${value.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function total(metric: Metric, values: number[]) {
  const sum = values.reduce((a, b) => a + b, 0);
  return metric === "conversion" ? sum / values.length : sum;
}

export function ProductPreview() {
  const [view, setView] = useState<View>("overview");

  return (
    <div className="rounded-[16px] border-[0.8px] border-kv-border bg-kv-bg p-[4px] text-left shadow-[0_24px_60px_-24px_rgba(31,41,55,0.25)] sm:p-[6px]">
      {/* browser chrome */}
      <div className="flex items-center gap-[6px] px-[8px] pb-[6px] pt-[2px]">
        <span className="h-[8px] w-[8px] rounded-full bg-[#e5e7eb]" />
        <span className="h-[8px] w-[8px] rounded-full bg-[#e5e7eb]" />
        <span className="h-[8px] w-[8px] rounded-full bg-[#e5e7eb]" />
        <span className="ml-[8px] hidden h-[18px] flex-1 max-w-[220px] items-center rounded-[6px] bg-white/80 px-[8px] text-[10px] text-kv-subtle shadow-[inset_0_0_0_0.8px_rgb(229,231,235)] sm:flex">
          app.mylanding.id/dashboard
        </span>
        <span className="ml-auto flex items-center gap-[6px] text-[11px] text-kv-muted-fg">
          <span className="relative flex h-[6px] w-[6px]">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-kv-success opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex h-[6px] w-[6px] rounded-full bg-kv-success" />
          </span>
          Interaktif — coba klik
        </span>
      </div>

      <div className="flex overflow-hidden rounded-[12px]">
        {/* sidebar (md+) */}
        <nav aria-label="Menu demo" className="hidden w-[168px] shrink-0 flex-col gap-[2px] p-[10px] md:flex">
          <p className="px-[8px] pb-[6px] text-[10px] uppercase tracking-[0.04em] text-kv-muted-fg">Menu utama</p>
          {VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              aria-pressed={view === item.id}
              className={cn(
                "flex h-[30px] items-center gap-[8px] rounded-[7px] px-[8px] text-[12px] outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-kv-ring/40",
                view === item.id
                  ? "border-[0.8px] border-kv-border bg-white text-kv-fg shadow-kv-active"
                  : "text-kv-secondary-fg hover:bg-black/[0.03] hover:text-kv-fg"
              )}
            >
              <item.icon className="h-[14px] w-[14px]" strokeWidth={1.6} />
              {item.label}
            </button>
          ))}
        </nav>

        {/* Fixed height from md up so switching views never shifts the page. */}
        <div className="min-w-0 flex-1 rounded-[12px] bg-white p-[12px] shadow-[inset_0_0_0_0.8px_rgb(229,231,235)] sm:p-[16px] md:min-h-[416px]">
          {/* tabs (mobile) */}
          <div
            role="tablist"
            aria-label="Menu demo"
            className="-mx-[2px] mb-[12px] flex gap-[4px] overflow-x-auto px-[2px] pb-[2px] [scrollbar-width:none] md:hidden"
          >
            {VIEWS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={view === item.id}
                onClick={() => setView(item.id)}
                className={cn(
                  "flex h-[30px] shrink-0 items-center gap-[6px] rounded-[8px] border-[0.8px] px-[10px] text-[12px] font-medium",
                  view === item.id
                    ? "kv-gradient border-kv-fg text-white"
                    : "border-kv-border bg-kv-card text-kv-secondary-fg"
                )}
              >
                <item.icon className="h-[13px] w-[13px]" strokeWidth={1.8} />
                {item.label}
              </button>
            ))}
          </div>

          <div key={view} className="animate-kv-fade">
            {view === "overview" ? <OverviewView /> : null}
            {view === "pages" ? <PagesView /> : null}
            {view === "store" ? <StoreView /> : null}
            {view === "courses" ? <CoursesView /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Frame({
  title,
  icon: Icon,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("kv-frame flex min-w-0 flex-col p-[4px]", className)}>
      <div className="flex min-h-[28px] items-center justify-between gap-[8px] px-[8px] py-[4px]">
        <h3 className="flex items-center gap-[6px] truncate text-[12px] font-medium leading-none text-kv-secondary-fg">
          {Icon ? <Icon className="h-[13px] w-[13px] shrink-0" strokeWidth={1.6} /> : null}
          {title}
        </h3>
        {action}
      </div>
      <div className={cn("min-w-0 flex-1 rounded-[10px] border-[0.8px] border-kv-input bg-kv-card", bodyClassName)}>
        {children}
      </div>
    </section>
  );
}

function Heading({ title, sub, action }: { title: string; sub: string; action?: React.ReactNode }) {
  return (
    <div className="mb-[14px] flex items-center justify-between gap-[12px]">
      <div className="min-w-0">
        <p className="truncate text-[16px] font-semibold leading-none text-kv-fg sm:text-[18px]">{title}</p>
        <p className="mt-[6px] truncate text-[12px] text-kv-muted-fg">{sub}</p>
      </div>
      {action}
    </div>
  );
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-[7px] border-[0.8px] border-kv-border bg-kv-card p-[2px]">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-[20px] rounded-[5px] px-[8px] text-[11px] font-medium leading-none transition-colors",
            value === option.value ? "kv-gradient text-white" : "text-kv-muted-fg hover:text-kv-fg"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------- Ringkasan ---------------------------- */

const FEED = [
  { icon: Wallet, title: "Order Dibayar", body: "Dewi · #INV-1042", time: "08.14", kind: "order" },
  { icon: ClipboardList, title: "Form Terisi", body: "Konsultasi Gratis", time: "08.02", kind: "form" },
  { icon: GraduationCap, title: "Pendaftaran Kursus", body: "Nadia · Kelas SEO", time: "07.41", kind: "course" },
  { icon: Wallet, title: "Order Dibayar", body: "Raka · #INV-1041", time: "07.12", kind: "order" },
  { icon: ClipboardList, title: "Form Terisi", body: "Waitlist Webinar", time: "06.55", kind: "form" },
] as const;

function OverviewView() {
  const [metric, setMetric] = useState<Metric>("visitors");
  const [range, setRange] = useState<Range>(7);
  const [active, setActive] = useState<number | null>(null);
  const [feedFilter, setFeedFilter] = useState<"all" | "order" | "form">("all");

  const values = SERIES[metric].slice(-range);
  const days = DAYS.slice(-range);
  const max = Math.max(...values);
  const shown = active ?? values.length - 1;
  const feed = FEED.filter((item) => feedFilter === "all" || item.kind === feedFilter).slice(0, 3);

  return (
    <>
      <Heading
        title="Halo, Nadia 👋"
        sub="Klik kartu untuk mengganti grafik."
        action={
          <Segmented
            label="Periode"
            value={range}
            onChange={(next) => {
              setRange(next);
              setActive(null);
            }}
            options={[
              { value: 7, label: "7 hari" },
              { value: 14, label: "14 hari" },
            ]}
          />
        }
      />

      <div className="flex flex-col gap-[10px] lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-[10px]">
          <div className="-mx-[2px] grid auto-cols-[minmax(148px,1fr)] grid-flow-col gap-[8px] overflow-x-auto px-[2px] pb-[2px] [scrollbar-width:none] sm:grid-flow-row sm:grid-cols-3 sm:overflow-visible">
            {METRICS.map((m) => {
              const selected = metric === m.id;
              const delta = m.delta[range];
              const negative = delta.startsWith("−");
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setMetric(m.id);
                    setActive(null);
                  }}
                  className={cn(
                    "kv-frame group flex flex-col p-[3px] text-left outline-none transition-shadow focus-visible:ring-[3px] focus-visible:ring-kv-ring/40",
                    selected && "shadow-[inset_0_0_0_1px_#1f2937]"
                  )}
                >
                  <span className="flex w-full items-center justify-between px-[7px] py-[5px] text-[12px] font-medium leading-none text-kv-secondary-fg">
                    {m.label}
                    <m.icon className="h-[13px] w-[13px]" strokeWidth={1.6} />
                  </span>
                  <span className="flex w-full flex-col gap-[6px] rounded-[9px] border-[0.8px] border-kv-border bg-kv-card px-[10px] py-[9px] leading-none transition-transform duration-300 ease-out-expo group-hover:-translate-y-px">
                    <span className="kv-tabular text-[17px] font-semibold tracking-[-0.01em] text-kv-fg sm:text-[18px]">
                      {formatMetric(m.id, total(m.id, SERIES[m.id].slice(-range)))}
                    </span>
                    <span className="text-[11px]">
                      <span className={negative ? "text-kv-destructive" : "text-kv-success"}>{delta}</span>
                      <span className="text-kv-muted-fg"> vs periode lalu</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <Frame
            title={`Tren ${METRICS.find((m) => m.id === metric)!.label}`}
            icon={BarChart3}
            action={
              <span className="kv-tabular text-[11px] text-kv-muted-fg">
                {days[shown]} · <span className="font-medium text-kv-fg">{formatMetric(metric, values[shown])}</span>
              </span>
            }
            bodyClassName="p-[10px] sm:p-[12px]"
          >
            <div
              className="flex h-[120px] items-end gap-[3px] sm:h-[150px] sm:gap-[6px]"
              onMouseLeave={() => setActive(null)}
            >
              {values.map((value, i) => {
                const on = i === shown;
                return (
                  <button
                    key={`${metric}-${range}-${i}`}
                    type="button"
                    aria-label={`${days[i]}: ${formatMetric(metric, value)}`}
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onClick={() => setActive(i)}
                    className="group/bar relative flex h-full flex-1 items-end outline-none"
                  >
                    <span
                      className={cn(
                        "w-full origin-bottom animate-kv-grow rounded-b-[3px] rounded-t-[5px] transition-colors duration-200",
                        on
                          ? "kv-gradient"
                          : "bg-gradient-to-b from-[#e6e6e6] to-[rgba(230,230,230,0.6)] shadow-[inset_0_0_0_0.444px_#d8d8d8,inset_0px_0px_0px_1px_white] group-hover/bar:from-[#d9d9d9]"
                      )}
                      style={{ height: `${Math.max(8, (value / max) * 100)}%`, animationDelay: `${i * 30}ms` }}
                    />
                  </button>
                );
              })}
            </div>
            <div className="mt-[6px] flex justify-between text-[10px] text-kv-subtle">
              <span>{days[0]}</span>
              <span>{days[days.length - 1]}</span>
            </div>
          </Frame>
        </div>

        <Frame
          title="Aktivitas"
          icon={Newspaper}
          className="lg:w-[230px] lg:shrink-0"
          bodyClassName="flex flex-col gap-[10px] p-[10px]"
        >
          <Segmented
            label="Filter aktivitas"
            value={feedFilter}
            onChange={setFeedFilter}
            options={[
              { value: "all", label: "Semua" },
              { value: "order", label: "Order" },
              { value: "form", label: "Form" },
            ]}
          />
          <ul className="flex flex-col gap-[10px]">
            {feed.map((item) => (
              <li key={item.body} className="flex animate-kv-fade items-start gap-[8px]">
                <span className="flex rounded-[7px] border-[0.8px] border-kv-input bg-white p-[6px] text-kv-secondary-fg">
                  <item.icon className="h-[12px] w-[12px]" strokeWidth={1.6} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-[4px] pt-[1px] text-[11px] leading-none">
                  <span className="flex justify-between gap-[6px]">
                    <span className="truncate font-medium text-kv-fg">{item.title}</span>
                    <span className="shrink-0 text-kv-subtle">{item.time}</span>
                  </span>
                  <span className="truncate text-kv-subtle">{item.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </Frame>
      </div>
    </>
  );
}

/* ----------------------------- Halaman ----------------------------- */

type DemoPage = { title: string; slug: string; live: boolean; views: number };

const INITIAL_PAGES: DemoPage[] = [
  { title: "Beranda", slug: "/", live: true, views: 4210 },
  { title: "Kelas SEO Dasar", slug: "/kelas-seo", live: true, views: 1860 },
  { title: "Tentang Kami", slug: "/tentang", live: true, views: 640 },
  { title: "Roadmap", slug: "/roadmap", live: false, views: 0 },
];

function PagesView() {
  const [pages, setPages] = useState(INITIAL_PAGES);
  const added = pages.length > INITIAL_PAGES.length;
  const live = pages.filter((p) => p.live).length;

  return (
    <>
      <Heading
        title="Halaman"
        sub={`${live} dari ${pages.length} halaman tayang · klik status untuk publish`}
        action={
          <button
            type="button"
            disabled={added}
            onClick={() => setPages((list) => [...list, { title: "Promo 12.12", slug: "/promo-1212", live: false, views: 0 }])}
            className="kv-gradient flex h-[28px] shrink-0 items-center gap-[4px] rounded-[7px] px-[10px] text-[12px] font-medium text-white disabled:opacity-50"
          >
            <Plus className="h-[13px] w-[13px]" /> <span className="hidden sm:inline">Halaman</span> baru
          </button>
        }
      />
      <Frame title="Semua halaman" icon={FileText} bodyClassName="overflow-hidden">
        <ul>
          {pages.map((page, i) => (
            <li
              key={page.slug}
              className="flex animate-kv-fade items-center gap-[10px] border-b border-black/[0.06] px-[12px] py-[9px] last:border-b-0"
            >
              <span className="min-w-0 flex-1 leading-none">
                <span className="block truncate text-[13px] font-medium text-kv-fg">{page.title}</span>
                <span className="mt-[4px] block truncate text-[11px] text-kv-subtle">mylanding.id{page.slug}</span>
              </span>
              <span className="kv-tabular hidden w-[70px] text-right text-[12px] text-kv-muted-fg sm:block">
                {page.views.toLocaleString("id-ID")} view
              </span>
              <button
                type="button"
                aria-pressed={page.live}
                onClick={() =>
                  setPages((list) => list.map((p, j) => (j === i ? { ...p, live: !p.live } : p)))
                }
                className={cn(
                  "flex h-[22px] w-[76px] shrink-0 items-center justify-center gap-[5px] rounded-[6px] border-[0.8px] text-[11px] font-medium transition-colors",
                  page.live
                    ? "border-kv-border bg-kv-card text-kv-secondary-fg hover:bg-kv-hover"
                    : "border-dashed border-kv-border text-kv-muted-fg hover:border-kv-fg hover:text-kv-fg"
                )}
              >
                <span className={cn("h-[6px] w-[6px] rounded-full", page.live ? "bg-kv-success" : "bg-kv-subtle/60")} />
                {page.live ? "Publish" : "Draft"}
              </button>
            </li>
          ))}
        </ul>
      </Frame>
    </>
  );
}

/* ------------------------------ Toko ------------------------------- */

const STATUSES = ["Menunggu", "Dibayar", "Dikirim"] as const;
type OrderStatus = (typeof STATUSES)[number];

const INITIAL_ORDERS: { id: string; name: string; item: string; total: number; status: OrderStatus }[] = [
  { id: "1044", name: "Sari", item: "Canvas Tote Bag", total: 120000, status: "Menunggu" },
  { id: "1043", name: "Bima", item: "Notion Template", total: 60000, status: "Menunggu" },
  { id: "1042", name: "Dewi", item: "Classic Tee ×2", total: 300000, status: "Dibayar" },
  { id: "1041", name: "Raka", item: "Sticker Pack", total: 35000, status: "Dikirim" },
];

function StoreView() {
  const [orders, setOrders] = useState(INITIAL_ORDERS);
  const paid = orders.filter((o) => o.status !== "Menunggu");
  const revenue = paid.reduce((sum, o) => sum + o.total, 0);

  return (
    <>
      <Heading title="Order" sub="Klik status untuk memproses order." />
      <div className="mb-[10px] grid grid-cols-2 gap-[8px]">
        {[
          { label: "Pendapatan", value: `Rp ${revenue.toLocaleString("id-ID")}` },
          { label: "Order dibayar", value: `${paid.length} / ${orders.length}` },
        ].map((stat) => (
          <div key={stat.label} className="rounded-[10px] border-[0.8px] border-kv-border bg-kv-secondary px-[10px] py-[8px] leading-none">
            <p className="text-[11px] text-kv-muted-fg">{stat.label}</p>
            <p key={stat.value} className="kv-tabular mt-[6px] animate-kv-fade text-[16px] font-semibold text-kv-fg">
              {stat.value}
            </p>
          </div>
        ))}
      </div>
      <Frame title="Order terbaru" icon={ShoppingBag} bodyClassName="overflow-hidden">
        <ul>
          {orders.map((order, i) => {
            const next = STATUSES[Math.min(STATUSES.indexOf(order.status) + 1, STATUSES.length - 1)];
            const done = order.status === "Dikirim";
            return (
              <li key={order.id} className="flex items-center gap-[10px] border-b border-black/[0.06] px-[12px] py-[9px] last:border-b-0">
                <span className="min-w-0 flex-1 leading-none">
                  <span className="block truncate text-[13px] font-medium text-kv-fg">
                    {order.name} <span className="font-normal text-kv-subtle">#INV-{order.id}</span>
                  </span>
                  <span className="mt-[4px] block truncate text-[11px] text-kv-subtle">{order.item}</span>
                </span>
                <span className="kv-tabular hidden text-[12px] text-kv-cell sm:block">Rp {order.total.toLocaleString("id-ID")}</span>
                <button
                  type="button"
                  disabled={done}
                  title={done ? undefined : `Tandai ${next.toLowerCase()}`}
                  onClick={() =>
                    setOrders((list) => list.map((o, j) => (j === i ? { ...o, status: next } : o)))
                  }
                  className={cn(
                    "flex h-[22px] w-[84px] shrink-0 items-center justify-center gap-[5px] rounded-[6px] border-[0.8px] text-[11px] font-medium transition-colors",
                    order.status === "Menunggu" &&
                      "border-dashed border-amber-300 text-amber-700 hover:border-amber-500 hover:bg-amber-50",
                    order.status === "Dibayar" && "border-kv-border bg-kv-card text-kv-secondary-fg hover:bg-kv-hover",
                    done && "border-kv-border bg-kv-secondary text-kv-muted-fg"
                  )}
                >
                  {done ? <Check className="h-[11px] w-[11px] text-kv-success" strokeWidth={2.4} /> : null}
                  {order.status}
                </button>
              </li>
            );
          })}
        </ul>
      </Frame>
    </>
  );
}

/* ----------------------------- Kursus ------------------------------ */

const COURSES = [
  { id: "seo", title: "Kelas SEO Dasar", students: 128, lessons: ["Riset kata kunci", "On-page SEO", "Link building", "Mengukur hasil"] },
  { id: "ads", title: "Iklan Meta untuk UMKM", students: 86, lessons: ["Struktur kampanye", "Target audiens", "Materi iklan"] },
];

function CoursesView() {
  const [courseId, setCourseId] = useState(COURSES[0].id);
  const [done, setDone] = useState<Record<string, boolean>>({ "seo-0": true, "ads-0": true, "ads-1": true });
  const course = COURSES.find((c) => c.id === courseId)!;
  const progress = (id: string, count: number) =>
    Math.round((Array.from({ length: count }).filter((_, i) => done[`${id}-${i}`]).length / count) * 100);

  return (
    <>
      <Heading title="Kursus" sub="Pilih kursus, lalu centang materi yang selesai." />
      <div className="grid gap-[10px] sm:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col gap-[8px]">
          {COURSES.map((c) => {
            const pct = progress(c.id, c.lessons.length);
            const selected = c.id === courseId;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setCourseId(c.id)}
                className={cn(
                  "rounded-[10px] border-[0.8px] bg-kv-card p-[10px] text-left transition-shadow",
                  selected ? "border-kv-fg shadow-[inset_0_0_0_0.4px_#1f2937]" : "border-kv-border hover:shadow-kv-hover"
                )}
              >
                <span className="flex items-center justify-between gap-[8px] text-[13px] font-medium text-kv-fg">
                  <span className="truncate">{c.title}</span>
                  <span className="kv-tabular shrink-0 text-[11px] font-normal text-kv-muted-fg">{pct}%</span>
                </span>
                <span className="mt-[8px] block h-[4px] overflow-hidden rounded-full bg-kv-accent">
                  <span className="kv-gradient block h-full rounded-full transition-[width] duration-500 ease-out-expo" style={{ width: `${pct}%` }} />
                </span>
                <span className="mt-[6px] block text-[11px] text-kv-subtle">{c.students} siswa · {c.lessons.length} materi</span>
              </button>
            );
          })}
        </div>

        <Frame title={course.title} icon={GraduationCap} bodyClassName="p-[6px]">
          <ul key={course.id} className="animate-kv-fade">
            {course.lessons.map((lesson, i) => {
              const key = `${course.id}-${i}`;
              const checked = !!done[key];
              return (
                <li key={key}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => setDone((d) => ({ ...d, [key]: !checked }))}
                    className="flex w-full items-center gap-[8px] rounded-[7px] px-[8px] py-[8px] text-left text-[12px] transition-colors hover:bg-kv-hover"
                  >
                    <span
                      className={cn(
                        "flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[5px] border-[0.8px] transition-colors",
                        checked ? "kv-gradient border-kv-fg text-white" : "border-kv-border bg-white"
                      )}
                    >
                      {checked ? <Check className="h-[10px] w-[10px]" strokeWidth={3} /> : null}
                    </span>
                    <span className={cn("truncate", checked ? "text-kv-muted-fg line-through" : "text-kv-fg")}>
                      {i + 1}. {lesson}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Frame>
      </div>
    </>
  );
}
