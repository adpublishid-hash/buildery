"use server";

import { revalidatePath } from "next/cache";
import type {
  AbuseReportStatus,
  Role,
  SaaSPlanTier,
  SaaSSubscriptionStatus,
  WorkspaceStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/admin";
import { slugify } from "@/lib/slug";
import { isSuperAdminEmail, SUPER_ADMIN_EMAIL } from "@/lib/super-admin";
import {
  abuseReportSchema,
  siteTemplateFromPageSchema,
  siteTemplateSchema,
} from "@/lib/zod";
import { pageBlocksSchema } from "@/lib/blocks/schema";
import {
  approveInvoice,
  rejectInvoice,
  saveBillingSettings,
} from "@/lib/saas-billing";
import { addMonths } from "@/lib/billing-pricing";
import { writePlatformAudit } from "@/lib/platform-audit";

type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const SUBSCRIPTION_PERIOD_DAYS = 30;
const QUARANTINE_DAYS = 30;

// ----- Users -----

export async function setUserRoleAction(
  userId: string,
  role: Role
): Promise<ActionResult> {
  const admin = await requireSuperAdmin();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  if (!user) return { ok: false, error: "User not found." };
  if (admin.id === userId && role !== "SUPER_ADMIN") {
    return { ok: false, error: "Don't demote yourself out of SUPER_ADMIN." };
  }
  if (role === "SUPER_ADMIN" && !isSuperAdminEmail(user.email)) {
    return {
      ok: false,
      error: `Only ${SUPER_ADMIN_EMAIL} can be assigned Super Admin.`,
    };
  }
  if (isSuperAdminEmail(user.email) && role !== "SUPER_ADMIN") {
    return {
      ok: false,
      error: `${SUPER_ADMIN_EMAIL} must remain Super Admin.`,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { role } });
    await writePlatformAudit({ actorId: admin.id, action: "user.role_changed", targetType: "user", targetId: userId, summary: `Role ${user.email} diubah ke ${role}`, metadata: { role }, client: tx });
  });
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function deleteUserAction(userId: string): Promise<ActionResult> {
  const admin = await requireSuperAdmin();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user) return { ok: false, error: "User not found." };
  if (admin.id === userId || isSuperAdminEmail(user.email)) {
    return { ok: false, error: "You can't delete the platform super admin." };
  }
  const now = new Date();
  const deleteAfter = new Date(now.getTime() + QUARANTINE_DAYS * 86_400_000);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { deletedAt: now, deleteAfter } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.workspace.updateMany({ where: { createdById: userId, status: { not: "PENDING_DELETION" } }, data: { status: "PENDING_DELETION", deletionRequestedAt: now, deleteAfter } });
    await writePlatformAudit({ actorId: admin.id, action: "user.quarantined", targetType: "user", targetId: userId, summary: `${user.email} dikarantina selama ${QUARANTINE_DAYS} hari`, metadata: { email: user.email, deleteAfter: deleteAfter.toISOString() }, client: tx });
  });
  revalidatePath("/admin/users");
  revalidatePath("/admin/workspaces");
  return { ok: true };
}

export async function restoreUserAction(userId: string): Promise<ActionResult> {
  const admin = await requireSuperAdmin();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, deletedAt: true } });
  if (!user?.deletedAt) return { ok: false, error: "User tidak sedang dikarantina." };
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { deletedAt: null, deleteAfter: null } });
    await tx.workspace.updateMany({ where: { createdById: userId, status: "PENDING_DELETION" }, data: { status: "ACTIVE", deletionRequestedAt: null, deleteAfter: null } });
    await writePlatformAudit({ actorId: admin.id, action: "user.restored", targetType: "user", targetId: userId, summary: `${user.email} dipulihkan dari karantina`, client: tx });
  });
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true };
}

