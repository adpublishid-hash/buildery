/**
 * Aritmetika harga dan tagihan plan SaaS. Murni dan bebas dependensi supaya
 * dipakai bersama oleh server action, sweep terjadwal, komponen client, dan
 * unit test tanpa perlu database.
 */

export type MonthlyPlanPrice = {
  monthlyPrice: number;
  compareAtMonthlyPrice: number | null;
};

/** Rentang kode unik yang ditambahkan ke nominal transfer. */
export const MIN_UNIQUE_CODE = 101;
export const MAX_UNIQUE_CODE = 999;

/** Berapa lama invoice menunggu pembayaran sebelum kadaluarsa. */
export const DEFAULT_INVOICE_WINDOW_HOURS = 24;

/** Tenggang setelah jatuh tempo sebelum plan berbayar dilepas. */
export const DEFAULT_GRACE_DAYS = 3;

/** Sisa hari saat pengingat perpanjangan dikirim, dari yang paling awal. */
export const RENEWAL_REMINDER_STAGES = [7, 3, 1] as const;

export const DAY_MS = 24 * 60 * 60 * 1000;

export function getMonthlyPlanPricing(plan: MonthlyPlanPrice) {
  const listPrice =
    plan.compareAtMonthlyPrice != null &&
    plan.compareAtMonthlyPrice > plan.monthlyPrice
      ? plan.compareAtMonthlyPrice
      : plan.monthlyPrice;
  const savings = Math.max(0, listPrice - plan.monthlyPrice);
  const discountPercent =
    savings > 0 && listPrice > 0 ? Math.round((savings / listPrice) * 100) : 0;

  return {
    payablePrice: plan.monthlyPrice,
    listPrice,
    savings,
    discountPercent,
    hasDiscount: savings > 0,
  };
}

/**
 * Nilai sisa plan yang sedang berjalan, dipakai sebagai potongan saat upgrade
 * di tengah periode. Pelanggan sudah membayar sampai `periodEnd`; menagih plan
 * baru penuh tanpa potongan berarti menagih hari yang sama dua kali.
 *
 * Dihitung per hari penuh yang tersisa dan tidak pernah melebihi harga yang
 * dibayar untuk satu periode.
 */
export function getProratedCredit(input: {
  currentMonthlyPrice: number;
  currentPeriodEnd: Date | null;
  now?: Date;
  periodDays?: number;
}): number {
  const { currentMonthlyPrice, currentPeriodEnd } = input;
  const now = input.now ?? new Date();
  const periodDays = input.periodDays ?? 30;

  if (currentMonthlyPrice <= 0 || !currentPeriodEnd) return 0;

  const remainingMs = currentPeriodEnd.getTime() - now.getTime();
  if (remainingMs <= 0) return 0;

  const remainingDays = Math.min(
    Math.floor(remainingMs / DAY_MS),
    periodDays
  );
  if (remainingDays <= 0) return 0;

  const perDay = currentMonthlyPrice / periodDays;
  return Math.min(currentMonthlyPrice, Math.floor(perDay * remainingDays));
}

export type InvoiceAmounts = {
  listPrice: number;
  promoPrice: number;
  proratedCredit: number;
  uniqueCode: number;
  /** Yang harus ditransfer pelanggan, persis sampai digit terakhir. */
  totalAmount: number;
  savings: number;
  discountPercent: number;
  hasDiscount: boolean;
};

/**
 * Menyusun nominal akhir satu invoice. Kode unik selalu ikut ditambahkan,
 * termasuk saat potongan proporsional menghabiskan seluruh harga plan —
 * transfer Rp 0 tidak bisa dicocokkan, jadi tagihan minimum adalah kode unik.
 */
export function buildInvoiceAmounts(input: {
  listPrice: number;
  promoPrice: number;
  proratedCredit?: number;
  uniqueCode: number;
}): InvoiceAmounts {
  const listPrice = Math.max(0, Math.round(input.listPrice));
  const promoPrice = Math.max(0, Math.round(input.promoPrice));
  const proratedCredit = Math.min(
    promoPrice,
    Math.max(0, Math.round(input.proratedCredit ?? 0))
  );
  const uniqueCode = Math.round(input.uniqueCode);
  const payable = promoPrice - proratedCredit;
  const savings = Math.max(0, listPrice - promoPrice);

  return {
    listPrice,
    promoPrice,
    proratedCredit,
    uniqueCode,
    totalAmount: payable + uniqueCode,
    savings,
    discountPercent:
      savings > 0 && listPrice > 0
        ? Math.round((savings / listPrice) * 100)
        : 0,
    hasDiscount: savings > 0,
  };
}

