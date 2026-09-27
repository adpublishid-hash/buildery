import "server-only";

import type { Workspace } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { publicSiteContextHref } from "@/lib/public-url-server";
import { formatDate, formatPrice } from "@/lib/utils";
import { parseFieldOptions } from "@/lib/forms";
import { publicBlogIndex } from "@/lib/public-blog";
import {
  getFormAvailability,
  parsePublishedFormFields,
} from "@/lib/form-publication";

import type { Block, CollectionData, FormEmbedData } from "./schema";

type ShowcaseType =
  | "PRODUCT_SHOWCASE"
  | "COURSE_SHOWCASE"
  | "BLOG_SHOWCASE"
  | "MEMBERSHIP_SHOWCASE";

function isShowcaseBlock(type: Block["type"]): type is ShowcaseType {
  return (
    type === "PRODUCT_SHOWCASE" ||
    type === "COURSE_SHOWCASE" ||
    type === "BLOG_SHOWCASE" ||
    type === "MEMBERSHIP_SHOWCASE"
  );
}

function isFormEmbedBlock(type: Block["type"]): type is "FORM_EMBED" {
  return type === "FORM_EMBED";
}

function siteHref(workspaceSlug: string, path: string) {
  if (!path || path === "#") return "#";
  if (/^(https?:|mailto:|tel:)/i.test(path)) return path;
  if (path.startsWith("/")) return path;
  return publicSiteContextHref(workspaceSlug, path);
}

function withPublicLinks(
  data: CollectionData,
  workspaceSlug: string,
  fallbackPath: string
) {
  return {
    ...data,
    buttonHref: siteHref(workspaceSlug, data.buttonHref || fallbackPath),
    items: data.items.map((item) => ({
      ...item,
      href: siteHref(workspaceSlug, item.href || fallbackPath),
    })),
  };
}

async function productItems(
  workspace: IntegrationWorkspace,
  limit: number,
  sortBy: CollectionData["sortBy"],
  categorySlug: string
) {
  const products = await prisma.product.findMany({
    where: {
      workspaceId: workspace.id,
      status: "ACTIVE",
      ...(categorySlug ? { category: { slug: categorySlug } } : {}),
    },
    include: { image: true, category: true },
    orderBy:
      sortBy === "oldest"
        ? { createdAt: "asc" }
        : sortBy === "name"
          ? { name: "asc" }
          : { createdAt: "desc" },
    take: limit,
  });

  return products.map((product) => {
    const productType =
      product.type === "DIGITAL" ? "Produk digital" : "Produk fisik";
    const stockText =
      product.type === "DIGITAL"
        ? "Akses instan"
        : product.stock > 0
          ? `Stok ${product.stock}`
          : "Stok habis";

    return {
      title: product.name,
      description:
        product.description?.replace(/<[^>]+>/g, "").slice(0, 160) ||
        "Produk tersedia untuk dibeli langsung dari katalog.",
      href: `products/${product.slug}`,
      badge: product.category?.name || "Produk",
      meta: formatPrice(product.discountPrice ?? product.price),
      detail: `${productType} / ${stockText}`,
      imageUrl: product.image?.url || "",
    };
  });
}

