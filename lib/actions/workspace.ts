"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CURRENT_WORKSPACE_COOKIE } from "@/lib/workspace";
import { canInWorkspace } from "@/lib/permissions";
import { assertCanCreate, getUserPlan } from "@/lib/saas-limits";
import { writeWorkspaceAudit } from "@/lib/workspace-audit";
import { slugify } from "@/lib/slug";
import { normalizeDomain, isPlatformDomain } from "@/lib/domain";
import { PUBLIC_SITE_DOMAIN } from "@/lib/public-url";
import {
  createWorkspaceSchema,
  updateBrandingSchema,
  updateWorkspaceGeneralSchema,
} from "@/lib/zod";

type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

async function ensurePermission(
  workspaceId: string,
  userId: string,
  permission: Parameters<typeof canInWorkspace>[1]
) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    include: { workspace: { select: { status: true } } },
  });
  if (!membership) return null;
  if (membership.workspace.status !== "ACTIVE") return null;
  if (!canInWorkspace(membership.role, permission)) return null;
  return membership;
}

export async function createWorkspaceAction(formData: FormData): Promise<ActionResult<{ id: string; slug: string }>> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const parsed = createWorkspaceSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Periksa kembali isian form.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const overLimit = await assertCanCreate(session.user.id, "workspace");
  if (overLimit) {
    return { ok: false, error: overLimit };
  }

  const name = parsed.data.name.trim();
  const requestedSlug = slugify(parsed.data.slug);

  const conflict = await prisma.workspace.findUnique({
    where: { slug: requestedSlug },
    select: { id: true },
  });
  if (conflict) {
    return {
      ok: false,
      error: "Slug tersebut sudah digunakan.",
      fieldErrors: { slug: ["Slug tersebut sudah digunakan."] },
    };
  }

  const workspace = await prisma.workspace.create({
    data: {
      name,
      slug: requestedSlug,
      createdById: session.user.id,
      members: {
        create: {
          userId: session.user.id,
          role: "OWNER",
        },
      },
    },
  });

  await writeWorkspaceAudit(prisma, {
    workspaceId: workspace.id,
    actorId: session.user.id,
    action: "workspace.created",
    summary: `Workspace ${workspace.name} dibuat`,
    targetType: "workspace",
    targetId: workspace.id,
  });

  cookies().set(CURRENT_WORKSPACE_COOKIE, workspace.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/dashboard", "layout");
  return { ok: true, data: { id: workspace.id, slug: workspace.slug } };
}

export async function updateWorkspaceGeneralAction(
  workspaceId: string,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const membership = await ensurePermission(
    workspaceId,
    session.user.id,
    "workspace.edit"
  );
  if (!membership) return { ok: false, error: "Tidak diizinkan." };

  const parsed = updateWorkspaceGeneralSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    language: formData.get("language") || "ID",
    locale: formData.get("locale") || "id-ID",
    timezone: formData.get("timezone") || "Asia/Jakarta",
    currencyCode: formData.get("currencyCode") || "IDR",
    dateFormat: formData.get("dateFormat") || "DD/MM/YYYY",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Periksa kembali isian form.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const slug = slugify(parsed.data.slug);
  const slugConflict = await prisma.workspace.findFirst({
    where: { slug, NOT: { id: workspaceId } },
    select: { id: true },
  });
  const historyConflict = await prisma.workspaceSlugHistory.findFirst({
    where: { slug, workspaceId: { not: workspaceId } },
    select: { id: true },
  });
  if (slugConflict || historyConflict) {
    return {
      ok: false,
      error: "Slug tersebut sudah digunakan.",
      fieldErrors: { slug: ["Slug tersebut sudah digunakan."] },
    };
  }

  const previous = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { name: true, slug: true },
  });
  const currency = {
    IDR: { symbol: "Rp", decimals: 0 },
    USD: { symbol: "$", decimals: 2 },
    SGD: { symbol: "S$", decimals: 2 },
    MYR: { symbol: "RM", decimals: 2 },
  }[parsed.data.currencyCode] ?? { symbol: parsed.data.currencyCode, decimals: 2 };
  await prisma.$transaction(async (tx) => {
    if (previous.slug !== slug) {
      await tx.workspaceSlugHistory.deleteMany({ where: { workspaceId, slug } });
      await tx.workspaceSlugHistory.upsert({
        where: { slug: previous.slug },
        update: { workspaceId },
        create: { workspaceId, slug: previous.slug },
      });
    }
    await tx.workspace.update({
      where: { id: workspaceId },
      data: {
        name: parsed.data.name.trim(),
        slug,
        language: parsed.data.language,
        locale: parsed.data.locale,
        timezone: parsed.data.timezone,
        currencyCode: parsed.data.currencyCode,
        dateFormat: parsed.data.dateFormat,
        ecommerceSetting: {
          upsert: {
            create: {
              currencyCode: parsed.data.currencyCode,
              currencyLocale: parsed.data.locale,
              currencySymbol: currency.symbol,
              decimalPlaces: currency.decimals,
            },
            update: {
              currencyCode: parsed.data.currencyCode,
              currencyLocale: parsed.data.locale,
              currencySymbol: currency.symbol,
              decimalPlaces: currency.decimals,
            },
          },
        },
      },
    });
    await writeWorkspaceAudit(tx, {
      workspaceId,
      actorId: session.user.id,
      action: "workspace.updated",
      summary: "Pengaturan umum workspace diperbarui",
      targetType: "workspace",
      targetId: workspaceId,
      metadata: { previousSlug: previous.slug, slug },
    });
  });

  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

