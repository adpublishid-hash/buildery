"use client";

import { useEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useInView,
  useReducedMotion,
  type Variants,
} from "motion/react";
import {
  BarChart3,
  BookOpen,
  CreditCard,
  FileText,
  FormInput,
  Globe2,
  LayoutDashboard,
  LockKeyhole,
  Package,
  ShoppingBag,
  Sparkles,
} from "lucide-react";

const EASE = [0.16, 1, 0.3, 1] as const;

type MockupMode = {
  id: string;
  label: string;
  title: string;
  eyebrow: string;
  cta: string;
  icon: typeof LayoutDashboard;
  stats: { label: string; value: number; prefix?: string; suffix?: string }[];
  bars: number[];
  checklist: string[];
  feed: string[];
};

const MODES: MockupMode[] = [
  {
    id: "site",
    label: "Site",
    title: "Landing page siap publish",
    eyebrow: "Website builder",
    cta: "Publish",
    icon: Globe2,
    stats: [
      { label: "Visitors", value: 8420 },
      { label: "Leads", value: 318 },
      { label: "Conv.", value: 7.4, suffix: "%" },
    ],
    bars: [40, 62, 48, 74, 66, 92, 78, 108],
    checklist: ["Hero + CTA", "SEO title", "Domain connected"],
    feed: ["Hero block diperbarui", "FAQ ditambah", "Slug /home aktif"],
  },
  {
    id: "store",
    label: "Store",
    title: "Checkout produk aktif",
    eyebrow: "E-commerce",
    cta: "Open store",
    icon: ShoppingBag,
    stats: [
      { label: "Revenue", value: 24.8, prefix: "Rp ", suffix: "jt" },
      { label: "Orders", value: 342 },
      { label: "Paid", value: 89, suffix: "%" },
    ],
    bars: [52, 44, 68, 76, 58, 96, 88, 114],
    checklist: ["Stok sinkron", "Kupon aktif", "Midtrans ready"],
    feed: ["Order #ORD-8KQ2 dibayar", "Produk digital terkirim", "Kupon LAUNCH dipakai"],
  },
  {
    id: "course",
    label: "Course",
    title: "Kursus dengan progress",
    eyebrow: "LMS",
    cta: "Preview lesson",
    icon: BookOpen,
    stats: [
      { label: "Students", value: 1284 },
      { label: "Lessons", value: 48 },
      { label: "Complete", value: 63, suffix: "%" },
    ],
    bars: [34, 42, 57, 71, 82, 88, 95, 106],
    checklist: ["Modul berurutan", "Video lesson", "Progress saved"],
    feed: ["3 murid mulai modul 2", "Lesson baru dipublish", "Akses premium aktif"],
  },
  {
    id: "member",
    label: "Member",
    title: "Akses premium terjaga",
    eyebrow: "Membership",
    cta: "Manage plans",
    icon: LockKeyhole,
    stats: [
      { label: "Members", value: 418 },
      { label: "Premium", value: 126 },
      { label: "MRR", value: 12.4, prefix: "Rp ", suffix: "jt" },
    ],
    bars: [28, 39, 54, 72, 69, 84, 91, 104],
    checklist: ["Tier gratis", "Tier premium", "Course gated"],
    feed: ["Member Premium baru", "Plan yearly diperpanjang", "Akses kursus terbuka"],
  },
  {
    id: "forms",
    label: "Forms",
    title: "Lead masuk satu inbox",
    eyebrow: "Forms & CRM",
    cta: "View inbox",
    icon: FormInput,
    stats: [
      { label: "Submits", value: 936 },
      { label: "New", value: 24 },
      { label: "Fields", value: 12 },
    ],
    bars: [24, 38, 55, 49, 73, 64, 87, 96],
    checklist: ["Validasi field", "Logic condition", "CSV export"],
    feed: ["Form konsultasi terkirim", "Lead baru ditandai", "Email follow-up siap"],
  },
];

function formatNumber(value: number) {
  if (!Number.isInteger(value)) return value.toFixed(1).replace(".", ",");
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Counts a number up once it scrolls into view. */
function CountUp({
  to,
  prefix = "",
  suffix = "",
}: {
  to: number;
  prefix?: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setValue(to);
      return;
    }
    const controls = animate(0, to, {
      duration: 1.1,
      ease: EASE,
      onUpdate: (v) => setValue(v),
    });
    return () => controls.stop();
  }, [inView, to, reduce]);

  return (
    <span ref={ref}>
      {prefix}
      {formatNumber(value)}
      {suffix}
    </span>
  );
}

const cardContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.08 } },
};

const cardItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
};

