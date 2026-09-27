"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { getCurrentWorkspace } from "@/lib/workspace";
import { couponSchema } from "@/lib/zod";

type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

async function requireEditableWorkspace() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) return null;
  return current.workspace;
}

function parse(formData: FormData) {
  let productIds: string[] = [];
  const productIdsRaw = formData.get("productIds");
  if (typeof productIdsRaw === "string" && productIdsRaw) {
    try {
      const parsed = JSON.parse(productIdsRaw);
      if (Array.isArray(parsed)) {
        productIds = parsed.filter((item) => typeof item === "string");
      }
    } catch {
      productIds = [];
    }
  }
  let courseIds: string[] = [];
  const courseIdsRaw = formData.get("courseIds");
  if (typeof courseIdsRaw === "string" && courseIdsRaw) {
    try {
      const parsed = JSON.parse(courseIdsRaw);
      if (Array.isArray(parsed)) courseIds = parsed.filter((item) => typeof item === "string");
    } catch {
      courseIds = [];
    }
  }

  return couponSchema.safeParse({
    code: ((formData.get("code") as string) || "").toUpperCase().trim(),
    type: formData.get("type"),
    stackingMode: formData.get("stackingMode") || "ADDITIVE",
    value: formData.get("value"),
    maxUses: (formData.get("maxUses") as string | null) ?? "",
    maxUsesPerCustomer: (formData.get("maxUsesPerCustomer") as string | null) ?? "",
    minimumPurchase: formData.get("minimumPurchase") || "0",
    startsAt: (formData.get("startsAt") as string | null) ?? "",
    expiresAt: (formData.get("expiresAt") as string | null) ?? "",
    firstOrderOnly: formData.get("firstOrderOnly") === "true",
    freeShipping: formData.get("freeShipping") === "true",
    isActive: formData.get("isActive") === "true",
    customerId: formData.get("customerId") || "",
    productIds,
    courseIds,
  });
}

function toMaxUses(raw: number | "" | undefined): number | null {
  if (raw === undefined || raw === "" || raw === 0) return null;
  return raw;
}

function toExpiresAt(raw: string | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createCouponAction(
  formData: FormData
): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  const parsed = parse(formData);
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

  const conflict = await prisma.coupon.findUnique({
    where: {
      workspaceId_code: { workspaceId: workspace.id, code: parsed.data.code },
    },
    select: { id: true },
  });
  if (conflict) {
    return {
      ok: false,
      error: "That code already exists.",
      fieldErrors: { code: ["Already in use."] },
    };
  }

  await prisma.coupon.create({
    data: {
      workspaceId: workspace.id,
      code: parsed.data.code,
      type: parsed.data.type,
      stackingMode: parsed.data.stackingMode,
      value: parsed.data.value,
      maxUses: toMaxUses(parsed.data.maxUses as number | "" | undefined),
      maxUsesPerCustomer: toMaxUses(parsed.data.maxUsesPerCustomer as number | "" | undefined),
      minimumPurchase: parsed.data.minimumPurchase ?? 0,
      startsAt: toExpiresAt(parsed.data.startsAt),
      expiresAt: toExpiresAt(parsed.data.expiresAt),
      firstOrderOnly: parsed.data.firstOrderOnly,
      freeShipping: parsed.data.freeShipping,
      isActive: parsed.data.isActive,
      customerId: parsed.data.customerId || null,
      productIds: parsed.data.productIds,
      courseIds: parsed.data.courseIds,
    },
  });

  revalidatePath("/dashboard/coupons");
  return { ok: true };
}

