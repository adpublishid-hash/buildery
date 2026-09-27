import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { getCurrentWorkspace } from "@/lib/workspace";
import { getOrCreateDefaultWebsite } from "@/lib/website";
import { assertCanCreate } from "@/lib/saas-limits";
import { slugify } from "@/lib/slug";
import { createPageSchema } from "@/lib/zod";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Session expired. Please sign in again." },
      { status: 401 }
    );
  }

  const current = await getCurrentWorkspace(session.user.id);
  if (!current) {
    return NextResponse.json(
      { ok: false, error: "No active workspace." },
      { status: 400 }
    );
  }
  if (!canInWorkspace(current.role, "content.edit")) {
    return NextResponse.json(
      { ok: false, error: "You don't have permission to create pages." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request payload." },
      { status: 400 }
    );
  }

  const parsed = createPageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Please check the form for errors.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const overLimit = await assertCanCreate(
    current.workspace.createdById,
    "page"
  );
  if (overLimit) {
    return NextResponse.json(
      { ok: false, error: overLimit },
      { status: 403 }
    );
  }

  const website = await getOrCreateDefaultWebsite(current.workspace.id);
  const slug = slugify(parsed.data.slug);

  const conflict = await prisma.page.findUnique({
    where: { websiteId_slug: { websiteId: website.id, slug } },
    select: { id: true },
  });
  if (conflict) {
    return NextResponse.json(
      {
        ok: false,
        error: "A page with that slug already exists.",
        fieldErrors: { slug: ["That slug is already taken."] },
      },
      { status: 409 }
    );
  }

  const page = await prisma.page.create({
    data: {
      websiteId: website.id,
      title: parsed.data.title.trim(),
      slug,
      status: "DRAFT",
    },
  });

  revalidatePath("/dashboard/pages");
  return NextResponse.json({
    ok: true,
    data: { pageId: page.id },
  });
}
