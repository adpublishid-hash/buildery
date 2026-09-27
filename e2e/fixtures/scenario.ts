import { randomBytes } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Builds a throwaway store for one E2E scenario and tears it down after.
 *
 * Each run gets its own workspace, owner, customer-facing product and
 * affiliate, so specs never collide with each other or with seed data.
 * Deleting the workspace cascades to everything below it.
 */

export const prisma = new PrismaClient();

export const OWNER_PASSWORD = "Password123!";

export type Scenario = Awaited<ReturnType<typeof createScenario>>;

export async function createScenario(
  options: { stock?: number; price?: number; withAffiliate?: boolean } = {}
) {
  const id = randomBytes(4).toString("hex");
  const stock = options.stock ?? 10;
  const price = options.price ?? 250_000;

  const owner = await prisma.user.create({
    data: {
      name: `E2E Owner ${id}`,
      email: `e2e-owner-${id}@buildery.test`,
      password: await bcrypt.hash(OWNER_PASSWORD, 10),
      role: "OWNER",
      emailVerified: new Date(),
    },
  });

  const workspace = await prisma.workspace.create({
    data: {
      name: `E2E Store ${id}`,
      slug: `e2e-store-${id}`,
      createdById: owner.id,
      members: { create: { userId: owner.id, role: "OWNER" } },
    },
  });

  // Manual transfer only: the whole point is a payment path that never
  // reaches Midtrans. Pickup removes the shipping-address detour.
  const setting = await prisma.ecommerceSetting.create({
    data: {
      workspaceId: workspace.id,
      pickupEnabled: true,
      checkoutCouponEnabled: false,
      checkoutSellerNoteEnabled: false,
      lowStockThreshold: 1,
    },
  });

  const manualMethod = await prisma.manualPaymentMethod.create({
    data: {
      workspaceId: workspace.id,
      settingId: setting.id,
      type: "BANK_TRANSFER",
      name: "Transfer BCA",
      accountName: "E2E Store",
      accountNumber: "1234567890",
      isActive: true,
    },
  });

  const product = await prisma.product.create({
    data: {
      workspaceId: workspace.id,
      name: `Kaos E2E ${id}`,
      slug: `kaos-e2e-${id}`,
      type: "PHYSICAL",
      status: "ACTIVE",
      price,
      stock,
      sku: `E2E-${id}`,
    },
  });

  let affiliate: { id: string; referralCode: string; percent: number } | null =
    null;
  if (options.withAffiliate !== false) {
    const program = await prisma.affiliateProgram.create({
      data: { workspaceId: workspace.id, commissionPercent: 20, isOpen: true },
    });
    const customer = await prisma.customer.create({
      data: {
        workspaceId: workspace.id,
        name: `Affiliate ${id}`,
        email: `e2e-affiliate-${id}@buildery.test`,
      },
    });
    const row = await prisma.affiliate.create({
      data: {
        programId: program.id,
        workspaceId: workspace.id,
        customerId: customer.id,
        referralCode: `E2E${id.toUpperCase()}`,
      },
    });
    affiliate = {
      id: row.id,
      referralCode: row.referralCode,
      percent: program.commissionPercent,
    };
  }

  return {
    id,
    owner: { id: owner.id, email: owner.email, password: OWNER_PASSWORD },
    workspace: { id: workspace.id, slug: workspace.slug },
    product: { id: product.id, slug: product.slug, price, stock },
    manualMethod: { id: manualMethod.id, name: manualMethod.name },
    affiliate,
    async destroy() {
      await prisma.workspace.delete({ where: { id: workspace.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: owner.id } }).catch(() => {});
    },
  };
}

/** The order this scenario's checkout produced, with everything specs assert on. */
export async function loadOrder(workspaceId: string) {
  return prisma.order.findFirst({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    include: {
      items: true,
      payment: true,
      refunds: { include: { items: true, evidence: true } },
      commissions: true,
    },
  });
}

export async function productStock(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { stock: true },
  });
  return product?.stock ?? -1;
}

/**
 * Marks the manual transfer as having a proof waiting for review, which is
 * what the dashboard's verify button acts on. The upload itself is covered
 * by its own route; this keeps the E2E on the money path.
 */
export async function submitManualProof(paymentId: string) {
  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      manualProofUrl: "/uploads/e2e/proof.png",
      manualProofStatus: "PENDING",
      manualProofSubmittedAt: new Date(),
    },
  });
}
