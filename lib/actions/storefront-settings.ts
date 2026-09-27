"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { canInWorkspace } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspace";
import { sanitizeCustomLinks } from "@/lib/storefront-nav";

type ActionResult = { ok: true } | { ok: false; error: string };

function clean(formData: FormData, key: string, max = 40) {
  const value = String(formData.get(key) ?? "").trim();
  return value.length ? value.slice(0, max) : null;
}

export async function updateStorefrontNavAction(
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) {
    return { ok: false, error: "You don't have permission to edit this." };
  }

  let customLinks: { label: string; href: string }[] = [];
  try {
    customLinks = sanitizeCustomLinks(
      JSON.parse(String(formData.get("navCustomLinks") ?? "[]"))
    );
  } catch {
    customLinks = [];
  }

  const data = {
    navBlogLabel: clean(formData, "navBlogLabel"),
    navCoursesLabel: clean(formData, "navCoursesLabel"),
    navProductsLabel: clean(formData, "navProductsLabel"),
    navMembershipsLabel: clean(formData, "navMembershipsLabel"),
    navCartLabel: clean(formData, "navCartLabel"),
    navAccountLabel: clean(formData, "navAccountLabel"),
    navLoginLabel: clean(formData, "navLoginLabel"),
    navCustomLinks: customLinks,
  };

  await prisma.storefrontSetting.upsert({
    where: { workspaceId: current.workspace.id },
    update: data,
    create: { workspaceId: current.workspace.id, ...data },
  });

  revalidatePath("/dashboard/theme");
  return { ok: true };
}

export async function updateStorefrontFooterAction(
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) {
    return { ok: false, error: "You don't have permission to edit this." };
  }

  const data = {
    footerEnabled: formData.get("footerEnabled") === "true",
    footerText: clean(formData, "footerText", 300),
    footerCopyright: clean(formData, "footerCopyright", 120),
  };

  await prisma.storefrontSetting.upsert({
    where: { workspaceId: current.workspace.id },
    update: data,
    create: { workspaceId: current.workspace.id, ...data },
  });

  revalidatePath("/dashboard/theme");
  return { ok: true };
}

/**
 * Storefront social-proof popup. The template text is stored raw and
 * interpolated at render time, so it is given a generous ceiling rather than
 * the short one the nav labels use.
 */
export async function updateSalesNotificationAction(
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) {
    return { ok: false, error: "You don't have permission to edit this." };
  }

  const data = {
    salesNotificationEnabled:
      formData.get("salesNotificationEnabled") === "true",
    salesNotificationText: clean(formData, "salesNotificationText", 300),
  };

  await prisma.storefrontSetting.upsert({
    where: { workspaceId: current.workspace.id },
    update: data,
    create: { workspaceId: current.workspace.id, ...data },
  });

  revalidatePath("/dashboard/theme");
  revalidatePath("/dashboard/settings");
  revalidatePath(`/site/${current.workspace.slug}`);
  return { ok: true };
}
