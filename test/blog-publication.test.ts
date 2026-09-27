import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T,>(callback: T) => callback,
}));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (callback: () => unknown) => callback,
}));

import {
  publishBlogPost,
  publishScheduledBlogPost,
  scheduleBlogPost,
} from "@/lib/blog-publication";
import { prisma } from "@/lib/prisma";
import { findBlogSlugRedirect, publicBlogIndex, publicBlogPost } from "@/lib/public-blog";

let ownerId = "";
let workspaceId = "";

beforeAll(async () => {
  const key = `blog-publication-${Date.now()}`;
  const owner = await prisma.user.create({
    data: { name: "Blog Author", email: `${key}@buildery.test`, role: "OWNER" },
  });
  ownerId = owner.id;
  const workspace = await prisma.workspace.create({
    data: { name: "Editorial", slug: key, createdById: owner.id },
  });
  workspaceId = workspace.id;
});

afterAll(async () => {
  await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  await prisma.user.delete({ where: { id: ownerId } }).catch(() => {});
});

describe("blog publication lifecycle", () => {
  it("keeps immutable public versions and remembers a replaced slug", async () => {
    const post = await prisma.blogPost.create({
      data: {
        workspaceId,
        authorId: ownerId,
        title: "First title",
        slug: "first-slug",
        body: "<p>First body</p>",
      },
    });

    await publishBlogPost(post.id);
    const firstPublic = await publicBlogPost(workspaceId, "first-slug");
    expect(firstPublic?.title).toBe("First title");
    const index = await publicBlogIndex({ workspaceId, page: 1, pageSize: 20 });
    expect(index.posts.some((item) => item.postId === post.id)).toBe(true);
    await prisma.blogPost.update({
      where: { id: post.id },
      data: { title: "Second title", slug: "second-slug", body: "<p>Second body</p>" },
    });

    const beforeRepublish = await prisma.blogPost.findUniqueOrThrow({
      where: { id: post.id },
      include: { versions: { orderBy: { version: "asc" } } },
    });
    expect(beforeRepublish.publishedVersion).toBe(1);
    expect(beforeRepublish.versions[0].title).toBe("First title");

    await publishBlogPost(post.id);
    const republished = await prisma.blogPost.findUniqueOrThrow({
      where: { id: post.id },
      include: { versions: { orderBy: { version: "asc" } }, slugHistory: true },
    });
    expect(republished.publishedVersion).toBe(2);
    expect(republished.publishedSlug).toBe("second-slug");
    expect(republished.versions.map((version) => version.title)).toEqual([
      "First title",
      "Second title",
    ]);
    expect(republished.slugHistory.map((item) => item.slug)).toContain("first-slug");
    expect(await findBlogSlugRedirect(workspaceId, "first-slug")).toBe("second-slug");
  });

  it("snapshots scheduled content and promotes it only when due", async () => {
    const post = await prisma.blogPost.create({
      data: {
        workspaceId,
        authorId: ownerId,
        title: "Scheduled title",
        slug: `scheduled-${Date.now()}`,
        body: "<p>Scheduled body</p>",
      },
    });
    const scheduled = await scheduleBlogPost(
      post.id,
      new Date(Date.now() + 60 * 60 * 1000)
    );
    const waiting = await prisma.blogPost.findUniqueOrThrow({ where: { id: post.id } });
    expect(waiting.status).toBe("SCHEDULED");
    expect(waiting.publishedVersion).toBeNull();
    expect(waiting.scheduledVersion).toBe(scheduled.version);
    expect(
      await prisma.scheduledJob.count({
        where: { dedupeKey: `blog-publish:${post.id}`, status: "PENDING" },
      })
    ).toBe(1);

    await prisma.blogPost.update({
      where: { id: post.id },
      data: { scheduledAt: new Date(Date.now() - 1000) },
    });
    await publishScheduledBlogPost(post.id, scheduled.version);
    const published = await prisma.blogPost.findUniqueOrThrow({ where: { id: post.id } });
    expect(published.status).toBe("PUBLISHED");
    expect(published.publishedVersion).toBe(scheduled.version);
    expect(published.scheduledAt).toBeNull();
  });
});