export async function setUserPlanAction(
  userId: string,
  planTier: SaaSPlanTier
): Promise<ActionResult> {
  const admin = await requireSuperAdmin();
  const [user, plan] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
    // Sengaja tidak memfilter isPublic: ini justru jalan admin untuk memberi
    // plan yang tidak dijual sendiri di halaman harga, seperti BUSINESS.
    prisma.saaSPlan.findUnique({
      where: { tier: planTier },
      select: { id: true, name: true, monthlyPrice: true },
    }),
  ]);
  if (!user) return { ok: false, error: "User not found." };
  if (!plan) return { ok: false, error: "Plan not found." };

  const now = new Date();
  // Plan gratis tidak punya jatuh tempo; plan berbayar yang diberikan manual
  // tetap dapat satu periode penuh supaya sweep bisa menutupnya nanti.
  const expiresAt =
    plan.monthlyPrice > 0
      ? new Date(now.getTime() + SUBSCRIPTION_PERIOD_DAYS * 24 * 60 * 60 * 1000)
      : null;

  await prisma.$transaction(async (tx) => {
    await tx.saaSSubscription.upsert({
      where: { userId },
      update: {
        planId: plan.id,
        status: "ACTIVE",
        startedAt: now,
        currentPeriodEnd: expiresAt,
        cancelAtPeriodEnd: false,
        cancelledAt: null,
        graceUntil: null,
        expiredAt: null,
        lastReminderStage: 0,
      },
      create: {
        userId,
        planId: plan.id,
        status: "ACTIVE",
        currentPeriodEnd: expiresAt,
      },
    });
    await writePlatformAudit({ actorId: admin.id, action: "subscription.plan_changed", targetType: "user", targetId: userId, summary: `Plan user diubah ke ${plan.name}`, metadata: { planTier, expiresAt: expiresAt?.toISOString() ?? null }, client: tx });
  });

  revalidatePath("/admin/users");
  revalidatePath("/admin/subscriptions");
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

// ----- Workspaces -----

export async function deleteWorkspaceAdminAction(
  workspaceId: string
): Promise<ActionResult> {
  const admin = await requireSuperAdmin();
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true, status: true } });
  if (!workspace) return { ok: false, error: "Workspace tidak ditemukan." };
  const now = new Date();
  const deleteAfter = new Date(now.getTime() + QUARANTINE_DAYS * 86_400_000);
  await prisma.$transaction(async (tx) => {
    await tx.workspace.update({ where: { id: workspaceId }, data: { status: "PENDING_DELETION", deletionRequestedAt: now, deleteAfter } });
    await tx.workspaceAuditLog.create({ data: { workspaceId, actorId: admin.id, action: "workspace.quarantined", summary: `Workspace dikarantina sampai ${deleteAfter.toISOString()}`, targetType: "workspace", targetId: workspaceId } });
    await writePlatformAudit({ actorId: admin.id, action: "workspace.quarantined", targetType: "workspace", targetId: workspaceId, summary: `${workspace.name} dikarantina selama ${QUARANTINE_DAYS} hari`, metadata: { previousStatus: workspace.status, deleteAfter: deleteAfter.toISOString() }, client: tx });
  });
  revalidatePath("/admin/workspaces");
  return { ok: true };
}

export async function restoreWorkspaceAdminAction(workspaceId: string): Promise<ActionResult> {
  const admin = await requireSuperAdmin();
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true, status: true } });
  if (!workspace || workspace.status !== "PENDING_DELETION") return { ok: false, error: "Workspace tidak sedang dikarantina." };
  await prisma.$transaction(async (tx) => {
    await tx.workspace.update({ where: { id: workspaceId }, data: { status: "ACTIVE", deletionRequestedAt: null, deleteAfter: null } });
    await tx.workspaceAuditLog.create({ data: { workspaceId, actorId: admin.id, action: "workspace.restored", summary: "Workspace dipulihkan oleh administrator", targetType: "workspace", targetId: workspaceId } });
    await writePlatformAudit({ actorId: admin.id, action: "workspace.restored", targetType: "workspace", targetId: workspaceId, summary: `${workspace.name} dipulihkan dari karantina`, client: tx });
  });
  revalidatePath("/admin/workspaces");
  revalidatePath(`/admin/workspaces/${workspaceId}`);
  return { ok: true };
}

