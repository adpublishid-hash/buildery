"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { assertCanCreate } from "@/lib/saas-limits";
import { slugify } from "@/lib/slug";
import { writeWorkspaceAudit } from "@/lib/workspace-audit";

type Result = { ok: true; workspaceId: string } | { ok: false; error: string };

export async function cloneWorkspaceAction(sourceId: string, formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const membership = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: sourceId, userId: session.user.id } } });
  if (!membership || !canInWorkspace(membership.role, "workspace.edit")) return { ok: false, error: "Tidak diizinkan." };
  const limit = await assertCanCreate(session.user.id, "workspace");
  if (limit) return { ok: false, error: limit };

  const name = String(formData.get("name") ?? "").trim();
  const slug = slugify(String(formData.get("slug") ?? ""));
  if (name.length < 2 || slug.length < 3) return { ok: false, error: "Nama atau slug tidak valid." };
  if (await prisma.workspace.findUnique({ where: { slug }, select: { id: true } })) return { ok: false, error: "Slug sudah digunakan." };
  const copyPages = formData.get("pages") === "true";
  const copyForms = formData.get("forms") === "true";
  const copyStore = formData.get("store") === "true";
  const source = await prisma.workspace.findUnique({
    where: { id: sourceId },
    include: {
      websites: { include: { pages: { include: { blocks: true } } } },
      forms: { include: { fields: true } },
      storefrontSetting: true,
      ecommerceSetting: true,
      savedSections: true,
    },
  });
  if (!source) return { ok: false, error: "Workspace sumber tidak ditemukan." };

  const created = await prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: {
        name, slug, createdById: session.user.id,
        logoUrl: source.logoUrl, faviconUrl: source.faviconUrl, primaryColor: source.primaryColor,
        language: source.language, locale: source.locale, timezone: source.timezone,
        currencyCode: source.currencyCode, dateFormat: source.dateFormat,
        members: { create: { userId: session.user.id, role: "OWNER", lastOpenedAt: new Date() } },
      },
    });
    if (copyPages && source.websites) {
      for (const website of source.websites) {
        const nextWebsite = await tx.website.create({ data: { workspaceId: workspace.id, name: website.name, slug: website.slug, description: website.description, designTokens: website.designTokens as Prisma.InputJsonValue } });
        for (const page of website.pages) {
          await tx.page.create({ data: { websiteId: nextWebsite.id, title: page.title, slug: page.slug, status: "DRAFT", seoTitle: page.seoTitle, metaDescription: page.metaDescription, ogImage: page.ogImage, canonicalUrl: page.canonicalUrl, noindex: page.noindex, blocks: { create: page.blocks.map((block) => ({ type: block.type, order: block.order, data: block.data as Prisma.InputJsonValue })) } } });
        }
      }
      for (const section of source.savedSections ?? []) {
        await tx.savedSection.create({ data: { workspaceId: workspace.id, name: section.name, blocks: section.blocks as Prisma.InputJsonValue, blockCount: section.blockCount, createdById: session.user.id } });
      }
    }
    if (copyForms && source.forms) {
      for (const form of source.forms) {
        await tx.form.create({ data: { workspaceId: workspace.id, title: form.title, slug: form.slug, description: form.description, successMessage: form.successMessage, submitLabel: form.submitLabel, status: "DRAFT", isOpen: false, closedMessage: form.closedMessage, multiStep: form.multiStep, redirectUrl: form.redirectUrl, fields: { create: form.fields.map((field) => ({ label: field.label, name: field.name, type: field.type, required: field.required, placeholder: field.placeholder, helpText: field.helpText, options: field.options ?? undefined, order: field.order, pageStep: field.pageStep, minLength: field.minLength, maxLength: field.maxLength, minValue: field.minValue, maxValue: field.maxValue, pattern: field.pattern, patternHint: field.patternHint, acceptMime: field.acceptMime, visibleIf: field.visibleIf ?? undefined })) } } });
      }
    }
    if (copyStore) {
      if (source.storefrontSetting) {
        const s = source.storefrontSetting;
        await tx.storefrontSetting.create({ data: { workspaceId: workspace.id, navBlogLabel: s.navBlogLabel, navCoursesLabel: s.navCoursesLabel, navProductsLabel: s.navProductsLabel, navMembershipsLabel: s.navMembershipsLabel, navCartLabel: s.navCartLabel, navAccountLabel: s.navAccountLabel, navLoginLabel: s.navLoginLabel, navCustomLinks: s.navCustomLinks as Prisma.InputJsonValue, footerEnabled: s.footerEnabled, footerText: s.footerText, footerCopyright: s.footerCopyright, salesNotificationEnabled: false } });
      }
      if (source.ecommerceSetting) {
        const e = source.ecommerceSetting;
        await tx.ecommerceSetting.create({ data: { workspaceId: workspace.id, currencyCode: e.currencyCode, currencyLocale: e.currencyLocale, currencySymbol: e.currencySymbol, currencySymbolPosition: e.currencySymbolPosition, thousandSeparator: e.thousandSeparator, decimalSeparator: e.decimalSeparator, decimalPlaces: e.decimalPlaces, checkoutRequireLogin: e.checkoutRequireLogin, checkoutAutoCreateAccount: e.checkoutAutoCreateAccount, checkoutCouponEnabled: e.checkoutCouponEnabled, checkoutSellerNoteEnabled: e.checkoutSellerNoteEnabled, defaultDimensionUnit: e.defaultDimensionUnit, defaultWeightUnit: e.defaultWeightUnit, lowStockThreshold: e.lowStockThreshold, taxEnabled: e.taxEnabled, taxRateBps: e.taxRateBps, pricesIncludeTax: e.pricesIncludeTax } });
      }
    }
    await writeWorkspaceAudit(tx, { workspaceId: workspace.id, actorId: session.user.id, action: "workspace.cloned", summary: `Workspace dibuat dari ${source.name}`, targetType: "workspace", targetId: sourceId, metadata: { copyPages, copyForms, copyStore } });
    return workspace;
  });
  revalidatePath("/dashboard/workspaces");
  return { ok: true, workspaceId: created.id };
}
