"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ProductStatus } from "@prisma/client";

import { auth } from "@/lib/auth";
import type { DigitalAccessItem } from "@/lib/digital-access";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deleteOrphanUpload } from "@/lib/upload-cleanup";
import { revalidateCatalog } from "@/lib/storefront-catalog";
import { setLocationStock, transferLocationStock } from "@/lib/location-stock";
import {
  MAX_VARIANT_COMBINATIONS,
  planVariantMatrix,
  readVariantAxes,
  variantCombinations,
  variantName,
  variantOptionKey,
  type VariantOptionValues,
  type VariantAxis,
} from "@/lib/product-variants";
import { recordInventoryMovement } from "@/lib/inventory-ledger";
import { canInWorkspace } from "@/lib/permissions";
import { getCurrentWorkspace } from "@/lib/workspace";
import { assertCanCreate } from "@/lib/saas-limits";
import { slugify } from "@/lib/slug";
import { productSchema } from "@/lib/zod";

type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

async function requireEditableWorkspace() {
  const context = await requireEditableWorkspaceContext();
  return context?.workspace ?? null;
}

async function requireEditableWorkspaceContext() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) {
    return null;
  }
  return { workspace: current.workspace, userId: session.user.id };
}

/** Finds or creates a category by name within a workspace. */
async function resolveCategoryId(
  workspaceId: string,
  rawName: string | undefined
): Promise<string | null> {
  const name = rawName?.trim();
  if (!name) return null;
  const slug = slugify(name) || "category";
  const category = await prisma.productCategory.upsert({
    where: { workspaceId_slug: { workspaceId, slug } },
    update: { name },
    create: { workspaceId, slug, name },
  });
  return category.id;
}

function parseForm(formData: FormData) {
  const galleryRaw = formData.get("galleryImageIds");
  let galleryImageIds: string[] = [];
  if (typeof galleryRaw === "string" && galleryRaw) {
    try {
      const parsed = JSON.parse(galleryRaw);
      if (Array.isArray(parsed)) {
        galleryImageIds = parsed.filter((item) => typeof item === "string");
      }
    } catch {
      galleryImageIds = [];
    }
  }

  const accessRaw = formData.get("digitalAccessItems");
  let digitalAccessItems: Array<Partial<DigitalAccessItem>> = [];
  if (typeof accessRaw === "string" && accessRaw) {
    try {
      const parsed = JSON.parse(accessRaw);
      if (Array.isArray(parsed)) {
        digitalAccessItems = parsed
          .filter((item) => item && typeof item === "object")
          .map((item) => ({
            label:
              typeof item.label === "string" ? item.label.trim() : undefined,
            url: typeof item.url === "string" ? item.url.trim() : undefined,
          }))
          .filter((item) => item.label || item.url);
      }
    } catch {
      digitalAccessItems = [];
    }
  }

  // A product saved before this feature existed carries a single
  // downloadUrl/Label; treat it as the first access link so nothing is lost.
  if (digitalAccessItems.length === 0) {
    const legacyUrl = formData.get("downloadUrl");
    const legacyLabel = formData.get("downloadLabel");
    if (typeof legacyUrl === "string" && legacyUrl.trim()) {
      digitalAccessItems = [
        {
          label:
            typeof legacyLabel === "string" && legacyLabel.trim()
              ? legacyLabel.trim()
              : "Download file",
          url: legacyUrl.trim(),
        },
      ];
    }
  }

  // downloadUrl/Label stay in sync with the first link so older readers of
  // the product keep working.
  const primaryAccess = digitalAccessItems.find((item) => item.url?.trim());

  return productSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: formData.get("description") || undefined,
    details: formData.get("details") || undefined,
    type: formData.get("type"),
    status: formData.get("status"),
    pricingMode: formData.get("pricingMode"),
    price: formData.get("price"),
    costPrice: formData.get("costPrice") ?? "",
    discountPrice: formData.get("discountPrice") ?? "",
    stock: formData.get("stock"),
    sku: formData.get("sku") || undefined,
    lowStockThreshold: formData.get("lowStockThreshold") ?? "",
    category: formData.get("category") || undefined,
    imageId: formData.get("imageId") || "",
    galleryImageIds,
    metaTitle: formData.get("metaTitle") || undefined,
    metaDescription: formData.get("metaDescription") || undefined,
    digitalAccessItems,
    downloadUrl: primaryAccess?.url || formData.get("downloadUrl") || "",
    downloadLabel:
      primaryAccess?.label || formData.get("downloadLabel") || undefined,
    serviceLocation: formData.get("serviceLocation") || undefined,
    serviceDurationMinutes: formData.get("serviceDurationMinutes") ?? "",
    eventStartsAt: formData.get("eventStartsAt") || "",
    eventEndsAt: formData.get("eventEndsAt") || "",
    eventLocation: formData.get("eventLocation") || undefined,
    weightGrams: formData.get("weightGrams") ?? "",
    lengthCm: formData.get("lengthCm") ?? "",
    widthCm: formData.get("widthCm") ?? "",
    heightCm: formData.get("heightCm") ?? "",
  });
}

