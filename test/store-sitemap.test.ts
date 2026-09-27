import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Real Postgres: the sitemap is a query across products, posts and pages, and
// what it must leave out (drafts, archived products) is a database condition.
vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/prisma";
import {
  buildStoreSitemap,
  renderSitemapXml,
  renderStoreRobotsTxt,
} from "@/lib/store-sitemap";

let workspaceId = "";
let ownerId = "";
let slug = "";

beforeAll(async () => {
  const tag = `sitemap-${Date.now()}`;
  slug = tag;
  const owner = await prisma.user.create({
    data: { name: tag, email: `${tag}@buildery.test`, role: "OWNER" },
  });
  ownerId = owner.id;
  const workspace = await prisma.workspace.create({
    data: { name: tag, slug: tag, createdById: owner.id },
  });
  workspaceId = workspace.id;

  await prisma.product.createMany({
    data: [
      { workspaceId, name: "Kaos", slug: "kaos", type: "PHYSICAL", status: "ACTIVE", price: 100_000 },
      { workspaceId, name: "Draft", slug: "draft", type: "PHYSICAL", status: "DRAFT", price: 100_000 },
    ],
  });
  const post = await prisma.blogPost.create({
    data: {
      workspaceId,
      title: "Tips",
      slug: "tips",
      status: "DRAFT",
      body: "Isi artikel.",
      authorId: owner.id,
    },
  });
  await prisma.blogPostVersion.create({
    data: {
      postId: post.id,
      version: 1,
      title: post.title,
      slug: post.slug,
      body: post.body,
      authorName: owner.name,
      tags: [],
    },
  });
  await prisma.blogPost.update({
    where: { id: post.id },
    data: {
      status: "PUBLISHED",
      publishedSlug: post.slug,
      publishedVersion: 1,
      publishedAt: new Date(),
    },
  });
});

afterAll(async () => {
  await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  await prisma.user.delete({ where: { id: ownerId } }).catch(() => {});
});

describe("buildStoreSitemap", () => {
  it("lists the storefront, its catalogue and published content", async () => {
    const entries = await buildStoreSitemap({ id: workspaceId, slug });
    const locs = entries.map((entry) => entry.loc);

    expect(locs[0]).toContain(slug);
    expect(locs.some((loc) => loc.endsWith("/products"))).toBe(true);
    expect(locs.some((loc) => loc.endsWith("/products/kaos"))).toBe(true);
    expect(locs.some((loc) => loc.endsWith("/blog/tips"))).toBe(true);
  });

  it("leaves out anything a shopper cannot open", async () => {
    const entries = await buildStoreSitemap({ id: workspaceId, slug });
    const locs = entries.map((entry) => entry.loc);

    // A draft product is not public, so pointing a crawler at it is a 404.
    expect(locs.some((loc) => loc.endsWith("/products/draft"))).toBe(false);
    expect(locs.some((loc) => loc.includes("/checkout"))).toBe(false);
    expect(locs.some((loc) => loc.includes("/cart"))).toBe(false);
  });

  it("never lists the same URL twice", async () => {
    const entries = await buildStoreSitemap({ id: workspaceId, slug });
    expect(new Set(entries.map((entry) => entry.loc)).size).toBe(entries.length);
  });
});

describe("renderSitemapXml", () => {
  it("produces a valid urlset and escapes the URLs", () => {
    const xml = renderSitemapXml([
      {
        loc: "https://toko.landing.my.id/products/a?b=1&c=2",
        lastModified: new Date("2026-09-13T10:00:00Z"),
        changefreq: "weekly",
        priority: "0.8",
      },
    ]);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<urlset");
    expect(xml).toContain("&amp;c=2");
    expect(xml).toContain("<lastmod>2026-09-13</lastmod>");
    expect(xml).not.toContain("&c=2");
  });

  it("omits lastmod when nothing is known", () => {
    const xml = renderSitemapXml([
      { loc: "https://toko.landing.my.id/", lastModified: null, changefreq: "daily", priority: "1.0" },
    ]);
    expect(xml).not.toContain("<lastmod>");
  });
});

describe("renderStoreRobotsTxt", () => {
  it("keeps the private pages out and advertises the sitemap", () => {
    const txt = renderStoreRobotsTxt("toko");
    expect(txt).toContain("Disallow: /checkout");
    expect(txt).toContain("Disallow: /cart");
    expect(txt).toContain("Disallow: /member");
    expect(txt).toMatch(/Sitemap: https?:\/\/.*sitemap\.xml/);
  });
});
