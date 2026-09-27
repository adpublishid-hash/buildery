import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/prisma";
import { AUTOSAVE_KEEP, prunePageRevisions } from "@/lib/page-revisions";
import { deleteOrphanUpload } from "@/lib/upload-cleanup";
import { getBuilderTemplateBlocks, listBuilderTemplates } from "@/lib/site-templates";

const tag = `content-${Date.now()}`;
let ownerId = "";
let workspaceId = "";
let websiteId = "";
let pageId = "";

beforeAll(async () => {
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
    data: { websiteId, title: "Beranda", slug: "home" },
  });
  pageId = page.id;
});

afterAll(async () => {
  await prisma.siteTemplate.deleteMany({ where: { slug: { startsWith: tag } } });
  await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  await prisma.user.delete({ where: { id: ownerId } }).catch(() => {});
});

async function seedRevisions(counts: { autosaves: number; manual: number }) {
  await prisma.pageRevision.deleteMany({ where: { pageId } });
  let version = 1;
  for (let i = 0; i < counts.manual; i++) {
    await prisma.pageRevision.create({
      data: {
        pageId,
        version: version++,
        source: "MANUAL",
        blocks: [],
        blockCount: 0,
        createdById: ownerId,
      },
    });
  }
  for (let i = 0; i < counts.autosaves; i++) {
    await prisma.pageRevision.create({
      data: {
        pageId,
        version: version++,
        source: "AUTOSAVE",
        blocks: [],
        blockCount: 0,
        createdById: ownerId,
      },
    });
  }
}

describe("prunePageRevisions", () => {
  it("never lets autosave churn evict deliberate checkpoints", async () => {
    // Inti bug lama: satu kuota untuk semua, jadi satu sesi menggarap serius
    // menghapus versi manual dan versi terbit dari kemarin.
    await seedRevisions({ autosaves: AUTOSAVE_KEEP + 40, manual: 5 });

    await prunePageRevisions(prisma, pageId);

    const manual = await prisma.pageRevision.count({
      where: { pageId, source: "MANUAL" },
    });
    const autosaves = await prisma.pageRevision.count({
      where: { pageId, source: "AUTOSAVE" },
    });

    expect(manual).toBe(5);
    expect(autosaves).toBe(AUTOSAVE_KEEP);
  });

  it("keeps the newest autosaves, not the oldest", async () => {
    await seedRevisions({ autosaves: AUTOSAVE_KEEP + 3, manual: 0 });

    await prunePageRevisions(prisma, pageId);

    const remaining = await prisma.pageRevision.findMany({
      where: { pageId },
      orderBy: { version: "asc" },
      select: { version: true },
    });
    expect(remaining).toHaveLength(AUTOSAVE_KEEP);
    expect(remaining[0].version).toBe(4);
  });

  it("does nothing when there is little history", async () => {
    await seedRevisions({ autosaves: 2, manual: 1 });
    const summary = await prunePageRevisions(prisma, pageId);
    expect(summary).toEqual({ autosaves: 0, checkpoints: 0 });
  });
});

describe("deleteOrphanUpload", () => {
  async function makeUpload(url: string) {
    return prisma.uploadFile.create({
      data: {
        workspaceId,
        uploadedById: ownerId,
        name: "gambar.png",
        url,
        mimeType: "image/png",
        size: 1234,
      },
    });
  }

  it("refuses to delete an image a live page block still uses", async () => {
    // Pemeriksaan referensinya dulu tidak menyentuh PageBlock sama sekali,
    // jadi membersihkan berkas justru menghapus gambar yang masih tayang.
    const upload = await makeUpload(`/uploads/${workspaceId}/${tag}-live.png`);
    await prisma.pageBlock.create({
      data: {
        pageId,
        type: "IMAGE",
        order: 0,
        data: { url: upload.url, alt: "Dipakai" },
      },
    });

    expect(await deleteOrphanUpload(upload.id)).toBe(false);
    expect(
      await prisma.uploadFile.findUnique({ where: { id: upload.id } })
    ).not.toBeNull();
  });

  it("refuses to delete an image only a revision still references", async () => {
    // Menghapusnya membuat rollback mengembalikan halaman dengan gambar hilang.
    const upload = await makeUpload(`/uploads/${workspaceId}/${tag}-rev.png`);
    await prisma.pageRevision.create({
      data: {
        pageId,
        version: 9001,
        source: "MANUAL",
        blocks: [{ type: "IMAGE", data: { url: upload.url, alt: "Lama" } }],
        blockCount: 1,
        createdById: ownerId,
      },
    });

    expect(await deleteOrphanUpload(upload.id)).toBe(false);
  });

  it("refuses to delete an image a saved section still references", async () => {
    const upload = await makeUpload(`/uploads/${workspaceId}/${tag}-sec.png`);
    await prisma.savedSection.create({
      data: {
        workspaceId,
        name: `${tag}-section`,
        blocks: [{ type: "IMAGE", data: { url: upload.url, alt: "Section" } }],
        blockCount: 1,
        createdById: ownerId,
      },
    });

    expect(await deleteOrphanUpload(upload.id)).toBe(false);
  });

  it("deletes an upload nothing references", async () => {
    const upload = await makeUpload(`/uploads/${workspaceId}/${tag}-yatim.png`);

    expect(await deleteOrphanUpload(upload.id)).toBe(true);
    expect(
      await prisma.uploadFile.findUnique({ where: { id: upload.id } })
    ).toBeNull();
  });
});

describe("builder templates", () => {
  it("lists the built-in templates with a source marker", async () => {
    const templates = await listBuilderTemplates();
    expect(templates.length).toBeGreaterThan(0);
    expect(templates.every((t) => t.id.includes(":"))).toBe(true);
    expect(templates.some((t) => t.source === "builtin")).toBe(true);
  });

  it("returns blocks for a built-in template", async () => {
    const templates = await listBuilderTemplates();
    const builtin = templates.find((t) => t.source === "builtin")!;
    const blocks = await getBuilderTemplateBlocks(builtin.id);
    expect(blocks?.length).toBeGreaterThan(0);
  });

  it("surfaces a published custom template alongside the built-ins", async () => {
    // Dulu mustahil: modelnya tidak punya kolom konten sama sekali.
    const template = await prisma.siteTemplate.create({
      data: {
        name: `${tag} custom`,
        slug: `${tag}-custom`,
        isPublished: true,
        category: "Uji",
        blocks: [{ type: "TEXT", data: { html: "<p>Halo</p>" } }],
        blockCount: 1,
      },
    });

    const templates = await listBuilderTemplates();
    const found = templates.find((t) => t.id === `custom:${template.id}`);
    expect(found).toBeDefined();
    expect(found?.source).toBe("custom");

    const blocks = await getBuilderTemplateBlocks(`custom:${template.id}`);
    expect(blocks).toHaveLength(1);
  });

  it("hides a custom template that has no blocks", async () => {
    // Menampilkannya hanya menawarkan pilihan yang menghasilkan halaman kosong.
    const template = await prisma.siteTemplate.create({
      data: {
        name: `${tag} kosong`,
        slug: `${tag}-kosong`,
        isPublished: true,
        blocks: [],
        blockCount: 0,
      },
    });

    const templates = await listBuilderTemplates();
    expect(templates.some((t) => t.id === `custom:${template.id}`)).toBe(false);
  });

  it("returns nothing for an unknown template id", async () => {
    expect(await getBuilderTemplateBlocks("builtin:tidak-ada")).toBeNull();
    expect(await getBuilderTemplateBlocks("sembarang")).toBeNull();
  });
});
