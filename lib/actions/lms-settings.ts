"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { canInWorkspace } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspace";

type ActionResult = { ok: true } | { ok: false; error: string };

function clean(formData: FormData, key: string, max: number) {
  const value = String(formData.get(key) ?? "").trim();
  return value.length ? value.slice(0, max) : null;
}

export async function updateLmsCatalogSettingsAction(
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) {
    return { ok: false, error: "You don't have permission to edit this." };
  }

  const data = {
    catalogEyebrow: clean(formData, "catalogEyebrow", 80),
    catalogHeading: clean(formData, "catalogHeading", 200),
    catalogSubheading: clean(formData, "catalogSubheading", 500),
  };

  await prisma.lmsSetting.upsert({
    where: { workspaceId: current.workspace.id },
    update: data,
    create: { workspaceId: current.workspace.id, ...data },
  });

  revalidatePath("/dashboard/courses/settings");
  return { ok: true };
}