function parseVariantAxes(formData: FormData):
  | { ok: true; axes: VariantAxis[] }
  | { ok: false; error: string } {
  const value = formData.get("variantOptions");
  if (typeof value !== "string" || !value.trim()) {
    return { ok: true, axes: [] };
  }

  try {
    const raw = JSON.parse(value);
    if (!Array.isArray(raw)) {
      return { ok: false, error: "Opsi varian tidak valid." };
    }
    const axes = readVariantAxes(raw);
    if (axes.length !== raw.length) {
      return {
        ok: false,
        error: "Lengkapi nama dan nilai pada setiap opsi varian.",
      };
    }
    return { ok: true, axes };
  } catch {
    return { ok: false, error: "Opsi varian tidak valid." };
  }
}

type DraftVariantData = {
  key: string;
  name: string;
  options: VariantOptionValues;
  sku: string | null;
  price: number | null;
  discountPrice: number | null;
  costPrice: number | null;
  stock: number;
  weightGrams: number | null;
  lowStockThreshold: number | null;
  imageId: string | null;
  imageUrl: string | null;
  isActive: boolean;
};

function optionalInteger(value: unknown) {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

function parseDraftVariants(
  formData: FormData,
  axes: VariantAxis[],
  basePrice: number,
  tracksInventory: boolean
): { ok: true; variants: DraftVariantData[] } | { ok: false; error: string } {
  const combinations = variantCombinations(axes);
  if (combinations.length === 0) return { ok: true, variants: [] };

  let submitted: unknown = [];
  const raw = formData.get("variantDetails");
  if (typeof raw === "string" && raw.trim()) {
    try {
      submitted = JSON.parse(raw);
    } catch {
      return { ok: false, error: "Detail varian tidak valid." };
    }
  }
  if (!Array.isArray(submitted)) {
    return { ok: false, error: "Detail varian tidak valid." };
  }

  const byKey = new Map<string, Record<string, unknown>>();
  for (const entry of submitted) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.key === "string") byKey.set(record.key, record);
  }

  const variants: DraftVariantData[] = [];
  const seenSkus = new Set<string>();
  for (const options of combinations) {
    const key = variantOptionKey(options);
    const record = byKey.get(key) ?? {};
    const price = optionalInteger(record.price);
    const rawDiscount = optionalInteger(record.discountPrice);
    const discountPrice = rawDiscount === 0 ? null : rawDiscount;
    const costPrice = optionalInteger(record.costPrice);
    const stock = tracksInventory ? optionalInteger(record.stock) ?? 0 : 0;
    const weightGrams = tracksInventory ? optionalInteger(record.weightGrams) : null;
    const lowStockThreshold = tracksInventory
      ? optionalInteger(record.lowStockThreshold)
      : null;

    const numbers = [price, discountPrice, costPrice, stock, weightGrams, lowStockThreshold];
    if (numbers.some((value) => value != null && (!Number.isFinite(value) || value < 0))) {
      return { ok: false, error: `Angka pada varian ${variantName(axes, options)} tidak valid.` };
    }
    if (stock > 1_000_000) {
      return { ok: false, error: `Stok varian ${variantName(axes, options)} terlalu besar.` };
    }
    const regularPrice = price ?? basePrice;
    if (discountPrice != null && discountPrice >= regularPrice) {
      return {
        ok: false,
        error: `Harga promo ${variantName(axes, options)} harus lebih rendah dari harga normal.`,
      };
    }

    const sku = typeof record.sku === "string"
      ? record.sku.trim().slice(0, 80) || null
      : null;
    if (sku) {
      const normalized = sku.toLowerCase();
      if (seenSkus.has(normalized)) {
        return { ok: false, error: `SKU ${sku} dipakai oleh lebih dari satu varian.` };
      }
      seenSkus.add(normalized);
    }

    variants.push({
      key,
      name: variantName(axes, options),
      options,
      sku,
      price,
      discountPrice,
      costPrice,
      stock,
      weightGrams,
      lowStockThreshold,
      imageId:
        typeof record.imageId === "string" && record.imageId.trim()
          ? record.imageId.trim()
          : null,
      imageUrl:
        typeof record.imageUrl === "string" && record.imageUrl.trim()
          ? record.imageUrl.trim().slice(0, 500)
          : null,
      isActive: record.isActive !== false,
    });
  }

  return { ok: true, variants };
}

