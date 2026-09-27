import { redirect, notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { readVariantAxes } from "@/lib/product-variants";
import { canInWorkspace } from "@/lib/permissions";
import { publicSiteHref } from "@/lib/public-url";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { isAiConfigured } from "@/lib/ai/config";
import { getUserPlan, planHasFeature } from "@/lib/saas-limits";
import { normalizeDigitalAccessItems } from "@/lib/digital-access";
import { InventoryAdjustmentPanel } from "@/components/products/inventory-adjustment-panel";
import { ProductForm } from "@/components/products/product-form";
import { BundlePanel } from "@/components/products/bundle-panel";
import { LocationStockPanel } from "@/components/products/location-stock-panel";
import { productStockPlacement } from "@/lib/location-stock";
import { ProductReviewsPanel } from "@/components/products/product-reviews-panel";

export const metadata = { title: "Edit product · My Landing" };

export default async function EditProductPage({
  params,
}: {
  params: { productId: string };
}) {
  const { workspace, role } = await requireCurrentWorkspace();
  if (!canInWorkspace(role, "content.edit")) {
    redirect("/dashboard/products");
  }

  const product = await prisma.product.findUnique({
    where: { id: params.productId },
    include: {
      category: true,
      image: true,
      membershipPlans: {
        select: {
          id: true,
          name: true,
          level: true,
          accessDays: true,
          isActive: true,
        },
        orderBy: { createdAt: "asc" },
      },
      variants: {
        include: { image: { select: { url: true } } },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
      reviews: { orderBy: { createdAt: "desc" }, take: 50 },
      bundleContents: {
        select: { productId: true, variantId: true, quantity: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!product || product.workspaceId !== workspace.id) {
    notFound();
  }

  // A bundle may hold any of this shop's ordinary products, never another
  // bundle: nesting turns a stock question into a graph walk.
  const bundleCandidates =
    product.type === "BUNDLE"
      ? await prisma.product.findMany({
          where: { workspaceId: workspace.id, type: { not: "BUNDLE" } },
          orderBy: { name: "asc" },
          take: 200,
          select: {
            id: true,
            name: true,
            price: true,
            stock: true,
            type: true,
            variants: { select: { id: true, name: true, stock: true } },
          },
        })
      : [];

  // Where the stock physically sits. Only meaningful for goods in a building.
  const [pickupLocations, placement] =
    product.type === "PHYSICAL"
      ? await Promise.all([
          prisma.pickupLocation.findMany({
            where: { workspaceId: workspace.id, isActive: true },
            orderBy: [{ isDefault: "desc" }, { name: "asc" }],
            select: { id: true, name: true },
          }),
          productStockPlacement({ workspaceId: workspace.id, productId: product.id }),
        ])
      : [[], null];

  const galleryImages = product.galleryImageIds.length
    ? await prisma.uploadFile.findMany({
        where: { id: { in: product.galleryImageIds } },
        select: { id: true, url: true },
      })
    : [];
  const galleryById = new Map(galleryImages.map((image) => [image.id, image]));
  const orderedGalleryImages = product.galleryImageIds
    .map((id) => galleryById.get(id))
    .filter((image): image is { id: string; url: string } => Boolean(image));
  const inventoryMovements =
    product.type === "PHYSICAL"
      ? await prisma.inventoryMovement.findMany({
          where: { workspaceId: workspace.id, productId: product.id },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            type: true,
            quantityChange: true,
            stockBefore: true,
            stockAfter: true,
            reason: true,
            createdAt: true,
          },
        })
      : [];

  const plan = await getUserPlan(workspace.createdById);
  const aiEnabled = isAiConfigured() && planHasFeature(plan, "aiAssistant");
  const variantAxes = readVariantAxes(product.variantOptions);

  return (
    <div className="w-full min-w-0">
      <ProductForm
        aiEnabled={aiEnabled}
        mode="edit"
        productId={product.id}
        defaultImageUrl={product.image?.url ?? null}
        defaultValues={{
          name: product.name,
          slug: product.slug,
          description: product.description ?? "",
          details: product.details ?? "",
          type: product.type === "DIGITAL" ? "DIGITAL" : "PHYSICAL",
          status: product.status,
          pricingMode: product.pricingMode,
          price: String(product.price),
          costPrice: product.costPrice != null ? String(product.costPrice) : "",
          discountPrice:
            product.discountPrice != null ? String(product.discountPrice) : "",
          stock: String(product.stock),
          sku: product.sku ?? "",
          lowStockThreshold:
            product.lowStockThreshold != null
              ? String(product.lowStockThreshold)
              : "",
          category: product.category?.name ?? "",
          imageId: product.imageId ?? "",
          galleryImageIds: product.galleryImageIds,
          metaTitle: product.metaTitle ?? "",
          metaDescription: product.metaDescription ?? "",
          downloadUrl: product.downloadUrl ?? "",
          downloadLabel: product.downloadLabel ?? "",
          // Legacy products have no items array; normalize() promotes their
          // single downloadUrl into the first row so the editor shows it.
          digitalAccessItems: normalizeDigitalAccessItems(product),
          serviceLocation: product.serviceLocation ?? "",
          serviceDurationMinutes:
            product.serviceDurationMinutes != null
              ? String(product.serviceDurationMinutes)
              : "",
          eventStartsAt: toDatetimeLocal(product.eventStartsAt),
          eventEndsAt: toDatetimeLocal(product.eventEndsAt),
          eventLocation: product.eventLocation ?? "",
          weightGrams:
            product.weightGrams != null ? String(product.weightGrams) : "",
          lengthCm: product.lengthCm != null ? String(product.lengthCm) : "",
          widthCm: product.widthCm != null ? String(product.widthCm) : "",
          heightCm: product.heightCm != null ? String(product.heightCm) : "",
        }}
        defaultGalleryImages={orderedGalleryImages}
        linkedMembershipPlans={product.membershipPlans}
        storefrontUrl={publicSiteHref(workspace.slug, `products/${product.slug}`)}
        showVariantManager={product.type !== "BUNDLE"}
        variantAxes={variantAxes}
        variants={product.variants}
      />

      {product.type === "BUNDLE" ? (
        <div className="mt-6">
          <BundlePanel
            bundleId={product.id}
            candidates={bundleCandidates}
            initial={product.bundleContents.map((item) => ({
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity,
            }))}
          />
        </div>
      ) : null}

      {product.type === "PHYSICAL" ? (
        <div className="mt-6 space-y-6">
          {placement ? (
            <LocationStockPanel
              productId={product.id}
              productStock={product.stock}
              locations={pickupLocations}
              rows={placement.rows.map((row) => ({
                locationId: row.locationId,
                locationName: row.locationName,
                quantity: row.quantity,
              }))}
            />
          ) : null}
          <InventoryAdjustmentPanel
            productId={product.id}
            currentStock={product.stock}
            movements={inventoryMovements.map((movement) => ({
              ...movement,
              createdAt: movement.createdAt.toISOString(),
            }))}
          />
        </div>
      ) : null}

      <div className="mt-6">
        <ProductReviewsPanel reviews={product.reviews} />
      </div>
    </div>
  );
}

function toDatetimeLocal(value: Date | null) {
  if (!value) return "";
  const offset = value.getTimezoneOffset() * 60000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}