export function AppMockup() {
  const reduce = useReducedMotion();
  const [activeId, setActiveId] = useState(MODES[0].id);
  const active = MODES.find((mode) => mode.id === activeId) ?? MODES[0];
  const ActiveIcon = active.icon;

  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-zinc-200/50 blur-2xl dark:bg-zinc-800/40"
      />

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 24, rotateX: 6 }}
        whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.7, ease: EASE }}
        className="rounded-[1.75rem] border border-zinc-200 bg-zinc-950 p-2 shadow-2xl shadow-zinc-300/60 dark:border-zinc-800 dark:shadow-black/50"
      >
        <div className="overflow-hidden rounded-[1.25rem] bg-white dark:bg-zinc-950">
          <div className="flex h-11 items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
            </div>
            <span className="rounded-md bg-white px-2 py-1 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              acme-studio.landing.my.id
            </span>
            <span className="h-2.5 w-2.5" />
          </div>

          <div className="grid grid-cols-[64px_1fr] sm:grid-cols-[150px_1fr]">
            <aside className="border-r border-zinc-200 bg-zinc-50 p-2.5 dark:border-zinc-800 dark:bg-zinc-900/70">
              <div className="mb-4 flex items-center gap-2 px-1">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-zinc-900 text-[10px] font-bold text-white dark:bg-white dark:text-zinc-900">
                  M
                </span>
                <span className="hidden h-2 w-16 rounded-full bg-zinc-300 dark:bg-zinc-700 sm:block" />
              </div>
              {MODES.map((mode, i) => {
                const Icon = mode.icon;
                const selected = active.id === mode.id;
                return (
                  <motion.button
                    key={mode.id}
                    type="button"
                    onClick={() => setActiveId(mode.id)}
                    initial={reduce ? false : { opacity: 0, x: -8 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.22 + i * 0.04, duration: 0.3 }}
                    className={`mb-1 flex h-9 w-full items-center gap-2 rounded-md px-2 text-left transition ${
                      selected
                        ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white"
                        : "text-zinc-400 hover:bg-white/70 hover:text-zinc-700 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-200"
                    }`}
                    aria-pressed={selected}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="hidden truncate text-[11px] font-medium sm:block">
                      {mode.label}
                    </span>
                  </motion.button>
                );
              })}
            </aside>

            <div className="p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <motion.div
                  key={`${active.id}-heading`}
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: EASE }}
                  className="min-w-0"
                >
                  <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                    <ActiveIcon className="h-3.5 w-3.5" />
                    {active.eyebrow}
                  </p>
                  <h3 className="mt-1 truncate text-base font-semibold text-zinc-950 dark:text-white">
                    {active.title}
                  </h3>
                </motion.div>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  className="flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-zinc-900 px-3 text-[11px] font-semibold text-white dark:bg-white dark:text-zinc-900"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {active.cta}
                </motion.button>
              </div>

              <motion.div
                key={`${active.id}-stats`}
                variants={cardContainer}
                initial={reduce ? false : "hidden"}
                animate="show"
                className="grid grid-cols-3 gap-2.5"
              >
                {active.stats.map((stat) => (
                  <motion.div
                    key={stat.label}
                    variants={cardItem}
                    className="rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800"
                  >
                    <p className="text-[10px] text-zinc-400">{stat.label}</p>
                    <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-white">
                      <CountUp
                        to={stat.value}
                        prefix={stat.prefix}
                        suffix={stat.suffix}
                      />
                    </p>
                  </motion.div>
                ))}
              </motion.div>

              <div className="mt-3 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
                <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-3.5 w-3.5 text-zinc-400" />
                      <span className="text-[10px] font-medium text-zinc-500">
                        Growth
                      </span>
                    </div>
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">
                      Live
                    </span>
                  </div>
                  <div className="flex h-28 items-end gap-1.5">
                    {active.bars.map((h, i) => (
                      <motion.span
                        key={`${active.id}-${i}`}
                        initial={reduce ? false : { height: 0 }}
                        animate={{ height: h }}
                        transition={{
                          delay: i * 0.035,
                          duration: 0.45,
                          ease: EASE,
                        }}
                        className="flex-1 rounded-t-sm bg-gradient-to-t from-zinc-900 to-zinc-500 dark:from-zinc-100 dark:to-zinc-500"
                        style={{ height: h }}
                      />
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                  <div className="mb-2.5 flex items-center justify-between">
                    <span className="text-[10px] font-medium text-zinc-500">
                      Launch checklist
                    </span>
                    <CreditCard className="h-3.5 w-3.5 text-zinc-400" />
                  </div>
                  {active.checklist.map((label, i) => (
                    <motion.div
                      key={`${active.id}-${label}`}
                      initial={reduce ? false : { opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 + i * 0.06, duration: 0.25 }}
                      className="mb-2 flex items-center gap-2"
                    >
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-zinc-900 text-[9px] text-white dark:bg-white dark:text-zinc-900">
                        ✓
                      </span>
                      <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                        {label}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="mb-2.5 flex items-center gap-2">
                  <LayoutDashboard className="h-3.5 w-3.5 text-zinc-400" />
                  <span className="text-[10px] font-medium text-zinc-500">
                    Activity
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {active.feed.map((label, i) => (
                    <motion.div
                      key={`${active.id}-${label}`}
                      initial={reduce ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.08 + i * 0.05, duration: 0.25 }}
                      className="flex min-h-10 items-center gap-2 rounded-md bg-zinc-50 px-2 dark:bg-zinc-900"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-zinc-900 dark:bg-zinc-200" />
                      <span className="text-[10px] leading-4 text-zinc-500 dark:text-zinc-400">
                        {label}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.35 }}
        className="absolute -bottom-5 left-6 hidden rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 shadow-lg dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 sm:flex"
      >
        <Package className="mr-2 h-4 w-4" />
        Klik menu di mockup untuk lihat modul berbeda
      </motion.div>
      <motion.div
        initial={reduce ? false : { opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1, duration: 0.35 }}
        className="absolute -right-3 top-20 hidden rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 shadow-lg dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 lg:flex"
      >
        <FileText className="mr-2 h-4 w-4" />
        Semua data nyambung otomatis
      </motion.div>
    </div>
  );
}
