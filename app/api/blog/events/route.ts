import { NextResponse, type NextRequest } from "next/server";

import { VISITOR_COOKIE } from "@/lib/analytics-visitor";
import { prisma } from "@/lib/prisma";
import { rateLimitByIp } from "@/lib/rate-limit";

const TYPES = new Set(["VIEW", "READ_COMPLETE", "SHARE"]);

export async function POST(req: NextRequest) {
  const limit = await rateLimitByIp("blog-event", 90, 60 * 1000);
  if (!limit.ok) return NextResponse.json({ ok: false }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
  const postId = typeof body.postId === "string" ? body.postId : "";
  const type = typeof body.type === "string" ? body.type : "";
  if (!workspaceId || !postId || !TYPES.has(type)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const post = await prisma.blogPost.findUnique({
    where: { id: postId },
    select: { workspaceId: true, status: true, publishedVersion: true },
  });
  if (
    !post ||
    post.workspaceId !== workspaceId ||
    !post.publishedVersion ||
    !["PUBLISHED", "SCHEDULED"].includes(post.status)
  ) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await prisma.blogPostEvent.create({
    data: {
      workspaceId,
      postId,
      type: type as "VIEW" | "READ_COMPLETE" | "SHARE",
      visitorId: req.cookies.get(VISITOR_COOKIE)?.value ?? null,
      path: typeof body.path === "string" ? body.path.slice(0, 500) : null,
      referrer:
        typeof body.referrer === "string" ? body.referrer.slice(0, 1000) : null,
      platform:
        typeof body.platform === "string" ? body.platform.slice(0, 40) : null,
    },
  });
  return NextResponse.json({ ok: true });
}
