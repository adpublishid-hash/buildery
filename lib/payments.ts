import "server-only";

import type { PaymentStatus, Prisma } from "@prisma/client";

import { recordPurchaseEvent } from "@/lib/analytics";
import { prisma } from "@/lib/prisma";
import { MEMBERSHIP_LEVEL_LABEL } from "@/lib/labels";
import { recordInventoryMovement } from "@/lib/inventory-ledger";
import type { MetaCustomData } from "@/lib/meta-capi";
import { readStoredAdContext, sendWorkspaceAdEvent } from "@/lib/ad-events";
import { splitName } from "@/lib/ad-match";
import { catalogItemId, DEFAULT_AD_CURRENCY } from "@/lib/ad-catalog";
import { blendedRateBps, percentToBps } from "@/lib/affiliate-rates";
import { publicSiteHref } from "@/lib/public-url";
import {
  queueCourseEmailNotification,
  queueMembershipEmailNotification,
  queueOrderNotifications,
} from "@/lib/store-notifications";
import { releaseOrderStockReservation } from "@/lib/stock-reservations";
import { reportError } from "@/lib/error-reporting";
import { sendWorkspaceTelegramMessage } from "@/lib/telegram";
import { revalidateCatalog } from "@/lib/storefront-catalog";
import { bundleContents } from "@/lib/bundle-queries";
import { expandBundleLines } from "@/lib/product-bundles";
import { activateMembership } from "@/lib/membership-lifecycle";
import {
  createAffiliateCommission,
  recurringReferrerForMembership,
  orderCommissionBasis,
} from "@/lib/affiliate-commissions";

export type PaymentStatusMeta = {
  transactionId?: string | null;
  transactionStatus?: string | null;
  paymentType?: string | null;
  fraudStatus?: string | null;
  rawNotification?: Prisma.InputJsonValue;
};

const TERMINAL: PaymentStatus[] = ["PAID", "FAILED", "EXPIRED", "CANCELLED"];
type TransactionClient = Prisma.TransactionClient;

export type PaymentExpirySweepSummary = {
  scanned: number;
  expired: number;
  failed: number;
};

/**
 * Central payment-status transition. Updates the Payment row and the
 * resource it pays for (order / enrollment / membership), running
 * fulfillment side-effects exactly once when a payment first becomes PAID.
 *
 * Safe to call repeatedly with the same status — webhook deliveries can
 * arrive more than once.
 */
export async function applyPaymentStatus(
  paymentId: string,
  newStatus: PaymentStatus,
  meta: PaymentStatusMeta = {}
) {
  const result = await prisma.$transaction(
    async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
      });
      if (!payment) throw new Error("Payment not found.");

      if (TERMINAL.includes(payment.status)) {
        return { changed: false, payment, afterCommit: [] as Array<() => void> };
      }

      if (newStatus === "PENDING") {
        const current = await tx.payment.update({
          where: { id: payment.id },
          data: {
            transactionId: meta.transactionId ?? payment.transactionId,
            transactionStatus:
              meta.transactionStatus ?? payment.transactionStatus,
            paymentType: meta.paymentType ?? payment.paymentType,
            fraudStatus: meta.fraudStatus ?? payment.fraudStatus,
            rawNotification: meta.rawNotification ?? undefined,
          },
        });
        return {
          changed: false,
          payment: current,
          afterCommit: [] as Array<() => void>,
        };
      }

      const transition = await tx.payment.updateMany({
        where: { id: payment.id, status: "PENDING" },
        data: {
          status: newStatus,
          transactionId: meta.transactionId ?? payment.transactionId,
          transactionStatus: meta.transactionStatus ?? payment.transactionStatus,
          paymentType: meta.paymentType ?? payment.paymentType,
          fraudStatus: meta.fraudStatus ?? payment.fraudStatus,
          rawNotification: meta.rawNotification ?? undefined,
          paidAt: newStatus === "PAID" ? new Date() : payment.paidAt,
        },
      });
      if (transition.count !== 1) {
        const current = await tx.payment.findUniqueOrThrow({
          where: { id: payment.id },
        });
        return {
          changed: false,
          payment: current,
          afterCommit: [] as Array<() => void>,
        };
      }

      let afterCommit: Array<() => void> = [];
      if (newStatus === "PAID") {
        afterCommit = await fulfill(tx, payment);
      } else if (
        newStatus === "FAILED" ||
        newStatus === "EXPIRED" ||
        newStatus === "CANCELLED"
      ) {
        await unwind(tx, payment, newStatus);
      }

      return {
        changed: true,
        payment: { ...payment, status: newStatus },
        afterCommit,
      };
    },
    { isolationLevel: "Serializable" }
  );
  for (const effect of result.afterCommit) effect();
  return { changed: result.changed, payment: result.payment };
}

