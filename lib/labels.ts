// Pure display constants safe to import from both server and client code.

import type { MembershipLevel, ScheduledJobKind } from "@prisma/client";

export const MEMBERSHIP_LEVEL_LABEL: Record<MembershipLevel, string> = {
  FREE: "Free",
  BASIC: "Basic",
  PREMIUM: "Premium",
};

export const SCHEDULED_JOB_LABEL: Record<ScheduledJobKind, string> = {
  BLOG_PUBLICATION: "Blog publication",
  META_CAPI_FLUSH: "Meta CAPI flush",
  PAYMENT_RECONCILIATION: "Payment reconciliation",
  PAYMENT_EXPIRY_SWEEP: "Payment expiry sweep",
  ABANDONED_CHECKOUT_SWEEP: "Abandoned checkout sweep",
  STORE_NOTIFICATION_RETRY: "Store notification retry",
  LOW_STOCK_ALERT_SWEEP: "Low stock alert sweep",
  FORM_DELIVERY_RETRY: "Form delivery retry",
  ANALYTICS_ROLLUP: "Analytics rollup",
  INBOX_NOTIFY: "Inbox notify",
  INBOX_PRUNE: "Inbox prune",
  PAYMENT_REMINDER_SWEEP: "Payment reminder sweep",
  STOCK_NOTIFY_SWEEP: "Back in stock sweep",
  MEMBERSHIP_LIFECYCLE_SWEEP: "Membership lifecycle sweep",
  AFFILIATE_LIFECYCLE_SWEEP: "Affiliate lifecycle sweep",
  WORKSPACE_LIFECYCLE_SWEEP: "Workspace lifecycle sweep",
  SAAS_BILLING_SWEEP: "SaaS billing sweep",
  // WHATSAPP_SEND is live: it delivers the replies operators write in the inbox.
  WHATSAPP_SEND: "WhatsApp send",
  // Retired kinds. Production may still hold queued rows using them.
  ABANDONED_SCAN: "Abandoned scan (retired)",
  ABANDONED_RECOVERY: "Abandoned recovery (retired)",
  NOTIFICATION_RETRY: "Notification retry (retired)",
  LOW_STOCK_SCAN: "Low stock scan (retired)",
  WEEKLY_REPORT_SWEEP: "Weekly report sweep (dihentikan)",
  WEEKLY_REPORT: "Weekly report (dihentikan)",
};

export const SCHEDULED_JOB_DESCRIPTION: Record<ScheduledJobKind, string> = {
  BLOG_PUBLICATION: "Menerbitkan versi artikel pada waktu yang dijadwalkan.",
  META_CAPI_FLUSH: "Mengirim antrean event Meta Conversions API.",
  PAYMENT_RECONCILIATION: "Menyamakan status payment pending dengan Midtrans.",
  PAYMENT_EXPIRY_SWEEP: "Meng-expire payment pending yang lewat batas waktu.",
  ABANDONED_CHECKOUT_SWEEP: "Menyapu checkout terbengkalai untuk follow-up.",
  STORE_NOTIFICATION_RETRY: "Mengulang notifikasi toko yang gagal terkirim.",
  LOW_STOCK_ALERT_SWEEP: "Mengecek stok menipis dan mengirim alert.",
  FORM_DELIVERY_RETRY: "Mengulang notifikasi form yang gagal atau tertinggal.",
  ANALYTICS_ROLLUP: "Merangkum analitik harian dan memangkas event mentah lama.",
  INBOX_NOTIFY: "Memberi tahu tim lewat Telegram saat ada pesan WhatsApp masuk.",
  INBOX_PRUNE: "Menghapus riwayat pesan lama di percakapan yang sudah tidak aktif.",
  PAYMENT_REMINDER_SWEEP: "Mengingatkan pembeli sebelum batas waktu pembayaran habis.",
  STOCK_NOTIFY_SWEEP: "Memberi tahu pembeli saat produk yang ditunggu tersedia lagi.",
  MEMBERSHIP_LIFECYCLE_SWEEP: "Mengakhiri akses kedaluwarsa dan mengirim pengingat perpanjangan.",
  AFFILIATE_LIFECYCLE_SWEEP: "Menyetujui komisi yang melewati masa hold dan menganonimkan metadata klik lama.",
  WORKSPACE_LIFECYCLE_SWEEP: "Mengakhiri undangan kedaluwarsa dan menghapus workspace setelah masa pemulihan.",
  SAAS_BILLING_SWEEP: "Menutup masa aktif langganan yang jatuh tempo, melepas kode unik kedaluwarsa, dan mengirim pengingat perpanjangan.",
  WHATSAPP_SEND: "Mengirim satu balasan yang ditulis operator di Inbox (WhatsApp, Telegram, Messenger, Instagram).",
  ABANDONED_SCAN: "Digantikan oleh Abandoned checkout sweep.",
  ABANDONED_RECOVERY: "Digantikan oleh Abandoned checkout sweep.",
  NOTIFICATION_RETRY: "Digantikan oleh Store notification retry.",
  LOW_STOCK_SCAN: "Digantikan oleh Low stock alert sweep.",
  WEEKLY_REPORT_SWEEP: "Email ringkasan mingguan sudah dihapus.",
  WEEKLY_REPORT: "Email ringkasan mingguan sudah dihapus.",
};
