"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { canInWorkspace } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspace";
import { STOREFRONT_PAGES, type StorefrontPageKey } from "@/lib/storefront-content";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateStorefrontPageContentAction(
  pageKey: string,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) {
    return { ok: false, error: "You don't have permission to edit this." };
  }

  const def = STOREFRONT_PAGES[pageKey as StorefrontPageKey];
  if (!def) return { ok: false, error: "Unknown page." };

  const content: Record<string, string> = {};
  for (const f of def.fields) {
    const v = String(formData.get(f.key) ?? "").trim();
    if (v) content[f.key] = v.slice(0, 500);
  }

  await prisma.storefrontPageContent.upsert({
    where: {
      workspaceId_pageKey: { workspaceId: current.workspace.id, pageKey },
    },
    update: { content },
    create: { workspaceId: current.workspace.id, pageKey, content },
  });

  revalidatePath("/dashboard");
  return { ok: true };
}