/**
 * Expires one overdue payment on demand, for the Payment Audit screen's
 * "expire sekarang" button. Scoped to a workspace and re-checked against
 * `expiresAt` so a dashboard action can neither reach another tenant nor
 * kill a payment that still has time left on it.
 */
export async function expireOverduePayment(
  paymentId: string,
  input: { workspaceId: string; now?: Date }
): Promise<{ ok: true; changed: boolean } | { ok: false; error: string }> {
  const now = input.now ?? new Date();
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, workspaceId: input.workspaceId },
    select: { id: true, status: true, expiresAt: true, midtransOrderId: true },
  });
  if (!payment) return { ok: false, error: "Payment tidak ditemukan." };
  if (payment.status !== "PENDING") {
    return { ok: false, error: "Payment ini sudah final." };
  }
  if (!payment.expiresAt || payment.expiresAt > now) {
    return { ok: false, error: "Payment ini belum melewati batas waktu." };
  }

  try {
    const result = await applyPaymentStatus(payment.id, "EXPIRED", {
      transactionStatus: "expired_by_system",
      rawNotification: {
        source: "payment_audit_manual_expiry",
        expiredAt: now.toISOString(),
        expiresAt: payment.expiresAt.toISOString(),
        midtransOrderId: payment.midtransOrderId,
      },
    });
    return { ok: true, changed: result.changed };
  } catch (error) {
    reportError("payments failed to expire payment", error, {
      context: { midtransOrderId: payment.midtransOrderId },
    });
    return { ok: false, error: "Gagal meng-expire payment ini." };
  }
}

export async function expireOverduePayments(
  options: { limit?: number; now?: Date } = {}
): Promise<PaymentExpirySweepSummary> {
  const now = options.now ?? new Date();
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const due = await prisma.payment.findMany({
    where: {
      status: "PENDING",
      expiresAt: { lte: now },
    },
    orderBy: { expiresAt: "asc" },
    take: limit,
    select: {
      id: true,
      midtransOrderId: true,
      expiresAt: true,
    },
  });
  const summary: PaymentExpirySweepSummary = {
    scanned: due.length,
    expired: 0,
    failed: 0,
  };

  for (const payment of due) {
    try {
      const result = await applyPaymentStatus(payment.id, "EXPIRED", {
        transactionStatus: "expired_by_system",
        rawNotification: {
          source: "payment_expiry_sweep",
          expiredAt: now.toISOString(),
          expiresAt: payment.expiresAt?.toISOString() ?? null,
          midtransOrderId: payment.midtransOrderId,
        },
      });
      if (result.changed) summary.expired += 1;
    } catch (error) {
      summary.failed += 1;
      reportError("payments failed to expire overdue payment", error, {
        context: { midtransOrderId: payment.midtransOrderId },
      });
    }
  }

  return summary;
}

/** Side-effects when a payment succeeds. */
async function fulfill(tx: TransactionClient, payment: {
  id: string;
  kind: "ORDER" | "ENROLLMENT" | "MEMBERSHIP";
  amount: number;
  midtransOrderId: string;
  orderId: string | null;
  enrollmentId: string | null;
  customerMembershipId: string | null;
  adContext: Prisma.JsonValue | null;
  membershipRenewal: boolean;
  referralAffiliateId: string | null;
}): Promise<Array<() => void>> {
  if (payment.kind === "ENROLLMENT" && payment.enrollmentId) {
    return fulfillEnrollmentPayment(tx, payment);
  }

  if (payment.kind === "MEMBERSHIP" && payment.customerMembershipId) {
    return fulfillMembershipPayment(tx, payment);
  }

  if (payment.kind === "ORDER" && payment.orderId) {
    return fulfillOrder(tx, payment.orderId, payment.adContext);
  }
  return [];
}