async function courseItems(
  workspace: IntegrationWorkspace,
  limit: number,
  sortBy: CollectionData["sortBy"]
) {
  const courses = await prisma.course.findMany({
    where: { workspaceId: workspace.id, status: "PUBLISHED" },
    include: {
      image: true,
      _count: { select: { modules: true, enrollments: true } },
      modules: {
        select: {
          _count: { select: { lessons: true } },
        },
      },
    },
    orderBy:
      sortBy === "oldest"
        ? { createdAt: "asc" }
        : sortBy === "name"
          ? { title: "asc" }
          : [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
  });

  return courses.map((course) => {
    const lessonCount = course.modules.reduce(
      (total, module) => total + module._count.lessons,
      0
    );
    const moduleText = `${course._count.modules} modul`;
    const lessonText = `${lessonCount} pelajaran`;
    const enrollmentText =
      course._count.enrollments > 0
        ? `${course._count.enrollments} peserta`
        : "Siap dipelajari";

    return {
      title: course.title,
      description:
        course.summary ||
        course.description?.replace(/<[^>]+>/g, "").slice(0, 160) ||
        "Materi belajar yang bisa diikuti langsung dari akun pelanggan.",
      href: `courses/${course.slug}`,
      badge: course.isFree ? "Gratis" : "Kursus premium",
      meta: course.isFree ? "Gratis" : formatPrice(course.price),
      detail: [moduleText, lessonText, enrollmentText].join(" / "),
      imageUrl: course.image?.url || "",
    };
  });
}

async function blogItems(
  workspace: IntegrationWorkspace,
  limit: number,
  sortBy: CollectionData["sortBy"],
  categorySlug: string
) {
  const result = await publicBlogIndex({
    workspaceId: workspace.id,
    category: categorySlug || undefined,
    page: 1,
    pageSize: Math.max(limit, 50),
  });
  const posts = [...result.posts]
    .sort((a, b) => {
      if (sortBy === "name") return a.title.localeCompare(b.title);
      const aDate = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const bDate = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return sortBy === "oldest" ? aDate - bDate : bDate - aDate;
    })
    .slice(0, limit);

  return posts.map((post) => {
    const plainBody = post.body.replace(/<[^>]+>/g, " ");
    const wordCount = plainBody.trim().split(/\s+/).filter(Boolean).length;
    const readMinutes = Math.max(1, Math.ceil(wordCount / 220));
    const author = post.authorName || "Tim editorial";

    return {
      title: post.title,
      description:
        post.excerpt ||
        plainBody.replace(/\s+/g, " ").trim().slice(0, 160) ||
        "Baca artikel terbaru dari tim.",
      href: `blog/${post.slug}`,
      badge: post.categoryName || "Blog",
      meta: post.publishedAt ? formatDate(post.publishedAt) : "Terbaru",
      detail: `${author} / ${readMinutes} menit baca`,
      imageUrl: post.imageUrl || "",
    };
  });
}

async function membershipItems(
  workspace: IntegrationWorkspace,
  limit: number,
  sortBy: CollectionData["sortBy"]
) {
  const plans = await prisma.membershipPlan.findMany({
    where: { workspaceId: workspace.id, isActive: true },
    include: {
      product: { include: { image: true } },
      _count: { select: { memberships: true } },
    },
    orderBy:
      sortBy === "oldest"
        ? { createdAt: "asc" }
        : sortBy === "name"
          ? { name: "asc" }
          : { createdAt: "desc" },
    take: limit,
  });

  return plans.map((plan) => {
    const accessText =
      plan.accessDays > 0 ? `${plan.accessDays} hari akses` : "Akses tanpa batas";
    const memberText =
      plan._count.memberships > 0
        ? `${plan._count.memberships} member`
        : "Siap dibuka";
    const benefitText = plan.product ? "Checkout otomatis" : "Akses membership";

    return {
      title: plan.name,
      description:
        plan.description ||
        "Akses benefit membership dan konten khusus pelanggan.",
      href: plan.product ? `products/${plan.product.slug}` : "memberships",
      badge: plan.level,
      meta: plan.price > 0 ? formatPrice(plan.price) : "Gratis",
      detail: `${accessText} / ${memberText} / ${benefitText}`,
      imageUrl: plan.product?.image?.url || "",
    };
  });
}

async function resolveItems(
  type: ShowcaseType,
  workspace: IntegrationWorkspace,
  limit: number,
  sortBy: CollectionData["sortBy"],
  categorySlug: string
) {
  if (type === "PRODUCT_SHOWCASE")
    return productItems(workspace, limit, sortBy, categorySlug);
  if (type === "COURSE_SHOWCASE") return courseItems(workspace, limit, sortBy);
  if (type === "BLOG_SHOWCASE")
    return blogItems(workspace, limit, sortBy, categorySlug);
  return membershipItems(workspace, limit, sortBy);
}

function fallbackPath(type: ShowcaseType) {
  if (type === "PRODUCT_SHOWCASE") return "products";
  if (type === "COURSE_SHOWCASE") return "courses";
  if (type === "BLOG_SHOWCASE") return "blog";
  return "memberships";
}

/** Only the two fields the resolver reads, so a narrowed page shape fits. */
export type IntegrationWorkspace = Pick<Workspace, "id" | "slug">;

export async function resolveIntegratedBlocks(
  blocks: Block[],
  workspace: IntegrationWorkspace
) {
  return Promise.all(
    blocks.map(async (block) => {
      if (isFormEmbedBlock(block.type)) {
        const data = block.data as FormEmbedData;
        const form = data.formId
          ? await prisma.form.findFirst({
              where: { id: data.formId, workspaceId: workspace.id },
              include: {
                fields: { orderBy: { order: "asc" } },
                _count: { select: { submissions: true } },
              },
            })
          : data.formSlug
            ? await prisma.form.findFirst({
                where: {
                  workspaceId: workspace.id,
                  OR: [
                    { slug: data.formSlug },
                    { publishedSlug: data.formSlug },
                  ],
                },
                include: {
                  fields: { orderBy: { order: "asc" } },
                  _count: { select: { submissions: true } },
                },
              })
            : null;

        if (!form) return block;
        const version = form.publishedVersion
          ? await prisma.formVersion.findUnique({
              where: {
                formId_version: {
                  formId: form.id,
                  version: form.publishedVersion,
                },
              },
            })
          : null;
        const publicConfig = version ?? form;
        const publishedFields = version
          ? parsePublishedFormFields(version.fields)
          : form.fields;
        const availability = getFormAvailability({
          status: form.status,
          isOpen: form.isOpen,
          opensAt: publicConfig.opensAt,
          closesAt: publicConfig.closesAt,
          maxSubmissions: publicConfig.maxSubmissions,
          closedMessage: publicConfig.closedMessage,
          submissionCount: form._count.submissions,
        });

        return {
          ...block,
          data: {
            ...data,
            formId: form.id,
            formSlug: publicConfig.slug,
            formTitle: publicConfig.title,
            formDescription: publicConfig.description ?? "",
            submitLabel: publicConfig.submitLabel,
            successMessage: publicConfig.successMessage,
            isOpen: availability.accepting,
            closedText: availability.message ?? data.closedText,
            fields: publishedFields.map((field) => ({
              id: field.id,
              label: field.label,
              name: field.name,
              type: field.type,
              required: field.required,
              placeholder: field.placeholder ?? "",
              options: parseFieldOptions(field.options),
            })),
          },
        } as Block;
      }

      if (!isShowcaseBlock(block.type)) return block;

      const data = block.data as CollectionData;
      const fallback = fallbackPath(block.type);

      if (data.source === "manual") {
        return {
          ...block,
          data: withPublicLinks(data, workspace.slug, fallback),
        } as Block;
      }

      const items = await resolveItems(
        block.type,
        workspace,
        Math.min(Math.max(data.limit || 6, 1), 12),
        data.sortBy ?? "newest",
        data.categorySlug?.trim() ?? ""
      );

      return {
        ...block,
        data: withPublicLinks(
          {
            ...data,
            items: items.length > 0 ? items : data.items,
          },
          workspace.slug,
          fallback
        ),
      } as Block;
    })
  );
}