export async function createProductAction(
  formData: FormData
): Promise<ActionResult<{ productId: string }>> {
  const context = await requireEditableWorkspaceContext();
  if (!context) return { ok: false, error: "Not allowed." };
  const { workspace, userId } = context;

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the form for errors.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const parsedVariantAxes = parseVariantAxes(formData);
  if (!parsedVariantAxes.ok) {
    return { ok: false, error: parsedVariantAxes.error };
  }
  const variantAxes = parsedVariantAxes.axes;
  const combinations = variantCombinations(variantAxes);
  const parsedDraftVariants = parseDraftVariants(
    formData,
    variantAxes,
    parsed.data.price,
    parsed.data.type === "PHYSICAL"
  );
  if (!parsedDraftVariants.ok) {
    return { ok: false, error: parsedDraftVariants.error };
  }

  const imageIds = Array.from(
    new Set(
      parsedDraftVariants.variants
        .map((variant) => variant.imageId)
        .filter((id): id is string => Boolean(id))
    )
  );
  const variantImages = imageIds.length
    ? await prisma.uploadFile.findMany({
        where: { id: { in: imageIds }, workspaceId: workspace.id },
        select: { id: true, url: true },
      })
    : [];
  if (variantImages.length !== imageIds.length) {
    return { ok: false, error: "Salah satu gambar varian tidak valid." };
  }
  const variantImageById = new Map(
    variantImages.map((image) => [image.id, image.url])
  );
  const draftVariants = parsedDraftVariants.variants.map((variant) => ({
    ...variant,
    imageUrl: variant.imageId
      ? variantImageById.get(variant.imageId) ?? null
      : null,
  }));
  const variantStock = draftVariants
    .filter((variant) => variant.isActive)
    .reduce((sum, variant) => sum + variant.stock, 0);

  const overLimit = await assertCanCreate(workspace.createdById, "product");
  if (overLimit) return { ok: false, error: overLimit };

  const slug = slugify(parsed.data.slug);
  const conflict = await prisma.product.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
    select: { id: true },
  });
  if (conflict) {
    return {
      ok: false,
      error: "A product with that slug already exists.",
      fieldErrors: { slug: ["That slug is already taken."] },
    };
  }

  const categoryId = await resolveCategoryId(workspace.id, parsed.data.category);

  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        workspaceId: workspace.id,
        name: parsed.data.name.trim(),
        slug,
        description: parsed.data.description?.trim() || null,
        details: parsed.data.details?.trim() || null,
        type: parsed.data.type,
        status: parsed.data.status,
        pricingMode: parsed.data.pricingMode,
        price: parsed.data.price,
        costPrice: parsed.data.costPrice ?? 0,
        discountPrice: parsed.data.discountPrice ?? null,
        stock: combinations.length > 0 ? variantStock : parsed.data.stock,
        sku: parsed.data.sku?.trim() || null,
        lowStockThreshold: parsed.data.lowStockThreshold ?? null,
        categoryId,
        imageId: parsed.data.imageId || null,
        galleryImageIds: parsed.data.galleryImageIds,
        digitalAccessItems: parsed.data.digitalAccessItems,
        metaTitle: parsed.data.metaTitle?.trim() || null,
        metaDescription: parsed.data.metaDescription?.trim() || null,
        downloadUrl: parsed.data.downloadUrl?.trim() || null,
        downloadLabel: parsed.data.downloadLabel?.trim() || null,
        serviceLocation: parsed.data.serviceLocation?.trim() || null,
        serviceDurationMinutes: parsed.data.serviceDurationMinutes ?? null,
        eventStartsAt: parsed.data.eventStartsAt ?? null,
        eventEndsAt: parsed.data.eventEndsAt ?? null,
        eventLocation: parsed.data.eventLocation?.trim() || null,
        weightGrams: parsed.data.weightGrams ?? null,
        lengthCm: parsed.data.lengthCm ?? null,
        widthCm: parsed.data.widthCm ?? null,
        heightCm: parsed.data.heightCm ?? null,
        variantOptions: variantAxes as unknown as Prisma.InputJsonValue,
        variants:
          combinations.length > 0
            ? {
                create: draftVariants.map((variant, sortOrder) => ({
                  name: variant.name,
                  options: variant.options as unknown as Prisma.InputJsonValue,
                  sku: variant.sku,
                  price: variant.price,
                  discountPrice: variant.discountPrice,
                  costPrice: variant.costPrice,
                  stock: variant.stock,
                  weightGrams: variant.weightGrams,
                  lowStockThreshold: variant.lowStockThreshold,
                  imageId: variant.imageId,
                  imageUrl: variant.imageUrl,
                  isActive: variant.isActive,
                  sortOrder,
                })),
              }
            : undefined,
      },
    });

    if (created.type === "PHYSICAL" && created.stock > 0) {
      await recordInventoryMovement(tx, {
        workspaceId: created.workspaceId,
        productId: created.id,
        actorId: userId,
        type: "MANUAL_ADJUSTMENT",
        quantityChange: created.stock,
        stockBefore: 0,
        stockAfter: created.stock,
        reason: "Initial stock",
      });
    }

    return created;
  });

  revalidatePath("/dashboard/products");
  revalidateCatalog(workspace.id);
  return { ok: true, data: { productId: product.id } };
}