export async function updateBrandingAction(
  workspaceId: string,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const membership = await ensurePermission(
    workspaceId,
    session.user.id,
    "branding.edit"
  );
  if (!membership) return { ok: false, error: "Tidak diizinkan." };

  const rawDomain = String(formData.get("customDomain") ?? "");
  const normalizedDomain = rawDomain.trim() ? normalizeDomain(rawDomain) : "";

  const parsed = updateBrandingSchema.safeParse({
    logoUrl: formData.get("logoUrl"),
    faviconUrl: formData.get("faviconUrl"),
    primaryColor: formData.get("primaryColor"),
    customDomain: normalizedDomain,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Periksa kembali isian form.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const customDomain = parsed.data.customDomain?.trim().toLowerCase() || null;
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { customDomain: true, customDomainVerificationToken: true, createdById: true },
  });
  if (!workspace) return { ok: false, error: "Workspace tidak ditemukan." };
  if (customDomain) {
    const plan = await getUserPlan(workspace.createdById);
    if (!plan.customDomainEnabled) {
      return { ok: false, error: "Custom domain tidak tersedia pada paket saat ini." };
    }
  }
  if (customDomain && isPlatformDomain(customDomain, PUBLIC_SITE_DOMAIN)) {
    return {
      ok: false,
      error: `Tidak bisa memakai domain bawaan platform (${PUBLIC_SITE_DOMAIN}).`,
      fieldErrors: {
        customDomain: [`Gunakan domain milikmu sendiri, bukan ${PUBLIC_SITE_DOMAIN}.`],
      },
    };
  }
  if (customDomain) {
    const conflict = await prisma.workspace.findFirst({
      where: { customDomain, NOT: { id: workspaceId } },
      select: { id: true },
    });
    if (conflict) {
      return {
        ok: false,
        error: "Domain tersebut sudah digunakan.",
        fieldErrors: { customDomain: ["Domain tersebut sudah digunakan."] },
      };
    }
  }

  const domainChanged = workspace.customDomain !== customDomain;
  const domainNeedsVerification = domainChanged || Boolean(customDomain && !workspace.customDomainVerificationToken);
  await prisma.$transaction(async (tx) => {
    await tx.workspace.update({
      where: { id: workspaceId },
      data: {
        logoUrl: parsed.data.logoUrl?.trim() || null,
        faviconUrl: parsed.data.faviconUrl?.trim() || null,
        primaryColor: parsed.data.primaryColor,
        customDomain,
        ...(domainNeedsVerification
          ? {
              customDomainStatus: customDomain ? "PENDING" : "UNCONFIGURED",
              customDomainVerificationToken: customDomain
                ? randomBytes(18).toString("hex")
                : null,
              customDomainVerifiedAt: null,
              customDomainLastCheckedAt: null,
              customDomainError: null,
              customDomainSslStatus: customDomain ? "PENDING" : "UNCONFIGURED",
              customDomainSslExpiresAt: null,
            }
          : {}),
      },
    });
    await writeWorkspaceAudit(tx, {
      workspaceId,
      actorId: session.user.id,
      action: "workspace.branding_updated",
      summary: domainChanged ? "Branding dan custom domain diperbarui" : "Branding diperbarui",
      targetType: "workspace",
      targetId: workspaceId,
      metadata: { customDomain, domainChanged },
    });
  });

  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

export async function deleteWorkspaceAction(
  workspaceId: string,
  confirmName: string
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const membership = await ensurePermission(
    workspaceId,
    session.user.id,
    "workspace.delete"
  );
  if (!membership) return { ok: false, error: "Hanya pemilik yang bisa menghapus workspace ini." };

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { name: true },
  });
  if (!workspace) return { ok: false, error: "Workspace tidak ditemukan." };
  if (workspace.name !== confirmName) {
    return { ok: false, error: "Nama workspace tidak cocok." };
  }

  const deleteAfter = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.$transaction(async (tx) => {
    await writeWorkspaceAudit(tx, {
      workspaceId,
      actorId: session.user.id,
      action: "workspace.deletion_scheduled",
      summary: "Penghapusan workspace dijadwalkan dalam 30 hari",
      targetType: "workspace",
      targetId: workspaceId,
      metadata: { deleteAfter: deleteAfter.toISOString() },
    });
    await tx.workspace.update({
      where: { id: workspaceId },
      data: {
        status: "PENDING_DELETION",
        deletionRequestedAt: new Date(),
        deleteAfter,
      },
    });
  });

  const cookieId = cookies().get(CURRENT_WORKSPACE_COOKIE)?.value;
  if (cookieId === workspaceId) {
    cookies().delete(CURRENT_WORKSPACE_COOKIE);
  }

  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function restoreWorkspaceAction(workspaceId: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (membership?.role !== "OWNER") return { ok: false, error: "Hanya pemilik yang dapat memulihkan workspace." };

  await prisma.$transaction(async (tx) => {
    await tx.workspace.update({
      where: { id: workspaceId },
      data: { status: "ACTIVE", deletionRequestedAt: null, deleteAfter: null },
    });
    await writeWorkspaceAudit(tx, {
      workspaceId,
      actorId: session.user.id,
      action: "workspace.restored",
      summary: "Workspace dipulihkan",
      targetType: "workspace",
      targetId: workspaceId,
    });
  });
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