/** Order fulfillment — stock, coupon usage, affiliate commission. */
async function fulfillOrder(
  tx: TransactionClient,
  orderId: string,
  storedAdContext: Prisma.JsonValue | null = null
) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: {
      workspace: { select: { slug: true } },
      customer: true,
      items: { include: { product: true } },
    },
  });
  if (!order) throw new Error("Order not found.");

  const claimed = await tx.order.updateMany({
      where: { id: order.id, status: { not: "PAID" } },
      data: { status: "PAID" },
    });
  if (claimed.count !== 1) return [];

  // Past this point the money is captured and the order is PAID. Nothing below
  // may throw: a rollback would undo the PAID status while the provider keeps
  // the payment, and the webhook would retry the same failure forever. Problems
  // are collected and flagged for a human instead.
  const problems: string[] = [];

  await tx.abandonedCheckoutRecovery.updateMany({
    where: {
      orderId: order.id,
      status: { in: ["OPEN", "CONTACTED", "SNOOZED"] },
    },
    data: {
      status: "RECOVERED",
      recoveredAt: new Date(),
      snoozedUntil: null,
    },
  });

  // Legacy orders may not have a reservation yet, so still decrement on paid.
  if (!order.stockReservedAt) {
    // A bundle owns no stock; what moves is what it contains.
    const bundles = await bundleContents(
      order.items
        .filter((item) => item.product?.type === "BUNDLE" && item.productId)
        .map((item) => item.productId!),
      tx
    );
    const movements = expandBundleLines(
      order.items
        .filter(
          (item) =>
            item.productId &&
            (item.product?.type === "PHYSICAL" || item.product?.type === "BUNDLE")
        )
        .map((item) => ({
          productId: item.productId!,
          variantId: item.variantId,
          name: item.nameSnapshot,
          quantity: item.quantity,
        })),
      bundles
    );

    for (const item of movements.map((line) => ({
      productId: line.productId,
      variantId: line.variantId,
      quantity: line.quantity,
      nameSnapshot: line.name,
      product: { type: "PHYSICAL" as const },
    }))) {
      if (item.product && item.product.type === "PHYSICAL" && item.productId) {
        if (item.variantId) {
          const variantUpdated = await tx.productVariant.updateMany({
            where: {
              id: item.variantId,
              productId: item.productId,
              stock: { gte: item.quantity },
            },
            data: { stock: { decrement: item.quantity } },
          });
          if (variantUpdated.count !== 1) {
            problems.push(
              `Stok varian "${item.nameSnapshot}" tidak cukup saat pembayaran masuk.`
            );
          }
        }
        const updated = await tx.product.updateMany({
          where: {
            id: item.productId,
            type: "PHYSICAL",
            stock: { gte: item.quantity },
          },
          data: { stock: { decrement: item.quantity } },
        });
        if (updated.count !== 1) {
          problems.push(
            `Stok "${item.nameSnapshot}" tidak cukup saat pembayaran masuk (butuh ${item.quantity}).`
          );
          continue;
        }
        const product = await tx.product.findUnique({
          where: { id: item.productId },
          select: { stock: true, workspaceId: true },
        });
        if (product) {
          await recordInventoryMovement(tx, {
            workspaceId: product.workspaceId,
            productId: item.productId,
            orderId: order.id,
            type: "ORDER_FULFILLMENT",
            quantityChange: -item.quantity,
            stockBefore: product.stock + item.quantity,
            stockAfter: product.stock,
            reason: `Payment captured for order ${order.orderNumber}`,
          });
        }
      }
    }
  }

  if (order.couponId) {
    const updated = await tx.$executeRaw`
      UPDATE "Coupon"
      SET "uses" = "uses" + 1, "updatedAt" = NOW()
      WHERE "id" = ${order.couponId}
        AND ("maxUses" IS NULL OR "uses" < "maxUses")
    `;
    if (updated !== 1) {
      // The last slot went to someone else between checkout and payment. The
      // discount was already given; someone has to decide what to do about it.
      problems.push(
        "Kuota kupon sudah habis saat pembayaran masuk, jadi pemakaiannya tidak tercatat."
      );
    }
  }

  if (order.customerId) {
      const productIds = order.items
        .map((item) => item.productId)
        .filter((id): id is string => Boolean(id));
      const linkedPlans = productIds.length
        ? await tx.membershipPlan.findMany({
            where: {
              workspaceId: order.workspaceId,
              productId: { in: productIds },
              isActive: true,
            },
            select: { id: true, accessDays: true, name: true },
          })
        : [];

      for (const plan of linkedPlans) {
        const membership = await tx.customerMembership.upsert({
          where: {
            customerId_planId: {
              customerId: order.customerId,
              planId: plan.id,
            },
          },
          update: {},
          create: {
            workspaceId: order.workspaceId,
            customerId: order.customerId,
            planId: plan.id,
            status: "PENDING",
          },
        });
        const activation = await activateMembership(tx, {
          membershipId: membership.id,
          source: "PRODUCT_PURCHASE",
          metadata: { orderId: order.id },
        });
        await queueMembershipEmailNotification(tx, {
          workspaceId: order.workspaceId,
          customerId: order.customerId,
          recipient: activation.customer.email,
          event: activation.renewed ? "MEMBERSHIP_RENEWED" : "MEMBERSHIP_WELCOME",
          subject: activation.renewed ? `Access renewed: ${plan.name}` : `Welcome to ${plan.name}`,
          body: `Hi ${activation.customer.name}, your ${plan.name} access is now active.`,
        });
      }
  }

  await recordPurchaseEvent({
    workspaceId: order.workspaceId,
    orderId: order.id,
    value: order.total,
  });

  await queueOrderNotifications(tx, order.id, "PAYMENT_PAID");

  // Affiliate side effects share the same transaction and are idempotent per order.
  if (order.referralAffiliateId) {
    const affiliate = await tx.affiliate.findUnique({
      where: { id: order.referralAffiliateId },
      include: {
        program: {
          select: {
            includeShipping: true,
            includeTax: true,
            includeFees: true,
            commissionPercent: true,
          },
        },
      },
    });
    if (affiliate?.workspaceId === order.workspaceId) {
      await createAffiliateCommission(tx, {
        workspaceId: order.workspaceId,
        affiliateId: affiliate.id,
        sourceType: "ORDER",
        sourceId: order.id,
        sourceLabel: order.orderNumber,
        basisAmount: orderCommissionBasis(order, affiliate.program),
        purchaserCustomerId: order.customerId,
        purchaserEmail: order.customer?.email ?? order.customerEmailSnapshot,
        orderId: order.id,
        itemRateBps: blendedRateBps(
          order.items.map((item) => ({
            amount: item.unitPrice * item.quantity,
            percent: item.product?.affiliateCommissionPercent,
          })),
          affiliate.program.commissionPercent
        ),
      });
    }
  }

  if (problems.length > 0) {
    const reason = problems.join(" ").slice(0, 500);
    await tx.order.update({
      where: { id: order.id },
      data: { needsAttention: true, attentionReason: reason },
    });
  }

  return [() => {
    // Stock just changed, so the cached catalogue is out of date. Checkout
    // re-checks stock anyway, but a sold-out card should say so.
    revalidateCatalog(order.workspaceId);
    if (problems.length > 0) {
      // After commit: an alert that fails must never undo a paid order.
      void sendWorkspaceTelegramMessage(
        order.workspaceId,
        [
          `⚠️ Order ${order.orderNumber} sudah DIBAYAR tapi perlu dicek`,
          "",
          problems.join("\n"),
        ].join("\n")
      ).catch((error) => {
        reportError("order attention alert failed", error);
      });
    }
    sendWorkspaceAdEvent(order.workspaceId, {
      eventName: "Purchase",
      eventId: `purchase:order:${order.orderNumber}`,
      sourceUrl: publicSiteHref(
        order.workspace.slug,
        `checkout/success?order=${encodeURIComponent(order.orderNumber)}`
      ),
      ...readStoredAdContext(storedAdContext),
      customData: buildOrderPurchaseData(order),
      customerData: {
        email: order.customer?.email ?? order.customerEmailSnapshot,
        phone:
          order.customer?.phone ??
          order.customerPhoneSnapshot ??
          order.shippingRecipientPhone,
        ...splitName(order.customer?.name ?? order.customerNameSnapshot),
        city: order.shippingCityName,
        postalCode: order.shippingPostalCode,
        // Shipping is only quoted for Indonesian addresses (RajaOngkir).
        country: order.shippingCityName ? "ID" : null,
        externalId: order.customerId,
      },
    }).catch((error) => {
      console.warn("Ad event order Purchase failed", error);
    });
  }];
}