export async function updateProductAction(
  productId: string,
  formData: FormData
): Promise<ActionResult> {
  const context = await requireEditableWorkspaceContext();
  if (!context) return { ok: false, error: "Not allowed." };
  const { workspace, userId } = context;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      workspaceId: true,
      name: true,
      stock: true,
      variants: { where: { isActive: true }, select: { stock: true } },
    },
  });
  if (!product || product.workspaceId !== workspace.id) {
    return { ok: false, error: "Product not found." };
  }

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the form for errors.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const slug = slugify(parsed.data.slug);
  const conflict = await prisma.product.findFirst({
    where: { workspaceId: workspace.id, slug, NOT: { id: productId } },
    select: { id: true },
  });
  if (conflict) {
    return {
      ok: false,
      error: "That slug is already taken.",
      fieldErrors: { slug: ["That slug is already taken."] },
    };
  }

  const categoryId = await resolveCategoryId(workspace.id, parsed.data.category);
  const targetStock = product.variants.length
    ? product.variants.reduce((sum, variant) => sum + variant.stock, 0)
    : parsed.data.stock;

  await prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({
      where: { id: productId },
      data: {
        name: parsed.data.name.trim(),
        slug,
        description: parsed.data.description?.trim() || null,
        details: parsed.data.details?.trim() || null,
        type: parsed.data.type,
        status: parsed.data.status,
        pricingMode: parsed.data.pricingMode,
        price: parsed.data.price,
        costPrice: parsed.data.costPrice ?? 0,
        discountPrice: parsed.data.discountPrice ?? null,
        stock: targetStock,
        sku: parsed.data.sku?.trim() || null,
        lowStockThreshold: parsed.data.lowStockThreshold ?? null,
        categoryId,
        imageId: parsed.data.imageId || null,
        galleryImageIds: parsed.data.galleryImageIds,
        digitalAccessItems: parsed.data.digitalAccessItems,
        metaTitle: parsed.data.metaTitle?.trim() || null,
        metaDescription: parsed.data.metaDescription?.trim() || null,
        downloadUrl: parsed.data.downloadUrl?.trim() || null,
        downloadLabel: parsed.data.downloadLabel?.trim() || null,
        serviceLocation: parsed.data.serviceLocation?.trim() || null,
        serviceDurationMinutes: parsed.data.serviceDurationMinutes ?? null,
        eventStartsAt: parsed.data.eventStartsAt ?? null,
        eventEndsAt: parsed.data.eventEndsAt ?? null,
        eventLocation: parsed.data.eventLocation?.trim() || null,
        weightGrams: parsed.data.weightGrams ?? null,
        lengthCm: parsed.data.lengthCm ?? null,
        widthCm: parsed.data.widthCm ?? null,
        heightCm: parsed.data.heightCm ?? null,
      },
    });

    if (updated.type === "PHYSICAL" && product.stock !== updated.stock) {
      await recordInventoryMovement(tx, {
        workspaceId: updated.workspaceId,
        productId: updated.id,
        actorId: userId,
        type: "MANUAL_ADJUSTMENT",
        quantityChange: updated.stock - product.stock,
        stockBefore: product.stock,
        stockAfter: updated.stock,
        reason: "Product form stock update",
      });
    }
  });

  revalidatePath("/dashboard/products");
  revalidateCatalog(workspace.id);
  revalidatePath(`/dashboard/products/${productId}/edit`);
  return { ok: true };
}

export async function adjustProductStockAction(
  productId: string,
  formData: FormData
): Promise<ActionResult<{ stock: number }>> {
  const context = await requireEditableWorkspaceContext();
  if (!context) return { ok: false, error: "Not allowed." };
  const { workspace, userId } = context;
  const rawQuantityChange = Number(formData.get("quantityChange"));
  const quantityChange = Number.isFinite(rawQuantityChange)
    ? Math.trunc(rawQuantityChange)
    : Number.NaN;
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);

  if (!Number.isInteger(quantityChange) || quantityChange === 0) {
    return { ok: false, error: "Masukkan perubahan stok selain 0." };
  }
  if (Math.abs(quantityChange) > 1_000_000) {
    return { ok: false, error: "Perubahan stok terlalu besar." };
  }

  const result = await prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        workspaceId: true,
        name: true,
        type: true,
        stock: true,
        lowStockThreshold: true,
        workspace: {
          select: {
            ecommerceSetting: { select: { lowStockThreshold: true } },
          },
        },
      },
    });

    if (!product || product.workspaceId !== workspace.id) {
      return { ok: false as const, error: "Product not found." };
    }
    if (product.type !== "PHYSICAL") {
      return { ok: false as const, error: "Stock can only be adjusted for physical products." };
    }

    const nextStock = product.stock + quantityChange;
    if (nextStock < 0) {
      return { ok: false as const, error: "Stock cannot be negative." };
    }

    const threshold =
      product.lowStockThreshold ??
      product.workspace.ecommerceSetting?.lowStockThreshold ??
      5;
    const recovered = nextStock > threshold && product.stock <= threshold;
    const updated = await tx.product.updateMany({
      where: { id: product.id, workspaceId: workspace.id, stock: product.stock },
      data: {
        stock: nextStock,
        ...(recovered
          ? { lowStockAlertedAt: null, lowStockResolvedAt: new Date() }
          : {}),
      },
    });
    if (updated.count !== 1) {
      return {
        ok: false as const,
        error: "Stock changed while saving. Please refresh and retry.",
      };
    }

    await recordInventoryMovement(tx, {
      workspaceId: product.workspaceId,
      productId: product.id,
      actorId: userId,
      type: "MANUAL_ADJUSTMENT",
      quantityChange,
      stockBefore: product.stock,
      stockAfter: nextStock,
      reason: reason || "Manual stock adjustment",
      metadata: { productName: product.name },
    });

    return { ok: true as const, data: { stock: nextStock } };
  });

  if (result.ok) {
    revalidatePath("/dashboard/products");
  revalidateCatalog(workspace.id);
    revalidatePath(`/dashboard/products/${productId}/edit`);
  }
  return result;
}

