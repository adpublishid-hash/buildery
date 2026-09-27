import "server-only";

import { prisma } from "@/lib/prisma";
import { pageBlocksSchema, type BlockInput } from "@/lib/blocks/schema";
import { BUILDER_TEMPLATES, createTemplateBlocks } from "@/lib/blocks/templates";
import type { BuilderTemplateId } from "@/lib/blocks/templates";
import {
  builderDesignTokensSchema,
  type BuilderDesignTokens,
} from "@/lib/builder-design-tokens";

/**
 * Daftar template yang dilihat builder.
 *
 * Dulu builder hanya membaca array hardcode, sementara admin punya halaman
 * untuk mengelola `SiteTemplate` yang modelnya bahkan tidak memiliki kolom
 * konten — apa pun yang dibuat di sana tidak pernah bisa muncul di mana pun.
 * Sekarang keduanya muncul dalam satu daftar.
 */
export type BuilderTemplateSummary = {
  /** "builtin:<id>" atau "custom:<id>", supaya asalnya jelas saat diimpor. */
  id: string;
  source: "builtin" | "custom";
  name: string;
  category: string;
  description: string;
  blockCount: number;
  previewImage: string | null;
  accentColor: string | null;
  highlights: string[];
};

const BUILTIN_PREFIX = "builtin:";
const CUSTOM_PREFIX = "custom:";

function builtinSummaries(): BuilderTemplateSummary[] {
  return BUILDER_TEMPLATES.map((template) => ({
    id: `${BUILTIN_PREFIX}${template.id}`,
    source: "builtin" as const,
    name: template.name,
    category: template.category,
    description: template.description,
    blockCount: template.blockCount,
    previewImage: template.previewImage,
    accentColor: template.accentColor,
    highlights: [...template.highlights],
  }));
}

export async function listBuilderTemplates(): Promise<BuilderTemplateSummary[]> {
  const custom = await prisma.siteTemplate.findMany({
    // Template tanpa blok tidak bisa diterapkan; jangan tampilkan sebagai
    // pilihan yang menghasilkan halaman kosong.
    where: { isPublished: true, blockCount: { gt: 0 } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      thumbnail: true,
      blockCount: true,
      category: true,
    },
  });

  const customSummaries: BuilderTemplateSummary[] = custom.map((template) => ({
    id: `${CUSTOM_PREFIX}${template.id}`,
    source: "custom" as const,
    name: template.name,
    category: template.category?.trim() || "Kustom",
    description: template.description?.trim() || "Template kustom platform.",
    blockCount: template.blockCount,
    previewImage: template.thumbnail,
    accentColor: null,
    highlights: [],
  }));

  // Template kustom lebih dulu: itu yang sengaja dikurasi untuk platform ini.
  return [...customSummaries, ...builtinSummaries()];
}

export type BuilderTemplateContent = {
  blocks: BlockInput[];
  /**
   * Tema bawaan template. Template bawaan hanya membawa warna aksen, jadi
   * sisanya dibiarkan kosong dan tema situs yang dipakai; template kustom
   * membawa tema lengkap halaman sumbernya.
   *
   * Tidak pernah diterapkan diam-diam: tema berlaku ke seluruh situs, dan
   * mengimpor template ke satu halaman tidak boleh merestyle halaman lain
   * tanpa diminta.
   */
  designTokens: Partial<BuilderDesignTokens> | null;
};

/**
 * Isi satu template. Blok template kustom tetap divalidasi ulang — baris
 * database bisa berasal dari versi skema yang lebih lama.
 */
export async function getBuilderTemplateContent(
  templateId: string
): Promise<BuilderTemplateContent | null> {
  if (templateId.startsWith(BUILTIN_PREFIX)) {
    const id = templateId.slice(BUILTIN_PREFIX.length);
    const template = BUILDER_TEMPLATES.find((item) => item.id === id);
    if (!template) return null;
    return {
      blocks: createTemplateBlocks(id as BuilderTemplateId),
      designTokens: /^#[0-9a-f]{6}$/i.test(template.accentColor)
        ? { accentColor: template.accentColor }
        : null,
    };
  }

  if (!templateId.startsWith(CUSTOM_PREFIX)) return null;

  const template = await prisma.siteTemplate.findFirst({
    where: {
      id: templateId.slice(CUSTOM_PREFIX.length),
      isPublished: true,
    },
    select: { blocks: true, designTokens: true },
  });
  if (!template) return null;

  const parsed = pageBlocksSchema.safeParse(template.blocks);
  if (!parsed.success) return null;

  const tokens = builderDesignTokensSchema.safeParse(template.designTokens);
  return {
    blocks: parsed.data,
    designTokens: tokens.success ? tokens.data : null,
  };
}

/** Hanya bloknya, untuk pemanggil yang tidak butuh tema. */
export async function getBuilderTemplateBlocks(
  templateId: string
): Promise<BlockInput[] | null> {
  return (await getBuilderTemplateContent(templateId))?.blocks ?? null;
}