async function fulfillEnrollmentPayment(tx: TransactionClient, payment: {
  id: string;
  enrollmentId: string | null;
  amount: number;
  midtransOrderId: string;
  adContext: Prisma.JsonValue | null;
  referralAffiliateId: string | null;
}) {
  if (!payment.enrollmentId) return [];
  const enrollment = await tx.enrollment.update({
    where: { id: payment.enrollmentId },
    data: { status: "ACTIVE" },
    include: {
      workspace: { select: { slug: true } },
      customer: true,
      course: {
        select: {
          id: true,
          title: true,
          slug: true,
          requiredLevel: true,
          isFree: true,
          price: true,
          affiliateCommissionPercent: true,
        },
      },
    },
  });
  const sourceUrl = publicSiteHref(
    enrollment.workspace.slug,
    `courses/${enrollment.course.slug}`
  );
  const customerData = {
    email: enrollment.customer.email,
    phone: enrollment.customer.phone,
    ...splitName(enrollment.customer.name),
    externalId: enrollment.customer.id,
  };
  const adContext = readStoredAdContext(payment.adContext);
  const customData = {
    ...buildCoursePurchaseData(enrollment.course, payment.amount),
    order_id: payment.midtransOrderId,
    status: "active",
  };

  if (enrollment.couponCode) {
    await tx.coupon.updateMany({
      where: { workspaceId: enrollment.workspaceId, code: enrollment.couponCode, isActive: true },
      data: { uses: { increment: 1 } },
    });
  }

  await createAffiliateCommission(tx, {
    workspaceId: enrollment.workspaceId,
    affiliateId: payment.referralAffiliateId,
    sourceType: "ENROLLMENT",
    sourceId: enrollment.id,
    sourceLabel: enrollment.course.title,
    basisAmount: payment.amount,
    purchaserCustomerId: enrollment.customerId,
    purchaserEmail: enrollment.customer.email,
    itemRateBps: percentToBps(enrollment.course.affiliateCommissionPercent),
  });

  return [() => {
    sendWorkspaceAdEvent(enrollment.workspaceId, {
      eventName: "Purchase",
      eventId: `purchase:enrollment:${payment.id}`,
      sourceUrl,
      ...adContext,
      customData,
      customerData,
    }).catch((error) => {
      console.warn("Ad event course Purchase failed", error);
    });
    sendWorkspaceAdEvent(enrollment.workspaceId, {
      eventName: "CompleteRegistration",
      eventId: `complete_registration:enrollment:${enrollment.id}`,
      sourceUrl,
      ...adContext,
      customData,
      customerData,
    }).catch((error) => {
      console.warn("Ad event course CompleteRegistration failed", error);
    });
    queueCourseEmailNotification(prisma, {
      workspaceId: enrollment.workspaceId,
      customerId: enrollment.customer.id,
      recipient: enrollment.customer.email,
      event: "COURSE_ENROLLED",
      subject: `Course access: ${enrollment.course.title}`,
      body: `Hi ${enrollment.customer.name}, your payment was confirmed and access to ${enrollment.course.title} is now active.`,
    }).catch((error) => {
      console.warn("Course enrollment email failed", error);
    });
  }];
}