export async function setProductStatusAction(
  productId: string,
  status: ProductStatus
): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { workspaceId: true },
  });
  if (!product || product.workspaceId !== workspace.id) {
    return { ok: false, error: "Product not found." };
  }

  await prisma.product.update({ where: { id: productId }, data: { status } });
  revalidatePath("/dashboard/products");
  revalidateCatalog(workspace.id);
  return { ok: true };
}

export async function deleteProductAction(
  productId: string
): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      workspaceId: true,
      imageId: true,
      variants: { select: { imageId: true } },
    },
  });
  if (!product || product.workspaceId !== workspace.id) {
    return { ok: false, error: "Product not found." };
  }

  await prisma.product.delete({ where: { id: productId } });

  // Berkasnya dulu tertinggal di disk selamanya. deleteOrphanUpload menolak
  // menghapus apa pun yang masih dirujuk di tempat lain, jadi aman dipanggil
  // untuk setiap gambar yang tadinya melekat di produk ini.
  const imageIds = [
    product.imageId,
    ...product.variants.map((variant) => variant.imageId),
  ];
  for (const imageId of imageIds) {
    await deleteOrphanUpload(imageId).catch(() => false);
  }

  revalidatePath("/dashboard/products");
  revalidateCatalog(workspace.id);
  return { ok: true };
}

export async function saveProductVariantAction(
  productId: string,
  variantId: string | null,
  formData: FormData
): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };
  const product = await prisma.product.findFirst({
    where: { id: productId, workspaceId: workspace.id },
    select: { id: true, price: true },
  });
  if (!product) return { ok: false, error: "Product not found." };
  const name = String(formData.get("name") ?? "").trim().slice(0, 100);
  const sku = String(formData.get("sku") ?? "").trim().slice(0, 80) || null;
  const priceRaw = String(formData.get("price") ?? "").trim();
  const price = priceRaw === "" ? null : Math.floor(Number(priceRaw));
  const discountRaw = String(formData.get("discountPrice") ?? "").trim();
  const parsedDiscount = discountRaw === "" ? null : Math.floor(Number(discountRaw));
  const discountPrice = parsedDiscount === 0 ? null : parsedDiscount;
  const costRaw = String(formData.get("costPrice") ?? "").trim();
  const costPrice = costRaw === "" ? null : Math.floor(Number(costRaw));
  const stock = Math.floor(Number(formData.get("stock") ?? 0));
  const weightRaw = String(formData.get("weightGrams") ?? "").trim();
  const weightGrams = weightRaw === "" ? null : Math.floor(Number(weightRaw));
  const thresholdRaw = String(formData.get("lowStockThreshold") ?? "").trim();
  const lowStockThreshold = thresholdRaw === ""
    ? null
    : Math.floor(Number(thresholdRaw));
  const imageId = String(formData.get("imageId") ?? "").trim() || null;
  let imageUrl = String(formData.get("imageUrl") ?? "").trim().slice(0, 500) || null;
  if (!name) return { ok: false, error: "Nama varian wajib diisi." };
  if (price != null && (!Number.isFinite(price) || price < 0)) {
    return { ok: false, error: "Harga varian tidak valid." };
  }
  if (
    discountPrice != null &&
    (!Number.isFinite(discountPrice) ||
      discountPrice < 0 ||
      discountPrice >= (price ?? product.price))
  ) {
    return { ok: false, error: "Harga promo harus lebih rendah dari harga normal varian." };
  }
  if (costPrice != null && (!Number.isFinite(costPrice) || costPrice < 0)) {
    return { ok: false, error: "HPP varian tidak valid." };
  }
  if (!Number.isFinite(stock) || stock < 0 || stock > 1_000_000) {
    return { ok: false, error: "Stok varian tidak valid." };
  }
  if (weightGrams != null && (!Number.isFinite(weightGrams) || weightGrams < 0)) {
    return { ok: false, error: "Berat varian tidak valid." };
  }
  if (
    lowStockThreshold != null &&
    (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0)
  ) {
    return { ok: false, error: "Ambang stok rendah tidak valid." };
  }
  if (imageId) {
    const image = await prisma.uploadFile.findFirst({
      where: { id: imageId, workspaceId: workspace.id },
      select: { url: true },
    });
    if (!image) return { ok: false, error: "Gambar varian tidak valid." };
    imageUrl = image.url;
  }
  try {
    await prisma.$transaction(async (tx) => {
      if (variantId) {
        const existing = await tx.productVariant.findFirst({
          where: { id: variantId, productId },
        });
        if (!existing) throw new Error("VARIANT_NOT_FOUND");
        await tx.productVariant.update({
          where: { id: variantId },
          data: {
            name,
            sku,
            price,
            discountPrice,
            costPrice,
            stock,
            weightGrams,
            lowStockThreshold,
            imageId,
            imageUrl,
            isActive: formData.get("isActive") === "true",
          },
        });
      } else {
        await tx.productVariant.create({
          data: {
            productId,
            name,
            sku,
            price,
            discountPrice,
            costPrice,
            stock,
            weightGrams,
            lowStockThreshold,
            imageId,
            imageUrl,
          },
        });
      }
      const aggregate = await tx.productVariant.aggregate({
        where: { productId, isActive: true },
        _sum: { stock: true },
      });
      await tx.product.update({ where: { id: productId }, data: { stock: aggregate._sum.stock ?? 0 } });
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return { ok: false, error: "Nama atau SKU varian sudah digunakan." };
    }
    return { ok: false, error: "Varian gagal disimpan." };
  }
  revalidatePath(`/dashboard/products/${productId}/edit`);
  revalidatePath("/dashboard/products");
  revalidateCatalog(workspace.id);
  return { ok: true };
}

