import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Real Postgres: the rule that one old address has exactly one owner is a
// unique index, and what happens when a slug is reused is a database question.
vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/prisma";
import { findSlugRedirect, rememberPageSlug } from "@/lib/page-slugs";

let workspaceId = "";
let ownerId = "";
let websiteId = "";
let pageId = "";
let otherPageId = "";

beforeAll(async () => {
  const tag = `slughist-${Date.now()}`;
  const owner = await prisma.user.create({
    data: { name: tag, email: `${tag}@buildery.test`, role: "OWNER" },
  });
  ownerId = owner.id;
  const workspace = await prisma.workspace.create({
    data: { name: tag, slug: tag, createdById: owner.id },
  });
  workspaceId = workspace.id;
  const website = await prisma.website.create({
    data: { workspaceId, name: tag, slug: tag },
  });
  websiteId = website.id;

  const page = await prisma.page.create({
    data: { websiteId, title: "Promo", slug: "promo-baru", status: "PUBLISHED" },
  });
  pageId = page.id;
  const other = await prisma.page.create({
    data: { websiteId, title: "Lain", slug: "lain", status: "PUBLISHED" },
  });
  otherPageId = other.id;
});

afterAll(async () => {
  await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  await prisma.user.delete({ where: { id: ownerId } }).catch(() => {});
});

describe("rememberPageSlug", () => {
  it("redirects the old address to the new one", async () => {
    await rememberPageSlug(prisma, {
      websiteId,
      pageId,
      previousSlug: "promo-lama",
      nextSlug: "promo-baru",
    });
    expect(await findSlugRedirect({ websiteId, slug: "promo-lama" })).toBe(
      "promo-baru"
    );
  });

  it("records nothing when the slug did not change", async () => {
    await rememberPageSlug(prisma, {
      websiteId,
      pageId,
      previousSlug: "promo-baru",
      nextSlug: "promo-baru",
    });
    // Otherwise the live address would redirect to itself.
    expect(await findSlugRedirect({ websiteId, slug: "promo-baru" })).toBeNull();
  });

  it("gives a reclaimed address back to the page that now lives there", async () => {
    await prisma.page.update({
      where: { id: otherPageId },
      data: { slug: "promo-lama" },
    });
    await rememberPageSlug(prisma, {
      websiteId,
      pageId: otherPageId,
      previousSlug: "lain",
      nextSlug: "promo-lama",
    });

    // The old redirect must not shadow a page that is really there now.
    expect(await findSlugRedirect({ websiteId, slug: "promo-lama" })).toBeNull();
    expect(await findSlugRedirect({ websiteId, slug: "lain" })).toBe("promo-lama");
  });

  it("never throws, so a rename cannot fail on its redirect", async () => {
    await expect(
      rememberPageSlug(prisma, {
        websiteId: "no-such-website",
        pageId: "no-such-page",
        previousSlug: "a",
        nextSlug: "b",
      })
    ).resolves.toBeUndefined();
  });
});

describe("findSlugRedirect", () => {
  it("has nothing to say about an address that was never used", async () => {
    expect(await findSlugRedirect({ websiteId, slug: "tidak-pernah-ada" })).toBeNull();
  });

  it("does not redirect to a page that is no longer published", async () => {
    await prisma.page.update({ where: { id: otherPageId }, data: { status: "DRAFT" } });
    // Sending a visitor there would be a 404 one hop later.
    expect(await findSlugRedirect({ websiteId, slug: "lain" })).toBeNull();
    await prisma.page.update({ where: { id: otherPageId }, data: { status: "PUBLISHED" } });
  });
});