export async function setWorkspaceStatusAdminAction(workspaceId: string, status: WorkspaceStatus): Promise<ActionResult> {
  const admin = await requireSuperAdmin();
  if (!(["ACTIVE", "SUSPENDED"] as WorkspaceStatus[]).includes(status)) return { ok: false, error: "Invalid status." };
  await prisma.$transaction(async (tx) => {
    await tx.workspace.update({ where: { id: workspaceId }, data: { status, suspendedAt: status === "SUSPENDED" ? new Date() : null, ...(status === "ACTIVE" ? { deletionRequestedAt: null, deleteAfter: null } : {}) } });
    await tx.workspaceAuditLog.create({ data: { workspaceId, actorId: admin.id, action: status === "SUSPENDED" ? "workspace.suspended" : "workspace.reactivated", summary: status === "SUSPENDED" ? "Workspace ditangguhkan oleh administrator" : "Workspace diaktifkan kembali oleh administrator", targetType: "workspace", targetId: workspaceId } });
    await writePlatformAudit({ actorId: admin.id, action: status === "SUSPENDED" ? "workspace.suspended" : "workspace.reactivated", targetType: "workspace", targetId: workspaceId, summary: status === "SUSPENDED" ? "Workspace ditangguhkan" : "Workspace diaktifkan kembali", client: tx });
  });
  revalidatePath("/admin/workspaces");
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

// ----- Subscriptions -----

export async function setSubscriptionStatusAction(
  subscriptionId: string,
  status: SaaSSubscriptionStatus
): Promise<ActionResult> {
  const admin = await requireSuperAdmin();
  const sub = await prisma.saaSSubscription.findUnique({
    where: { id: subscriptionId },
    select: {
      id: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      graceUntil: true,
      lastReminderStage: true,
    },
  });
  if (!sub) return { ok: false, error: "Subscription not found." };

  const now = new Date();
  // Status saja tidak cukup. Mengembalikan langganan ke ACTIVE tanpa
  // memperpanjang periodenya hanya membuat sweep berikutnya menutupnya lagi
  // dalam hitungan menit, dan admin mengira kontrolnya tidak berfungsi.
  const reactivating = status === "ACTIVE";
  const periodEnd =
    reactivating &&
    (!sub.currentPeriodEnd || sub.currentPeriodEnd.getTime() <= now.getTime())
      ? addMonths(now, 1)
      : sub.currentPeriodEnd;

  await prisma.$transaction(async (tx) => {
    await tx.saaSSubscription.update({ where: { id: subscriptionId }, data: {
      status,
      currentPeriodEnd: periodEnd,
      cancelledAt: status === "CANCELLED" ? now : null,
      cancelAtPeriodEnd: status === "CANCELLED" ? false : sub.cancelAtPeriodEnd,
      graceUntil: status === "PAST_DUE" ? sub.graceUntil : null,
      expiredAt:
        status === "EXPIRED" || status === "CANCELLED" ? now : null,
      lastReminderStage: reactivating ? 0 : sub.lastReminderStage,
    } });
    await writePlatformAudit({ actorId: admin.id, action: "subscription.status_changed", targetType: "subscription", targetId: subscriptionId, summary: `Status langganan diubah ke ${status}`, metadata: { status }, client: tx });
  });
  revalidatePath("/admin/subscriptions");
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

// ----- SaaS invoices -----

export async function approveSaaSInvoiceAction(
  invoiceId: string
): Promise<ActionResult> {
  const admin = await requireSuperAdmin();
  const result = await approveInvoice({ invoiceId, adminId: admin.id });
  if (!result.ok) return { ok: false, error: result.error };
  await writePlatformAudit({ actorId: admin.id, action: "invoice.approved", targetType: "invoice", targetId: invoiceId, summary: "Invoice disetujui dan langganan diaktifkan" });

  revalidatePath("/admin/invoices");
  revalidatePath("/admin/subscriptions");
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function rejectSaaSInvoiceAction(
  invoiceId: string,
  reason: string
): Promise<ActionResult> {
  const admin = await requireSuperAdmin();
  const result = await rejectInvoice({ invoiceId, adminId: admin.id, reason });
  if (!result.ok) return { ok: false, error: result.error };
  await writePlatformAudit({ actorId: admin.id, action: "invoice.rejected", targetType: "invoice", targetId: invoiceId, summary: "Invoice ditolak", metadata: { reason } });

  revalidatePath("/admin/invoices");
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function saveBillingSettingsAction(
  formData: FormData
): Promise<ActionResult> {
  const admin = await requireSuperAdmin();

  const qrisImageUrl = String(formData.get("qrisImageUrl") ?? "").trim();
  if (qrisImageUrl && !/^(https?:\/\/|\/uploads\/)/.test(qrisImageUrl)) {
    return {
      ok: false,
      error: "URL gambar QRIS harus berupa http(s) atau hasil unggahan.",
      fieldErrors: { qrisImageUrl: ["URL tidak valid."] },
    };
  }

  await saveBillingSettings({
    qrisImageUrl: qrisImageUrl || null,
    qrisMerchantName: String(formData.get("qrisMerchantName") ?? ""),
    whatsappNumber: String(formData.get("whatsappNumber") ?? ""),
    paymentInstruction: String(formData.get("paymentInstruction") ?? ""),
    invoiceWindowHours: Number(formData.get("invoiceWindowHours") ?? 24),
    graceDays: Number(formData.get("graceDays") ?? 3),
  });
  await writePlatformAudit({ actorId: admin.id, action: "billing.settings_changed", targetType: "billing", targetId: "default", summary: "Pengaturan billing diperbarui" });

  revalidatePath("/admin/billing-settings");
  revalidatePath("/pricing");
  revalidatePath("/dashboard/billing");
  return { ok: true };
}

export async function savePlanAdminAction(formData: FormData): Promise<void> {
  const admin = await requireSuperAdmin();
  const id = String(formData.get("id") ?? "");
  const plan = await prisma.saaSPlan.findUnique({ where: { id }, select: { name: true } });
  if (!plan) return;
  const integer = (name: string) => {
    const value = String(formData.get(name) ?? "").trim();
    if (!value) return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };
  await prisma.saaSPlan.update({ where: { id }, data: { monthlyPrice: integer("monthlyPrice") ?? 0, workspaceLimit: integer("workspaceLimit"), memberLimit: integer("memberLimit"), pageLimit: integer("pageLimit"), productLimit: integer("productLimit"), courseLimit: integer("courseLimit"), formLimit: integer("formLimit"), monthlyOrderLimit: integer("monthlyOrderLimit"), orderRetentionMonths: integer("orderRetentionMonths"), isPublic: formData.get("isPublic") === "on" } });
  await writePlatformAudit({ actorId: admin.id, action: "billing.plan_changed", targetType: "plan", targetId: id, summary: `Plan ${plan.name} diperbarui` });
  revalidatePath("/admin/plans");
  revalidatePath("/pricing");
}

// ----- Templates -----

function parseTemplate(formData: FormData) {
  return siteTemplateSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: (formData.get("description") as string | null) || undefined,
    thumbnail: (formData.get("thumbnail") as string | null) || "",
    isPublished: formData.get("isPublished") === "true",
    category: (formData.get("category") as string | null) || "",
  });
}

export async function createTemplateAction(
  formData: FormData
): Promise<ActionResult> {
  const admin = await requireSuperAdmin();
  const parsed = parseTemplate(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the form for errors.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }
  const slug = slugify(parsed.data.slug);
  const conflict = await prisma.siteTemplate.findUnique({ where: { slug } });
  if (conflict) {
    return {
      ok: false,
      error: "That slug is already taken.",
      fieldErrors: { slug: ["That slug is already taken."] },
    };
  }
  const template = await prisma.siteTemplate.create({
    data: {
      name: parsed.data.name.trim(),
      slug,
      description: parsed.data.description?.trim() || null,
      thumbnail: parsed.data.thumbnail || null,
      isPublished: parsed.data.isPublished,
      category: parsed.data.category?.trim() || null,
    },
  });
  await writePlatformAudit({ actorId: admin.id, action: "template.created", targetType: "template", targetId: template.id, summary: `Template ${template.name} dibuat` });
  revalidatePath("/admin/templates");
  return { ok: true };
}

/**
 * Menyalin blok satu halaman yang sudah jadi menjadi template platform.
 *
 * Halaman template dulu hanya mengelola metadata — nama, slug, thumbnail —
 * tanpa satu pun kolom konten, jadi apa pun yang dibuat di sana tidak pernah
 * muncul di builder. Menyalin dari halaman nyata jauh lebih berguna daripada
 * mengetik ulang susunan block.
 */
export async function createTemplateFromPageAction(
  formData: FormData
): Promise<ActionResult> {
  const admin = await requireSuperAdmin();

  const parsed = siteTemplateFromPageSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: (formData.get("description") as string | null) || undefined,
    thumbnail: (formData.get("thumbnail") as string | null) || "",
    isPublished: formData.get("isPublished") === "true",
    category: (formData.get("category") as string | null) || "",
    pageId: formData.get("pageId"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Periksa kembali isian yang ditandai.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const slug = slugify(parsed.data.slug);
  const conflict = await prisma.siteTemplate.findUnique({ where: { slug } });
  if (conflict) {
    return {
      ok: false,
      error: "Slug itu sudah dipakai.",
      fieldErrors: { slug: ["Slug itu sudah dipakai."] },
    };
  }

  const page = await prisma.page.findUnique({
    where: { id: parsed.data.pageId },
    select: {
      blocks: { orderBy: { order: "asc" }, select: { type: true, data: true } },
      website: { select: { designTokens: true } },
    },
  });
  if (!page) return { ok: false, error: "Halaman tidak ditemukan." };

  // Divalidasi ulang: halaman bisa memuat block dari versi skema yang lebih
  // lama, dan template yang gagal diterapkan lebih buruk daripada tidak ada.
  const blocks = pageBlocksSchema.safeParse(
    page.blocks.map((block) => ({ type: block.type, data: block.data }))
  );
  if (!blocks.success) {
    return {
      ok: false,
      error: "Block di halaman itu tidak lolos validasi, jadi tidak bisa dijadikan template.",
    };
  }
  if (blocks.data.length === 0) {
    return { ok: false, error: "Halaman itu belum punya block." };
  }

  const template = await prisma.siteTemplate.create({
    data: {
      name: parsed.data.name.trim(),
      slug,
      description: parsed.data.description?.trim() || null,
      thumbnail: parsed.data.thumbnail || null,
      isPublished: parsed.data.isPublished,
      category: parsed.data.category?.trim() || null,
      blocks: blocks.data as object[],
      blockCount: blocks.data.length,
      designTokens: (page.website.designTokens as object) ?? undefined,
    },
  });
  await writePlatformAudit({ actorId: admin.id, action: "template.created_from_page", targetType: "template", targetId: template.id, summary: `Template ${template.name} dibuat dari halaman`, metadata: { pageId: parsed.data.pageId } });

  revalidatePath("/admin/templates");
  return { ok: true };
}

export async function updateTemplateAction(
  templateId: string,
  formData: FormData
): Promise<ActionResult> {
  const admin = await requireSuperAdmin();
  const parsed = parseTemplate(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the form for errors.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }
  const slug = slugify(parsed.data.slug);
  const conflict = await prisma.siteTemplate.findFirst({
    where: { slug, NOT: { id: templateId } },
    select: { id: true },
  });
  if (conflict) {
    return {
      ok: false,
      error: "That slug is already taken.",
      fieldErrors: { slug: ["That slug is already taken."] },
    };
  }
  // Template tanpa block tidak bisa diterapkan; menerbitkannya hanya akan
  // menampilkan pilihan yang menghasilkan halaman kosong.
  const existing = await prisma.siteTemplate.findUnique({
    where: { id: templateId },
    select: { blockCount: true },
  });
  if (parsed.data.isPublished && (existing?.blockCount ?? 0) === 0) {
    return {
      ok: false,
      error:
        "Template ini belum punya block, jadi belum bisa diterbitkan. Buat ulang dari sebuah halaman.",
    };
  }

  await prisma.siteTemplate.update({
    where: { id: templateId },
    data: {
      name: parsed.data.name.trim(),
      slug,
      description: parsed.data.description?.trim() || null,
      thumbnail: parsed.data.thumbnail || null,
      isPublished: parsed.data.isPublished,
      category: parsed.data.category?.trim() || null,
    },
  });
  await writePlatformAudit({ actorId: admin.id, action: "template.updated", targetType: "template", targetId: templateId, summary: `Template ${parsed.data.name.trim()} diperbarui` });
  revalidatePath("/admin/templates");
  return { ok: true };
}

export async function deleteTemplateAction(
  templateId: string
): Promise<ActionResult> {
  const admin = await requireSuperAdmin();
  const template = await prisma.siteTemplate.delete({ where: { id: templateId } });
  await writePlatformAudit({ actorId: admin.id, action: "template.deleted", targetType: "template", targetId: templateId, summary: `Template ${template.name} dihapus` });
  revalidatePath("/admin/templates");
  return { ok: true };
}

// ----- Reports -----

export async function createReportAction(
  formData: FormData
): Promise<ActionResult> {
  const admin = await requireSuperAdmin();
  const parsed = abuseReportSchema.safeParse({
    workspaceId: (formData.get("workspaceId") as string | null) || "",
    reporterEmail: (formData.get("reporterEmail") as string | null) || "",
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the form for errors.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const report = await prisma.abuseReport.create({
    data: {
      workspaceId: parsed.data.workspaceId || null,
      reporterEmail: parsed.data.reporterEmail || null,
      reason: parsed.data.reason.trim(),
    },
  });
  await writePlatformAudit({ actorId: admin.id, action: "report.created", targetType: "report", targetId: report.id, summary: "Laporan abuse dibuat" });
  revalidatePath("/admin/reports");
  return { ok: true };
}

export async function setReportStatusAction(
  reportId: string,
  status: AbuseReportStatus
): Promise<ActionResult> {
  const admin = await requireSuperAdmin();
  await prisma.abuseReport.update({ where: { id: reportId }, data: { status } });
  await writePlatformAudit({ actorId: admin.id, action: "report.status_changed", targetType: "report", targetId: reportId, summary: `Status laporan diubah ke ${status}` });
  revalidatePath("/admin/reports");
  return { ok: true };
}

export async function deleteReportAction(
  reportId: string
): Promise<ActionResult> {
  const admin = await requireSuperAdmin();
  await prisma.abuseReport.delete({ where: { id: reportId } });
  await writePlatformAudit({ actorId: admin.id, action: "report.deleted", targetType: "report", targetId: reportId, summary: "Laporan abuse dihapus" });
  revalidatePath("/admin/reports");
  return { ok: true };
}

// ----- Errors -----

/** Resolved errors older than this are deleted the next time anything is resolved. */
const RESOLVED_ERROR_RETENTION_DAYS = 30;

export async function setErrorEventResolvedAction(formData: FormData): Promise<void> {
  const admin = await requireSuperAdmin();
  const id = String(formData.get("id") ?? "");
  const resolve = formData.get("resolve") === "true";
  if (!id) return;

  await prisma.errorEvent.updateMany({
    where: { id },
    data: { resolvedAt: resolve ? new Date() : null },
  });
  await writePlatformAudit({ actorId: admin.id, action: resolve ? "error.resolved" : "error.reopened", targetType: "error", targetId: id, summary: resolve ? "Error ditandai selesai" : "Error dibuka kembali" });
  if (resolve) {
    await prisma.errorEvent.deleteMany({
      where: {
        resolvedAt: {
          lt: new Date(Date.now() - RESOLVED_ERROR_RETENTION_DAYS * 24 * 60 * 60 * 1000),
        },
      },
    });
  }
  revalidatePath("/admin/errors");
  revalidatePath("/admin");
}