export async function deleteProductVariantAction(
  productId: string,
  variantId: string
): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };
  const variant = await prisma.productVariant.findFirst({
    where: { id: variantId, productId, product: { workspaceId: workspace.id } },
  });
  if (!variant) return { ok: false, error: "Variant not found." };
  await prisma.$transaction(async (tx) => {
    await tx.productVariant.delete({ where: { id: variantId } });
    const aggregate = await tx.productVariant.aggregate({ where: { productId, isActive: true }, _sum: { stock: true } });
    await tx.product.update({ where: { id: productId }, data: { stock: aggregate._sum.stock ?? 0 } });
  });
  revalidatePath(`/dashboard/products/${productId}/edit`);
  revalidatePath("/dashboard/products");
  revalidateCatalog(workspace.id);
  return { ok: true };
}

/**
 * Saves the option axes and brings the variant rows in line with them.
 *
 * Generating is additive: missing combinations are created, drifted names are
 * corrected, and combinations the axes no longer describe are reported back
 * rather than deleted — they may be holding stock.
 */
export async function saveProductVariantOptionsAction(
  productId: string,
  formData: FormData
): Promise<
  ActionResult<{ created: number; renamed: number; orphaned: { id: string; name: string }[] }>
> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  const product = await prisma.product.findFirst({
    where: { id: productId, workspaceId: workspace.id },
    select: { id: true, price: true },
  });
  if (!product) return { ok: false, error: "Product not found." };

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("axes") ?? "[]"));
  } catch {
    return { ok: false, error: "Opsi varian tidak valid." };
  }
  const axes = readVariantAxes(raw as never);

  const combinations = variantCombinations(axes);
  if (axes.length > 0 && combinations.length === 0) {
    return { ok: false, error: "Setiap opsi butuh minimal satu nilai." };
  }
  if (combinations.length >= MAX_VARIANT_COMBINATIONS) {
    return {
      ok: false,
      error: `Terlalu banyak kombinasi (maksimal ${MAX_VARIANT_COMBINATIONS}). Kurangi opsi atau pisahkan jadi produk lain.`,
    };
  }

  const existing = await prisma.productVariant.findMany({
    where: { productId },
    select: { id: true, name: true, options: true },
  });
  const plan = planVariantMatrix(axes, existing);

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: productId },
      data: { variantOptions: axes as unknown as Prisma.InputJsonValue },
    });

    for (const entry of plan.create) {
      await tx.productVariant.create({
        data: {
          productId,
          name: entry.name,
          stock: 0,
          options: entry.options as unknown as Prisma.InputJsonValue,
        },
      });
    }
    for (const entry of plan.rename) {
      await tx.productVariant.update({
        where: { id: entry.id },
        data: { name: entry.name },
      });
    }

    // The product's own stock mirrors the sum of its active variants.
    const aggregate = await tx.productVariant.aggregate({
      where: { productId, isActive: true },
      _sum: { stock: true },
    });
    await tx.product.update({
      where: { id: productId },
      data: { stock: aggregate._sum.stock ?? 0 },
    });
  });

  revalidatePath(`/dashboard/products/${productId}/edit`);
  revalidatePath("/dashboard/products");
  revalidateCatalog(workspace.id);
  return {
    ok: true,
    data: {
      created: plan.create.length,
      renamed: plan.rename.length,
      orphaned: plan.orphaned,
    },
  };
}