/**
 * Memilih kode unik yang nominal akhirnya belum dipakai invoice lain yang
 * masih terbuka. `takenAmounts` berisi total yang sedang beredar; pemanggil
 * mengambilnya dari database di dalam transaksi yang sama.
 *
 * Mengembalikan null kalau seluruh rentang habis — pemanggil harus menolak
 * dengan sopan alih-alih menerbitkan nominal kembar.
 */
export function pickUniqueCode(input: {
  payableAmount: number;
  takenAmounts: Iterable<number>;
  random?: () => number;
}): number | null {
  const taken = new Set(input.takenAmounts);
  const random = input.random ?? Math.random;
  const span = MAX_UNIQUE_CODE - MIN_UNIQUE_CODE + 1;
  const offset = Math.floor(random() * span);

  for (let i = 0; i < span; i++) {
    const code = MIN_UNIQUE_CODE + ((offset + i) % span);
    if (!taken.has(input.payableAmount + code)) return code;
  }
  return null;
}

/**
 * Nomor invoice yang terbaca manusia: admin memakainya untuk mencocokkan chat
 * WhatsApp dengan baris di antrean verifikasi.
 */
export function formatInvoiceNumber(input: {
  tier: string;
  sequence: number;
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const seq = String(Math.max(1, Math.floor(input.sequence))).padStart(4, "0");
  return `INV-${input.tier}-${y}${m}${d}-${seq}`;
}

/** Menambah bulan penuh ke sebuah tanggal, tanpa menggeser ke bulan berikutnya. */
export function addMonths(from: Date, months: number): Date {
  const next = new Date(from.getTime());
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)
  ).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

/**
 * Awal periode berikutnya. Perpanjangan sebelum jatuh tempo menumpuk di atas
 * sisa masa aktif, bukan menghanguskannya.
 */
export function nextPeriodStart(
  currentPeriodEnd: Date | null,
  now = new Date()
): Date {
  if (currentPeriodEnd && currentPeriodEnd.getTime() > now.getTime()) {
    return new Date(currentPeriodEnd.getTime());
  }
  return new Date(now.getTime());
}

/**
 * Tahap pengingat yang harus dikirim sekarang, atau null kalau belum waktunya.
 * `lastStage` adalah tahap terakhir yang sudah terkirim (0 = belum ada).
 */
export function dueReminderStage(input: {
  periodEnd: Date;
  lastStage: number;
  now?: Date;
}): number | null {
  const now = input.now ?? new Date();
  const remainingMs = input.periodEnd.getTime() - now.getTime();
  if (remainingMs <= 0) return null;

  const daysLeft = Math.ceil(remainingMs / DAY_MS);
  for (const stage of RENEWAL_REMINDER_STAGES) {
    if (daysLeft <= stage && (input.lastStage === 0 || input.lastStage > stage)) {
      return stage;
    }
  }
  return null;
}

/**
 * Apakah plan berbayar masih berlaku. Dipakai bersama oleh penegakan limit dan
 * sweep supaya keduanya tidak pernah berbeda pendapat.
 *
 * `currentPeriodEnd` null berarti tidak ada jatuh tempo — langganan yang
 * diberikan manual oleh admin, dan langganan lama sebelum mesin invoice ada.
 */
export function isSubscriptionEntitled(
  subscription: {
    status: string;
    currentPeriodEnd: Date | null;
    graceUntil: Date | null;
  },
  now = new Date()
): boolean {
  if (subscription.status !== "ACTIVE" && subscription.status !== "PAST_DUE") {
    return false;
  }
  if (!subscription.currentPeriodEnd) return subscription.status === "ACTIVE";

  if (subscription.currentPeriodEnd.getTime() > now.getTime()) return true;
  return Boolean(
    subscription.graceUntil && subscription.graceUntil.getTime() > now.getTime()
  );
}