async function fulfillMembershipPayment(tx: TransactionClient, payment: {
  id: string;
  customerMembershipId: string | null;
  amount: number;
  midtransOrderId: string;
  adContext: Prisma.JsonValue | null;
  membershipRenewal: boolean;
  referralAffiliateId: string | null;
}) {
  if (!payment.customerMembershipId) return [];
  const activated = await activateMembership(tx, {
    membershipId: payment.customerMembershipId,
    paymentId: payment.id,
    source: payment.membershipRenewal ? "RENEWAL" : "PAYMENT",
    amount: payment.amount,
  });
  const membership = await tx.customerMembership.findUniqueOrThrow({
    where: { id: activated.membership.id },
    include: {
      workspace: { select: { slug: true } },
      customer: true,
      plan: { select: { id: true, name: true, level: true, price: true, affiliateCommissionPercent: true } },
    },
  });
  const sourceUrl = publicSiteHref(membership.workspace.slug, "memberships");
  const customerData = {
    email: membership.customer.email,
    phone: membership.customer.phone,
    ...splitName(membership.customer.name),
    externalId: membership.customer.id,
  };
  const adContext = readStoredAdContext(payment.adContext);
  const customData = {
    ...buildMembershipPurchaseData(membership.plan, payment.amount),
    order_id: payment.midtransOrderId,
    status: "active",
  };

  // A renewal without a fresh referral click can still pay the partner who
  // brought the member in, when the program pays recurring commissions.
  const affiliateId =
    payment.referralAffiliateId ??
    (payment.membershipRenewal
      ? await recurringReferrerForMembership(tx, {
          workspaceId: membership.workspaceId,
          customerMembershipId: membership.id,
          excludePaymentId: payment.id,
        })
      : null);
  await createAffiliateCommission(tx, {
    workspaceId: membership.workspaceId,
    affiliateId,
    sourceType: "MEMBERSHIP",
    sourceId: payment.id,
    sourceLabel: payment.membershipRenewal ? `${membership.plan.name} (renewal)` : membership.plan.name,
    itemRateBps: percentToBps(membership.plan.affiliateCommissionPercent),
    basisAmount: payment.amount,
    purchaserCustomerId: membership.customerId,
    purchaserEmail: membership.customer.email,
  });

  return [() => {
    sendWorkspaceAdEvent(membership.workspaceId, {
      eventName: "Purchase",
      eventId: `purchase:membership:${payment.id}`,
      sourceUrl,
      ...adContext,
      customData,
      customerData,
    }).catch((error) => {
      console.warn("Ad event membership Purchase failed", error);
    });
    sendWorkspaceAdEvent(membership.workspaceId, {
      eventName: "CompleteRegistration",
      eventId: `complete_registration:membership:${membership.id}`,
      sourceUrl,
      ...adContext,
      customData,
      customerData,
    }).catch((error) => {
      console.warn("Ad event membership CompleteRegistration failed", error);
    });
    queueMembershipEmailNotification(prisma, {
      workspaceId: membership.workspaceId,
      customerId: membership.customerId,
      recipient: membership.customer.email,
      event: activated.renewed ? "MEMBERSHIP_RENEWED" : "MEMBERSHIP_WELCOME",
      subject: activated.renewed
        ? `Access renewed: ${membership.plan.name}`
        : `Welcome to ${membership.plan.name}`,
      body: `Hi ${membership.customer.name}, your ${membership.plan.name} access is now active.`,
    }).catch((error) => {
      console.warn("Membership email failed", error);
    });
  }];
}