/** Sets stock and price on many variants at once, from the matrix table. */
export async function bulkUpdateProductVariantsAction(
  productId: string,
  formData: FormData
): Promise<ActionResult<{ updated: number }>> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  const product = await prisma.product.findFirst({
    where: { id: productId, workspaceId: workspace.id },
    select: { id: true, price: true },
  });
  if (!product) return { ok: false, error: "Product not found." };

  const variants = await prisma.productVariant.findMany({
    where: { productId },
    select: { id: true },
  });

  const updates: {
    id: string;
    stock: number;
    price: number | null;
    discountPrice: number | null;
    costPrice: number | null;
    sku: string | null;
    weightGrams: number | null;
    lowStockThreshold: number | null;
    imageId: string | null;
    imageUrl: string | null;
    isActive: boolean;
  }[] = [];
  for (const variant of variants) {
    const stockRaw = formData.get(`stock:${variant.id}`);
    // A row the form did not submit is left exactly as it is.
    if (stockRaw === null) continue;

    const stock = Math.floor(Number(stockRaw));
    if (!Number.isFinite(stock) || stock < 0 || stock > 1_000_000) {
      return { ok: false, error: "Stok varian tidak valid." };
    }
    const priceRaw = String(formData.get(`price:${variant.id}`) ?? "").trim();
    const price = priceRaw === "" ? null : Math.floor(Number(priceRaw));
    if (price != null && (!Number.isFinite(price) || price < 0)) {
      return { ok: false, error: "Harga varian tidak valid." };
    }
    const discountRaw = String(formData.get(`discount:${variant.id}`) ?? "").trim();
    const parsedDiscount = discountRaw === "" ? null : Math.floor(Number(discountRaw));
    const discountPrice = parsedDiscount === 0 ? null : parsedDiscount;
    if (
      discountPrice != null &&
      (!Number.isFinite(discountPrice) ||
        discountPrice < 0 ||
        discountPrice >= (price ?? product.price))
    ) {
      return { ok: false, error: "Harga promo harus lebih rendah dari harga normal varian." };
    }
    const costRaw = String(formData.get(`cost:${variant.id}`) ?? "").trim();
    const costPrice = costRaw === "" ? null : Math.floor(Number(costRaw));
    if (costPrice != null && (!Number.isFinite(costPrice) || costPrice < 0)) {
      return { ok: false, error: "HPP varian tidak valid." };
    }
    const weightRaw = String(formData.get(`weight:${variant.id}`) ?? "").trim();
    const weightGrams = weightRaw === "" ? null : Math.floor(Number(weightRaw));
    if (weightGrams != null && (!Number.isFinite(weightGrams) || weightGrams < 0)) {
      return { ok: false, error: "Berat varian tidak valid." };
    }
    const sku = String(formData.get(`sku:${variant.id}`) ?? "").trim().slice(0, 80) || null;
    const thresholdRaw = String(formData.get(`threshold:${variant.id}`) ?? "").trim();
    const lowStockThreshold = thresholdRaw === ""
      ? null
      : Math.floor(Number(thresholdRaw));
    if (
      lowStockThreshold != null &&
      (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0)
    ) {
      return { ok: false, error: "Ambang stok rendah tidak valid." };
    }
    const imageId = String(formData.get(`imageId:${variant.id}`) ?? "").trim() || null;
    const imageUrl =
      String(formData.get(`image:${variant.id}`) ?? "").trim().slice(0, 500) || null;
    updates.push({
      id: variant.id,
      stock,
      price,
      discountPrice,
      costPrice,
      sku,
      weightGrams,
      lowStockThreshold,
      imageId,
      imageUrl,
      // An unchecked checkbox submits nothing, so absence means "off".
      isActive: formData.get(`active:${variant.id}`) === "true",
    });
  }

  const imageIds = Array.from(
    new Set(updates.map((update) => update.imageId).filter((id): id is string => Boolean(id)))
  );
  const images = imageIds.length
    ? await prisma.uploadFile.findMany({
        where: { id: { in: imageIds }, workspaceId: workspace.id },
        select: { id: true, url: true },
      })
    : [];
  if (images.length !== imageIds.length) {
    return { ok: false, error: "Salah satu gambar varian tidak valid." };
  }
  const imageById = new Map(images.map((image) => [image.id, image.url]));

  try {
    await prisma.$transaction(async (tx) => {
      for (const update of updates) {
        await tx.productVariant.update({
          where: { id: update.id },
          data: {
            stock: update.stock,
            price: update.price,
            discountPrice: update.discountPrice,
            costPrice: update.costPrice,
            sku: update.sku,
            weightGrams: update.weightGrams,
            lowStockThreshold: update.lowStockThreshold,
            imageId: update.imageId,
            imageUrl: update.imageId
              ? imageById.get(update.imageId) ?? null
              : update.imageUrl,
            isActive: update.isActive,
          },
        });
      }
      const aggregate = await tx.productVariant.aggregate({
        where: { productId, isActive: true },
        _sum: { stock: true },
      });
      await tx.product.update({
        where: { id: productId },
        data: { stock: aggregate._sum.stock ?? 0 },
      });
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return { ok: false, error: "SKU varian sudah digunakan." };
    }
    return { ok: false, error: "Varian gagal disimpan." };
  }

  revalidatePath(`/dashboard/products/${productId}/edit`);
  revalidatePath("/dashboard/products");
  revalidateCatalog(workspace.id);
  return { ok: true, data: { updated: updates.length } };
}