export async function updateCouponAction(
  couponId: string,
  formData: FormData
): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  const coupon = await prisma.coupon.findUnique({
    where: { id: couponId },
    select: { workspaceId: true },
  });
  if (!coupon || coupon.workspaceId !== workspace.id)
    return { ok: false, error: "Coupon not found." };

  const parsed = parse(formData);
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

  const codeConflict = await prisma.coupon.findFirst({
    where: {
      workspaceId: workspace.id,
      code: parsed.data.code,
      NOT: { id: couponId },
    },
    select: { id: true },
  });
  if (codeConflict) {
    return {
      ok: false,
      error: "That code already exists.",
      fieldErrors: { code: ["Already in use."] },
    };
  }

  await prisma.coupon.update({
    where: { id: couponId },
    data: {
      code: parsed.data.code,
      type: parsed.data.type,
      stackingMode: parsed.data.stackingMode,
      value: parsed.data.value,
      maxUses: toMaxUses(parsed.data.maxUses as number | "" | undefined),
      maxUsesPerCustomer: toMaxUses(parsed.data.maxUsesPerCustomer as number | "" | undefined),
      minimumPurchase: parsed.data.minimumPurchase ?? 0,
      startsAt: toExpiresAt(parsed.data.startsAt),
      expiresAt: toExpiresAt(parsed.data.expiresAt),
      firstOrderOnly: parsed.data.firstOrderOnly,
      freeShipping: parsed.data.freeShipping,
      isActive: parsed.data.isActive,
      customerId: parsed.data.customerId || null,
      productIds: parsed.data.productIds,
      courseIds: parsed.data.courseIds,
    },
  });

  revalidatePath("/dashboard/coupons");
  return { ok: true };
}

export async function deleteCouponAction(
  couponId: string
): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  const coupon = await prisma.coupon.findUnique({
    where: { id: couponId },
    select: { workspaceId: true },
  });
  if (!coupon || coupon.workspaceId !== workspace.id)
    return { ok: false, error: "Coupon not found." };

  await prisma.coupon.delete({ where: { id: couponId } });
  revalidatePath("/dashboard/coupons");
  return { ok: true };
}

export async function createBulkCouponsAction(
  formData: FormData
): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  const prefix = String(formData.get("prefix") || "SALE").toUpperCase().trim();
  const count = Math.min(
    Math.max(Number(formData.get("count") || 1), 1),
    100
  );
  const parsed = parse(formData);
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

  const rows = Array.from({ length: count }, (_, index) => ({
    workspaceId: workspace.id,
    code: `${prefix}-${Date.now().toString(36).toUpperCase()}-${String(
      index + 1
    ).padStart(2, "0")}`,
    type: parsed.data.type,
    stackingMode: parsed.data.stackingMode,
    value: parsed.data.value,
    maxUses: toMaxUses(parsed.data.maxUses as number | "" | undefined),
    maxUsesPerCustomer: toMaxUses(parsed.data.maxUsesPerCustomer as number | "" | undefined),
    minimumPurchase: parsed.data.minimumPurchase ?? 0,
    startsAt: toExpiresAt(parsed.data.startsAt),
    expiresAt: toExpiresAt(parsed.data.expiresAt),
    firstOrderOnly: parsed.data.firstOrderOnly,
    freeShipping: parsed.data.freeShipping,
    isActive: parsed.data.isActive,
    customerId: parsed.data.customerId || null,
    productIds: parsed.data.productIds,
    courseIds: parsed.data.courseIds,
  }));

  await prisma.coupon.createMany({ data: rows, skipDuplicates: true });
  revalidatePath("/dashboard/coupons");
  return { ok: true };
}

/**
 * Quick switch for showing the coupon field at cart and checkout. It writes
 * the same EcommerceSetting flag the settings page does — this is a shortcut
 * from where the seller manages coupons, not a second source of truth.
 */
export async function updateCouponCheckoutEnabledAction(
  enabled: boolean
): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  await prisma.ecommerceSetting.upsert({
    where: { workspaceId: workspace.id },
    update: { checkoutCouponEnabled: enabled },
    create: { workspaceId: workspace.id, checkoutCouponEnabled: enabled },
  });

  revalidatePath("/dashboard/coupons");
  revalidatePath("/dashboard/settings");
  revalidatePath("/site", "layout");
  return { ok: true };
}