/** Side-effects when a payment fails / expires / is cancelled. */
async function unwind(
  tx: TransactionClient,
  payment: {
    kind: "ORDER" | "ENROLLMENT" | "MEMBERSHIP";
    orderId: string | null;
    enrollmentId: string | null;
    customerMembershipId: string | null;
    membershipRenewal: boolean;
  },
  status: "FAILED" | "EXPIRED" | "CANCELLED"
) {
  if (payment.kind === "ORDER" && payment.orderId) {
    await tx.order.update({
      where: { id: payment.orderId },
      data: { status },
    });
    const order = await tx.order.findUnique({
      where: { id: payment.orderId },
      select: { workspaceId: true, fulfillmentStatus: true },
    });
    if (order && order.fulfillmentStatus !== "NOT_REQUIRED") {
      await tx.order.updateMany({
        where: {
          id: payment.orderId,
          fulfillmentStatus: { not: "NOT_REQUIRED" },
        },
        data: { fulfillmentStatus: "CANCELLED" },
      });
      await tx.fulfillmentEvent.create({
        data: {
          workspaceId: order.workspaceId,
          orderId: payment.orderId,
          status: "CANCELLED",
          note: `Payment marked ${status.toLowerCase()}.`,
        },
      });
    }
    await releaseOrderStockReservation(tx, payment.orderId);
  } else if (payment.kind === "ENROLLMENT" && payment.enrollmentId) {
    await tx.enrollment.update({
      where: { id: payment.enrollmentId },
      data: { status: "CANCELLED" },
    });
    await tx.courseCertificate.updateMany({
      where: { enrollmentId: payment.enrollmentId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } else if (payment.kind === "MEMBERSHIP" && payment.customerMembershipId) {
    const membership = await tx.customerMembership.findUnique({
      where: { id: payment.customerMembershipId },
      include: { customer: true, plan: true },
    });
    if (!payment.membershipRenewal) {
      await tx.customerMembership.update({
        where: { id: payment.customerMembershipId },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
    }
    if (membership) {
      await queueMembershipEmailNotification(tx, {
        workspaceId: membership.workspaceId,
        customerId: membership.customerId,
        recipient: membership.customer.email,
        event: "MEMBERSHIP_PAYMENT_FAILED",
        subject: `Payment incomplete: ${membership.plan.name}`,
        body: `Hi ${membership.customer.name}, your payment for ${membership.plan.name} was ${status.toLowerCase()}. Your existing access, if any, has not been shortened.`,
      });
    }
  }
}

function buildOrderPurchaseData(order: {
  orderNumber: string;
  total: number;
  items: {
    id: string;
    productId: string | null;
    variantId: string | null;
    nameSnapshot: string;
    unitPrice: number;
    quantity: number;
  }[];
}): MetaCustomData {
  const contents = order.items.map((item) => ({
    id: item.productId ? catalogItemId(item.productId, item.variantId) : item.id,
    quantity: item.quantity,
    item_price: item.unitPrice,
  }));
  return {
    content_ids: contents.map((item) => item.id),
    content_name: `Order ${order.orderNumber}`,
    content_type: "product",
    contents,
    currency: DEFAULT_AD_CURRENCY,
    value: order.total,
    num_items: order.items.reduce((sum, item) => sum + item.quantity, 0),
    order_id: order.orderNumber,
  };
}

function buildCoursePurchaseData(
  course: {
    id: string;
    title: string;
    requiredLevel: keyof typeof MEMBERSHIP_LEVEL_LABEL;
    isFree: boolean;
    price: number;
  },
  amount: number
): MetaCustomData {
  const itemPrice = course.isFree ? 0 : course.price;
  return {
    content_ids: [course.id],
    content_name: course.title,
    content_type: "course",
    content_category: MEMBERSHIP_LEVEL_LABEL[course.requiredLevel],
    contents: [{ id: course.id, quantity: 1, item_price: itemPrice }],
    currency: DEFAULT_AD_CURRENCY,
    value: amount,
    num_items: 1,
  };
}

function buildMembershipPurchaseData(
  plan: {
    id: string;
    name: string;
    level: keyof typeof MEMBERSHIP_LEVEL_LABEL;
    price: number;
  },
  amount: number
): MetaCustomData {
  return {
    content_ids: [plan.id],
    content_name: plan.name,
    content_type: "membership",
    content_category: MEMBERSHIP_LEVEL_LABEL[plan.level],
    contents: [{ id: plan.id, quantity: 1, item_price: plan.price }],
    currency: DEFAULT_AD_CURRENCY,
    value: amount,
    num_items: 1,
  };
}

/** Human-friendly order id for Midtrans — unique, alphanumeric + dash. */
export function generateMidtransOrderId(prefix = "BD") {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).toUpperCase().slice(2, 7);
  return `${prefix}-${stamp}${rand}`;
}

/** Loads a payment + its linked resource for the public status pages. */
export async function getPaymentByRef(ref: string) {
  return prisma.payment.findUnique({
    where: { midtransOrderId: ref },
    include: {
      workspace: { select: { id: true, name: true, slug: true } },
      order: { select: { id: true, orderNumber: true } },
      enrollment: {
        select: {
          id: true,
          course: {
            select: {
              id: true,
              title: true,
              requiredLevel: true,
              isFree: true,
              price: true,
            },
          },
        },
      },
      customerMembership: {
        select: {
          id: true,
          plan: { select: { id: true, name: true, level: true, price: true } },
        },
      },
    },
  });
}