/**
 * Sets what a bundle contains.
 *
 * A bundle may not contain itself or another bundle: nesting turns a stock
 * question into a graph walk, and every extra level is another way for the two
 * numbers to disagree.
 */
export async function saveProductBundleAction(
  bundleId: string,
  formData: FormData
): Promise<ActionResult<{ components: number }>> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  const bundle = await prisma.product.findFirst({
    where: { id: bundleId, workspaceId: workspace.id },
    select: { id: true, type: true },
  });
  if (!bundle) return { ok: false, error: "Product not found." };
  if (bundle.type !== "BUNDLE") {
    return { ok: false, error: "Produk ini bukan paket." };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { ok: false, error: "Isi paket tidak valid." };
  }
  if (!Array.isArray(raw)) return { ok: false, error: "Isi paket tidak valid." };

  const wanted: { productId: string; variantId: string | null; quantity: number }[] = [];
  for (const entry of raw.slice(0, 50)) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const productId = typeof record.productId === "string" ? record.productId : "";
    if (!productId || productId === bundleId) continue;
    const quantity = Math.floor(Number(record.quantity ?? 1));
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 1_000) {
      return { ok: false, error: "Jumlah komponen tidak valid." };
    }
    wanted.push({
      productId,
      variantId: typeof record.variantId === "string" && record.variantId ? record.variantId : null,
      quantity,
    });
  }

  const components = await prisma.product.findMany({
    where: {
      id: { in: wanted.map((entry) => entry.productId) },
      workspaceId: workspace.id,
    },
    select: { id: true, type: true, variants: { select: { id: true } } },
  });
  const byId = new Map(components.map((product) => [product.id, product]));

  for (const entry of wanted) {
    const component = byId.get(entry.productId);
    if (!component) return { ok: false, error: "Produk dalam paket tidak ditemukan." };
    if (component.type === "BUNDLE") {
      return { ok: false, error: "Paket tidak bisa berisi paket lain." };
    }
    if (entry.variantId && !component.variants.some((v) => v.id === entry.variantId)) {
      return { ok: false, error: "Varian dalam paket tidak ditemukan." };
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.productBundleItem.deleteMany({ where: { bundleId } });
    if (wanted.length > 0) {
      await tx.productBundleItem.createMany({
        data: wanted.map((entry) => ({
          workspaceId: workspace.id,
          bundleId,
          productId: entry.productId,
          variantId: entry.variantId,
          quantity: entry.quantity,
        })),
        skipDuplicates: true,
      });
    }
  });

  revalidatePath(`/dashboard/products/${bundleId}/edit`);
  revalidatePath("/dashboard/products");
  revalidateCatalog(workspace.id);
  return { ok: true, data: { components: wanted.length } };
}

/** Records how much of a product sits at one location. */
export async function setLocationStockAction(
  formData: FormData
): Promise<ActionResult<{ placed: number }>> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  const result = await setLocationStock({
    workspaceId: workspace.id,
    locationId: String(formData.get("locationId") ?? ""),
    productId: String(formData.get("productId") ?? ""),
    variantId: String(formData.get("variantId") ?? "") || null,
    quantity: Number(formData.get("quantity") ?? 0),
  });
  if (!result.ok) return result;

  revalidatePath(`/dashboard/products/${String(formData.get("productId") ?? "")}/edit`);
  return { ok: true, data: { placed: result.placed } };
}

/** Moves stock between two locations. The product's total does not change. */
export async function transferLocationStockAction(
  formData: FormData
): Promise<ActionResult<{ placed: number }>> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  const productId = String(formData.get("productId") ?? "");
  const result = await transferLocationStock({
    workspaceId: workspace.id,
    fromLocationId: String(formData.get("fromLocationId") ?? ""),
    toLocationId: String(formData.get("toLocationId") ?? ""),
    productId,
    variantId: String(formData.get("variantId") ?? "") || null,
    quantity: Number(formData.get("quantity") ?? 0),
  });
  if (!result.ok) return result;

  revalidatePath(`/dashboard/products/${productId}/edit`);
  return { ok: true, data: { placed: result.placed } };
}
