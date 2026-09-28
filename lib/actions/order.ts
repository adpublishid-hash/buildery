"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type {
  FulfillmentStatus,
  ManualPaymentProofStatus,
  OrderStatus,
  PaymentStatus,
  Prisma,
  RefundStatus,
  RefundType,
  ShippingMethodType,
} from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidateCatalog } from "@/lib/storefront-catalog";
import { rateLimitByIp } from "@/lib/rate-limit";
import { clearStoredCart } from "@/lib/cart-store";
import { bundleContents } from "@/lib/bundle-queries";
import { bundleAvailability, expandBundleLines } from "@/lib/product-bundles";
import { VISITOR_COOKIE } from "@/lib/analytics-visitor";
import { parseTrackingImport } from "@/lib/tracking-import";
import { COD_PROVIDER, codEligibility, isCodPayment } from "@/lib/cod";
import { rememberCustomerAddress } from "@/lib/customer-addresses";
import { canInWorkspace } from "@/lib/permissions";
import { getCurrentWorkspace } from "@/lib/workspace";
import {
  CART_COOKIE,
  effectivePrice,
  effectiveProductVariantPrice,
  evaluateCoupon,
  generateOrderNumber,
  readCart,
} from "@/lib/store";
import {
  getOrCreateEcommerceSetting,
  getPaymentExpiry,
} from "@/lib/ecommerce-settings";
import { queueOrderNotifications } from "@/lib/store-notifications";
import { getActiveAffiliateFor } from "@/lib/affiliate";
import { recordConversionEvent } from "@/lib/analytics";
import { applyPaymentStatus, generateMidtransOrderId } from "@/lib/payments";
import { updateOrderFulfillment } from "@/lib/order-fulfillment";
import {
  createOrderRefund,
  processOrderRefundProvider,
  type OrderRefundEvidenceInput,
  type OrderRefundItemInput,
  updateOrderRefundStatus,
} from "@/lib/order-refunds";
import { cancelMidtransOrderPayment } from "@/lib/payment-cancellations";
import { submitPublicReturnRequest } from "@/lib/public-return-requests";
import type { MetaCustomData, MetaStandardEventName } from "@/lib/meta-capi";
import {
  requestAdContext,
  sendWorkspaceAdEvent,
  toStoredAdContext,
} from "@/lib/ad-events";
import { splitName } from "@/lib/ad-match";
import { catalogItemId, DEFAULT_AD_CURRENCY } from "@/lib/ad-catalog";
import { publicSiteHref } from "@/lib/public-url";
import { checkoutSchema } from "@/lib/zod";
import { getMemberSession } from "@/lib/member-auth";
import { issuePublicAccessToken } from "@/lib/public-access-token";
import { quoteShipping, resolveShippingProvider } from "@/lib/shipping/rates";
import {
  reserveStockForOrder,
  StockReservationError,
} from "@/lib/stock-reservations";
import { reportError } from "@/lib/error-reporting";
import { assertCanAcceptOrder } from "@/lib/saas-limits";

type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

type MetaActionEvent = {
  eventName: MetaStandardEventName;
  eventId: string;
  customData: MetaCustomData;
};

/**
 * Checkout — turns the cart into a PENDING order plus a PENDING payment.
 * Physical stock is reserved immediately to prevent oversell; coupon usage
 * and affiliate commissions are applied later, when payment is confirmed
 * (see lib/payments.ts). Returns the payment id so the client can start
 * the Midtrans flow.
 */
export async function createOrderAction(
  workspaceId: string,
  formData: FormData
): Promise<
  ActionResult<{
    paymentId: string;
    orderNumber: string;
    paymentMode: string;
    paymentAccessToken: string;
    orderAccessToken: string;
    metaEvent?: MetaActionEvent;
  }>
> {
  const parsed = checkoutSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    note: formData.get("note") || undefined,
  });
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

  // Creating an order reserves stock when the store decrements at checkout, so
  // an unthrottled endpoint lets anyone drain a shop's inventory with orders
  // they never pay for — the reservation only lapses at the payment timeout,
  // 24 hours by default.
  const throttle = await rateLimitByIp("checkout-order", 10, 10 * 60 * 1000);
  if (!throttle.ok) {
    return {
      ok: false,
      error: `Terlalu banyak percobaan checkout. Coba lagi dalam ${Math.ceil(throttle.retryAfter / 60)} menit.`,
    };
  }

  const checkoutRequestId = String(formData.get("checkoutRequestId") || "").trim();
  if (!/^[a-zA-Z0-9-]{20,80}$/.test(checkoutRequestId)) {
    return { ok: false, error: "Sesi checkout tidak valid. Muat ulang halaman." };
  }
  const existingOrder = await prisma.order.findUnique({
    where: { checkoutRequestId },
    include: { payment: true },
  });
  if (existingOrder) {
    if (existingOrder.workspaceId !== workspaceId || !existingOrder.payment) {
      return { ok: false, error: "Sesi checkout tidak valid." };
    }
    return checkoutOrderResult(existingOrder);
  }

  const orderLimitError = await assertCanAcceptOrder(workspaceId);
  if (orderLimitError) return { ok: false, error: orderLimitError };

  const cart = readCart();
  if (cart.workspaceId !== workspaceId || cart.items.length === 0) {
    return { ok: false, error: "Your cart is empty." };
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { slug: true },
  });
  if (!workspace) return { ok: false, error: "Workspace not found." };

  const setting = await getOrCreateEcommerceSetting(workspaceId);
  const member = await getMemberSession(workspace.slug);
  if (setting.checkoutRequireLogin && !member) {
    return { ok: false, error: "Silakan login sebelum melanjutkan checkout." };
  }
  const selectedPaymentMethodId = String(formData.get("paymentMethodId") || "");
  const requestedMode = String(formData.get("paymentMode") || "midtrans");
  const paymentMode: "midtrans" | "manual" | "cod" =
    requestedMode === "manual"
      ? "manual"
      : requestedMode === "cod"
        ? "cod"
        : "midtrans";
  const manualMethod = selectedPaymentMethodId
    ? await prisma.manualPaymentMethod.findFirst({
        where: {
          id: selectedPaymentMethodId,
          workspaceId,
          isActive: true,
        },
        select: {
          id: true,
          type: true,
          name: true,
          accountName: true,
          accountNumber: true,
          qrImageUrl: true,
          instructions: true,
        },
      })
    : null;
  if (paymentMode === "manual" && !manualMethod) {
    return { ok: false, error: "Pilih metode pembayaran manual yang aktif." };
  }

  const products = await prisma.product.findMany({
    where: {
      id: { in: cart.items.map((it) => it.productId) },
      workspaceId,
      status: "ACTIVE",
    },
    include: { variants: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const lines: {
    productId: string;
    variantId: string | null;
    nameSnapshot: string;
    skuSnapshot: string | null;
    variantSnapshot: { name: string; options: Prisma.JsonValue } | null;
    unitPrice: number;
    quantity: number;
  }[] = [];

  for (const item of cart.items) {
    const product = byId.get(item.productId);
    if (!product) {
      return {
        ok: false,
        error: "A product in your cart is no longer available.",
      };
    }
    const variant = item.variantId
      ? product.variants.find(
          (candidate) => candidate.id === item.variantId && candidate.isActive
        )
      : null;
    if (item.variantId && !variant) {
      return { ok: false, error: `Varian "${product.name}" tidak tersedia.` };
    }
    if (product.variants.some((candidate) => candidate.isActive) && !variant) {
      return { ok: false, error: `Pilih varian untuk "${product.name}".` };
    }
    const availableStock = variant?.stock ?? product.stock;
    if (product.type === "PHYSICAL" && availableStock < item.quantity) {
      return {
        ok: false,
        error: `"${product.name}" only has ${availableStock} left in stock.`,
      };
    }
    lines.push({
      productId: product.id,
      variantId: variant?.id ?? null,
      nameSnapshot: variant ? `${product.name} - ${variant.name}` : product.name,
      skuSnapshot: variant?.sku ?? product.sku,
      variantSnapshot: variant
        ? { name: variant.name, options: variant.options }
        : null,
      unitPrice: variant ? effectiveProductVariantPrice(product, variant) : effectivePrice(product),
      quantity: item.quantity,
    });
  }

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);

  // Shipping is recalculated from trusted settings. Client costs are ignored.
  // Read from form if buyer entered shipping. Server treats them as opaque
  // strings (the front-end picks valid options via the calculate endpoint).
  const shipReader = (k: string) => String(formData.get(k) ?? "").trim();
  const shipping = {
    provinceId: shipReader("shippingProvinceId") || null,
    provinceName: shipReader("shippingProvinceName") || null,
    cityId: shipReader("shippingCityId") || null,
    cityName: shipReader("shippingCityName") || null,
    postalCode: shipReader("shippingPostalCode") || null,
    address: shipReader("shippingAddress") || null,
    recipientName: shipReader("shippingRecipientName") || null,
    recipientPhone: shipReader("shippingRecipientPhone") || null,
    courier: shipReader("shippingCourier") || null,
    service: shipReader("shippingService") || null,
    etd: shipReader("shippingEtd") || null,
  };
  let shippingCost = 0;
  // If the cart needs shipping (any physical product), require an address +
  // courier selection.
  // What a bundle contains, so its stock, shipping and reservations all come
  // from the real products rather than a number of its own.
  const bundleIds = lines
    .map((line) => byId.get(line.productId))
    .filter((product) => product?.type === "BUNDLE")
    .map((product) => product!.id);
  const bundles = await bundleContents(bundleIds);

  for (const line of lines) {
    const product = byId.get(line.productId);
    if (product?.type !== "BUNDLE") continue;
    const contents = bundles.get(product.id) ?? [];
    const available = bundleAvailability(contents);
    if (available < line.quantity) {
      return {
        ok: false,
        error:
          available <= 0
            ? `Paket "${product.name}" sedang tidak tersedia.`
            : `Paket "${product.name}" hanya tersisa ${available}.`,
      };
    }
  }

  const requiresShipping = lines.some((l) => {
    const product = byId.get(l.productId);
    if (!product) return false;
    if (product.type === "PHYSICAL") return true;
    // A bundle needs a courier when anything inside it does.
    return (
      product.type === "BUNDLE" &&
      (bundles.get(product.id) ?? []).some((component) => component.tracksStock)
    );
  });
  let shippingMethodType: ShippingMethodType | null = null;
  let shippingMethodName: string | null = null;
  const requestedShippingMethod = shipReader("shippingMethodType");
  const addressComplete = Boolean(
    shipping.address &&
      shipping.recipientName &&
      shipping.recipientPhone &&
      (shipping.cityId || shipping.cityName)
  );
  if (requiresShipping && requestedShippingMethod === "AUTOMATIC") {
    const shippingProvider = await resolveShippingProvider(workspaceId);
    if (!shippingProvider) {
      return { ok: false, error: "Ongkir otomatis sedang tidak tersedia." };
    }
    if (
      !addressComplete ||
      !shipping.cityId ||
      !shipping.courier ||
      !shipping.service
    ) {
      return { ok: false, error: "Alamat pengiriman & kurir wajib diisi." };
    }
    const totalWeightGrams = lines.reduce((sum, line) => {
      const product = byId.get(line.productId);
      return (
        sum +
        (product?.type === "PHYSICAL"
          ? Math.max(0, product.variants.find((variant) => variant.id === line.variantId)?.weightGrams ?? product.weightGrams ?? 0) * line.quantity
          : 0)
      );
    }, 0);

    try {
      // Re-priced here with the store's own provider: the browser's quote is
      // only a choice, never a price.
      const quotes = await quoteShipping(shippingProvider, {
        destination: shipping.cityId,
        weightGrams: Math.max(1, totalWeightGrams || 1000),
        itemValue: subtotal,
      });
      const selectedQuote = quotes.find(
        (quote) =>
          quote.courier.toLowerCase() === shipping.courier?.toLowerCase() &&
          quote.service.toLowerCase() === shipping.service?.toLowerCase()
      );
      if (!selectedQuote) {
        return {
          ok: false,
          error: "Pilihan ongkir sudah berubah. Pilih kurir kembali.",
        };
      }
      shippingCost = selectedQuote.cost;
      shipping.courier = selectedQuote.courier;
      shipping.service = selectedQuote.service;
      shipping.etd = selectedQuote.etd;
      shippingMethodType = "AUTOMATIC";
      shippingMethodName = `${selectedQuote.courier.toUpperCase()} ${selectedQuote.service}`;
    } catch (error) {
      reportError("checkout shipping verification failed", error);
      return {
        ok: false,
        error: "Ongkir tidak dapat diverifikasi. Silakan coba lagi.",
      };
    }
  } else if (requiresShipping && requestedShippingMethod === "FLAT_RATE") {
    if (!setting.flatRateEnabled || !addressComplete) {
      return { ok: false, error: "Metode atau alamat pengiriman tidak valid." };
    }
    shippingCost = setting.flatRateCost;
    shippingMethodType = "FLAT_RATE";
    shippingMethodName = setting.flatRateName;
  } else if (requiresShipping && requestedShippingMethod === "FREE") {
    if (
      !setting.freeShippingEnabled ||
      subtotal < setting.freeShippingMinimum ||
      !addressComplete
    ) {
      return { ok: false, error: "Syarat gratis ongkir belum terpenuhi." };
    }
    shippingMethodType = "FREE";
    shippingMethodName = "Free shipping";
  } else if (requiresShipping && requestedShippingMethod === "PICKUP") {
    if (!setting.pickupEnabled) {
      return { ok: false, error: "Pickup sedang tidak tersedia." };
    }
    shippingMethodType = "PICKUP";
    shippingMethodName = "Store pickup";
    Object.keys(shipping).forEach((key) => {
      shipping[key as keyof typeof shipping] = null;
    });
  } else if (requiresShipping) {
    return { ok: false, error: "Pilih metode pengiriman yang tersedia." };
  }

  // Coupon — validated again at checkout time.
  let couponId: string | null = null;
  let discount = 0;
  if (cart.couponCode && setting.checkoutCouponEnabled) {
    const result = await evaluateCoupon(workspaceId, cart.couponCode, subtotal, {
      customerEmail: parsed.data.email,
      lines: lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      })),
    });
    if (!result.ok) {
      return { ok: false, error: `Coupon: ${result.reason}` };
    }
    couponId = result.coupon.id;
    discount = result.discount;
    if (result.freeShipping && requiresShipping && shippingMethodType !== "PICKUP") {
      shippingCost = 0;
      shippingMethodType = "FREE";
      shippingMethodName = `Coupon ${result.coupon.code}`;
    }
  }
  // COD is decided after shipping, because whether a courier is carrying
  // anything is exactly what makes it possible.
  let codFee = 0;
  if (paymentMode === "cod") {
    const eligibility = codEligibility(setting, {
      orderValue: Math.max(subtotal - discount, 0) + shippingCost,
      requiresShipping,
      shippingMethodType,
    });
    if (!eligibility.ok) return { ok: false, error: eligibility.reason };
    codFee = eligibility.fee;
  }

  const taxableAmount = Math.max(subtotal - discount, 0);
  const taxAmount = setting.taxEnabled
    ? setting.pricesIncludeTax
      ? Math.round((taxableAmount * setting.taxRateBps) / (10_000 + setting.taxRateBps))
      : Math.round((taxableAmount * setting.taxRateBps) / 10_000)
    : 0;
  const total =
    taxableAmount +
    shippingCost +
    codFee +
    (setting.pricesIncludeTax ? 0 : taxAmount);
  // Buying a bundle reserves what is inside it, merged with anything bought
  // loose so the two cannot race each other for the same shirt.
  const stockReservationLines = expandBundleLines(
    lines
      .filter((line) => {
        const type = byId.get(line.productId)?.type;
        return type === "PHYSICAL" || type === "BUNDLE";
      })
      .map((line) => ({
        productId: line.productId,
        variantId: line.variantId,
        name: line.nameSnapshot,
        quantity: line.quantity,
      })),
    bundles
  );
  const shouldReserveStock =
    setting.stockDecrementTiming === "CHECKOUT" &&
    stockReservationLines.length > 0;

  // Capture affiliate attribution now; the commission is created on payment.
  const attribution = await getActiveAffiliateFor(workspaceId);

  const customer = member
    ? await prisma.customer.findUniqueOrThrow({
        where: { id: member.customerId },
      })
    : setting.checkoutAutoCreateAccount
      ? await prisma.customer.upsert({
        where: {
          workspaceId_email: {
            workspaceId,
            email: parsed.data.email.toLowerCase(),
          },
        },
        update: {},
        create: {
          workspaceId,
          email: parsed.data.email.toLowerCase(),
          name: parsed.data.name.trim(),
          phone: parsed.data.phone ?? null,
        },
        })
      : null;

  const checkoutAdContext = requestAdContext(publicSiteHref(workspace.slug, "checkout"));
  let paymentId = "";
  let createdOrderId = "";
  let createdOrderNumber = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const orderNumber = generateOrderNumber(setting.orderNumberPrefix || "ORD");
    const midtransOrderId = generateMidtransOrderId("BD");
    try {
      const order = await prisma.$transaction(async (tx) => {
        const stockReservedAt = shouldReserveStock ? new Date() : null;
        const created = await tx.order.create({
          data: {
            workspaceId,
            checkoutRequestId,
            customerId: customer?.id ?? null,
            customerNameSnapshot: parsed.data.name.trim(),
            customerEmailSnapshot: parsed.data.email.toLowerCase(),
            customerPhoneSnapshot: parsed.data.phone ?? null,
            couponId,
            orderNumber,
            invoiceNumber: `${setting.invoicePrefix}-${orderNumber.split("-").slice(1).join("-")}`,
            status: "PENDING",
            subtotal,
            discount,
            shippingCost,
            codFee,
            taxAmount,
            total,
            shippingProvinceId: shipping.provinceId,
            shippingProvinceName: shipping.provinceName,
            shippingCityId: shipping.cityId,
            shippingCityName: shipping.cityName,
            shippingPostalCode: shipping.postalCode,
            shippingAddress: shipping.address,
            shippingRecipientName: shipping.recipientName,
            shippingRecipientPhone: shipping.recipientPhone,
            shippingCourier: shipping.courier,
            shippingService: shipping.service,
            shippingEtd: shipping.etd,
            shippingMethodType,
            shippingMethodName,
            fulfillmentStatus:
              stockReservationLines.length > 0 ? "UNFULFILLED" : "NOT_REQUIRED",
            note: setting.checkoutSellerNoteEnabled
              ? parsed.data.note?.trim() || null
              : null,
            referralAffiliateId: attribution?.affiliateId ?? null,
            stockReservedAt,
            items: {
              create: lines.map((l) => ({
                productId: l.productId,
                variantId: l.variantId,
                nameSnapshot: l.nameSnapshot,
                skuSnapshot: l.skuSnapshot,
                variantSnapshot: l.variantSnapshot ?? undefined,
                unitPrice: l.unitPrice,
                quantity: l.quantity,
              })),
            },
            payment: {
              create: {
                workspaceId,
                kind: "ORDER",
                status: "PENDING",
                provider:
                  paymentMode === "cod"
                    ? COD_PROVIDER
                    : paymentMode === "manual" && manualMethod
                      ? `manual:${manualMethod.name}`
                      : "midtrans",
                amount: total,
                midtransOrderId,
                description: `Order ${orderNumber}`,
                rawNotification:
                  paymentMode === "manual" && manualMethod
                    ? {
                        manualPayment: {
                          methodId: manualMethod.id,
                          type: manualMethod.type,
                          name: manualMethod.name,
                          accountName: manualMethod.accountName,
                          accountNumber: manualMethod.accountNumber,
                          qrImageUrl: manualMethod.qrImageUrl,
                          instructions: manualMethod.instructions,
                        },
                      }
                    : undefined,
                // Nothing to time out: the courier collects on arrival, and an
                // expiry sweep would cancel a perfectly good order in transit.
                expiresAt: paymentMode === "cod" ? null : getPaymentExpiry(setting),
                adContext: toStoredAdContext(checkoutAdContext),
              },
            },
          },
          include: { payment: true },
        });
        if (shouldReserveStock) {
          await reserveStockForOrder(tx, stockReservationLines, {
            orderId: created.id,
            reason: `Reserved for order ${created.orderNumber}`,
          });
        }
        // Saving the address is a side effect of checking out: nobody fills in
        // an address book on purpose, and this is the one moment the data is
        // known to be good.
        if (customer && shippingMethodType && shippingMethodType !== "PICKUP") {
          await rememberCustomerAddress(tx, {
            workspaceId,
            customerId: customer.id,
            ...shipping,
          });
        }
        await queueOrderNotifications(tx, created.id, "ORDER_CREATED");
        return created;
      });
      paymentId = order.payment!.id;
      createdOrderId = order.id;
      createdOrderNumber = order.orderNumber;
      break;
    } catch (error) {
      if (error instanceof StockReservationError) {
        return { ok: false, error: error.message };
      }
      const code = (error as { code?: string }).code;
      if (code === "P2002") {
        const duplicate = await prisma.order.findUnique({
          where: { checkoutRequestId },
          include: { payment: true },
        });
        if (duplicate?.workspaceId === workspaceId && duplicate.payment) {
          paymentId = duplicate.payment.id;
          createdOrderId = duplicate.id;
          createdOrderNumber = duplicate.orderNumber;
          break;
        }
        if (attempt < 4) continue;
      }
      reportError("checkout order creation failed", error);
      return { ok: false, error: "Could not place the order. Please retry." };
    }
  }

  // Recorded here, in the request that still has the visitor's cookies. The
  // purchase event later copies this row's attribution, because a payment
  // webhook has no browser to read them from.
  await recordConversionEvent({
    workspaceId,
    type: "BEGIN_CHECKOUT",
    orderId: createdOrderId,
    value: total,
  });

  cookies().delete(CART_COOKIE);
  // The stored copy has to go too, or signing in on another device would put
  // an already-purchased cart back.
  await clearStoredCart({
    workspaceId,
    customerId: customer?.id ?? null,
    visitorId: cookies().get(VISITOR_COOKIE)?.value ?? null,
  });
  const metaEvent =
    createdOrderNumber.length > 0
      ? {
          eventName: "AddPaymentInfo" as const,
          eventId: `add_payment_info:order:${createdOrderNumber}`,
          customData: {
            ...buildCheckoutMetaData(lines, total),
            order_id: createdOrderNumber,
            status: paymentMode === "cod" ? "cod" : paymentMode,
          },
        }
      : undefined;
  if (metaEvent) {
    sendWorkspaceAdEvent(workspaceId, {
      ...metaEvent,
      ...checkoutAdContext,
      customerData: {
        email: customer?.email ?? parsed.data.email,
        phone: customer?.phone ?? parsed.data.phone,
        ...splitName(customer?.name ?? parsed.data.name),
        externalId: customer?.id,
      },
    }).catch((error) => {
      console.warn("Ad event AddPaymentInfo failed", error);
    });
  }
  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard/inbox");
  return {
    ok: true,
    data: {
      paymentId,
      orderNumber: createdOrderNumber,
      paymentMode:
        paymentMode === "cod"
          ? "cod"
          : paymentMode === "manual" && manualMethod
            ? "manual"
            : "midtrans",
      paymentAccessToken: issuePublicAccessToken("payment", paymentId),
      orderAccessToken: issuePublicAccessToken("order", createdOrderId),
      metaEvent,
    },
  };
}

function checkoutOrderResult(order: {
  id: string;
  orderNumber: string;
  payment: { id: string; provider: string } | null;
}): ActionResult<{
  paymentId: string;
  orderNumber: string;
  paymentMode: string;
  paymentAccessToken: string;
  orderAccessToken: string;
}> {
  if (!order.payment) return { ok: false, error: "Payment tidak ditemukan." };
  return {
    ok: true,
    data: {
      paymentId: order.payment.id,
      orderNumber: order.orderNumber,
      paymentMode: isCodPayment(order.payment.provider)
        ? "cod"
        : order.payment.provider.startsWith("manual:")
          ? "manual"
          : "midtrans",
      paymentAccessToken: issuePublicAccessToken("payment", order.payment.id),
      orderAccessToken: issuePublicAccessToken("order", order.id),
    },
  };
}

export async function updateOrderStatusAction(
  orderId: string,
  status: OrderStatus
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) {
    return { ok: false, error: "Not allowed." };
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      workspaceId: true,
      payment: { select: { id: true, status: true } },
    },
  });
  if (!order || order.workspaceId !== current.workspace.id) {
    return { ok: false, error: "Order not found." };
  }

  const paymentStatus = paymentStatusFromOrderStatus(status);
  if (paymentStatus && order.payment) {
    const result = await applyPaymentStatus(order.payment.id, paymentStatus);
    if (!result.changed && status !== "PAID" && status !== "COMPLETED") {
      await prisma.order.update({ where: { id: orderId }, data: { status } });
    }
    if (status === "COMPLETED") {
      await prisma.order.update({
        where: { id: orderId },
        data: { status: "COMPLETED" },
      });
    }
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { status } });
    });
  }

  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${orderId}`);
  revalidatePath("/dashboard/abandoned");
  revalidatePath("/dashboard/follow-up");
  revalidatePath("/dashboard/membership");
  revalidatePath("/dashboard/membership/members");
  return { ok: true };
}

export async function reviewManualPaymentProofAction(
  paymentId: string,
  status: Extract<ManualPaymentProofStatus, "VERIFIED" | "REJECTED">
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) {
    return { ok: false, error: "Not allowed." };
  }
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      workspaceId: true,
      status: true,
      provider: true,
      manualProofUrl: true,
      manualProofStatus: true,
      orderId: true,
    },
  });
  if (!payment || payment.workspaceId !== current.workspace.id || !payment.orderId) {
    return { ok: false, error: "Payment not found." };
  }
  if (!payment.provider.startsWith("manual:") || !payment.manualProofUrl) {
    return { ok: false, error: "Bukti transfer belum tersedia." };
  }
  if (payment.manualProofStatus !== "PENDING") {
    return { ok: false, error: "Bukti transfer sudah ditinjau." };
  }
  if (status === "VERIFIED") {
    if (payment.status !== "PENDING") {
      return { ok: false, error: "Status pembayaran sudah final." };
    }
    await applyPaymentStatus(payment.id, "PAID", {
      transactionStatus: "manual_verified",
      paymentType: "manual_transfer",
    });
  }
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      manualProofStatus: status,
      manualProofReviewedAt: new Date(),
      manualProofReviewedById: session.user.id,
    },
  });
  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${payment.orderId}`);
  return { ok: true };
}

export async function bulkUpdateOrdersAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) return;
  const ids = formData.getAll("orderIds").map(String).filter(Boolean).slice(0, 100);
  const status = String(formData.get("bulkStatus") ?? "") as OrderStatus;
  const allowed: OrderStatus[] = ["PENDING", "PROCESSING", "COMPLETED", "CANCELLED"];
  if (ids.length === 0 || !allowed.includes(status)) return;
  if (status === "CANCELLED") {
    const orders = await prisma.order.findMany({
      where: { id: { in: ids }, workspaceId: current.workspace.id },
      select: { id: true },
    });
    for (const order of orders) await updateOrderStatusAction(order.id, status);
  } else {
    await prisma.order.updateMany({
      where: {
        id: { in: ids },
        workspaceId: current.workspace.id,
        ...(status === "PROCESSING"
          ? { status: { in: ["PAID", "PROCESSING"] } }
          : status === "COMPLETED"
            ? { status: { in: ["PAID", "PROCESSING", "COMPLETED"] } }
            : {}),
      },
      data: { status },
    });
  }
  revalidatePath("/dashboard/orders");
}

export async function updateOrderFulfillmentAction(
  orderId: string,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) {
    return { ok: false, error: "Not allowed." };
  }

  const status = String(formData.get("fulfillmentStatus") ?? "");
  const validStatuses: FulfillmentStatus[] = [
    "NOT_REQUIRED",
    "UNFULFILLED",
    "PACKED",
    "SHIPPED",
    "DELIVERED",
    "CANCELLED",
  ];
  if (!validStatuses.includes(status as FulfillmentStatus)) {
    return { ok: false, error: "Invalid fulfillment status." };
  }

  const result = await updateOrderFulfillment(orderId, {
    workspaceId: current.workspace.id,
    actorId: session.user.id,
    status: status as FulfillmentStatus,
    trackingCarrier: formData.get("trackingCarrier")?.toString() ?? null,
    trackingNumber: formData.get("trackingNumber")?.toString() ?? null,
    trackingUrl: formData.get("trackingUrl")?.toString() ?? null,
    note: formData.get("note")?.toString() ?? null,
  });

  if (!result.ok) return result;

  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${orderId}`);
  return { ok: true };
}

export async function createOrderRefundAction(
  orderId: string,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) {
    return { ok: false, error: "Not allowed." };
  }

  const items = parseRefundItems(formData.get("items"));
  if (!items.ok) return items;

  const requestedStatus = String(
    formData.get("status") ?? "REQUESTED"
  ) as RefundStatus;
  const processProvider =
    requestedStatus === "REFUNDED" && formData.get("processProvider") === "true";
  const amount = Number(formData.get("amount") ?? 0);
  const result = await createOrderRefund(orderId, {
    workspaceId: current.workspace.id,
    actorId: session.user.id,
    type: String(formData.get("type") ?? "REFUND") as RefundType,
    status: processProvider ? "APPROVED" : requestedStatus,
    amount,
    reason: formData.get("reason")?.toString() ?? null,
    note: formData.get("note")?.toString() ?? null,
    provider: processProvider ? "midtrans" : null,
    providerReference: formData.get("providerReference")?.toString() ?? null,
    returnToStock: formData.get("returnToStock") === "true",
    items: items.data ?? [],
    notify: !processProvider,
  });

  if (!result.ok) return result;

  if (processProvider) {
    const processed = await processOrderRefundProvider(result.refundId, {
      workspaceId: current.workspace.id,
      actorId: session.user.id,
    });
    if (!processed.ok) return processed;
  }

  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${orderId}`);
  revalidatePath("/dashboard/products");
  revalidateCatalog(current.workspace.id);
  return { ok: true };
}

export async function updateOrderRefundStatusAction(
  refundId: string,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) {
    return { ok: false, error: "Not allowed." };
  }

  const status = String(formData.get("status") ?? "") as RefundStatus;
  const result =
    status === "REFUNDED" && formData.get("processProvider") === "true"
      ? await processOrderRefundProvider(refundId, {
          workspaceId: current.workspace.id,
          actorId: session.user.id,
        })
      : await updateOrderRefundStatus(refundId, {
          workspaceId: current.workspace.id,
          actorId: session.user.id,
          status,
          note: formData.get("note")?.toString() ?? undefined,
          providerReference:
            formData.get("providerReference")?.toString() ?? undefined,
        });

  if (!result.ok) return result;

  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${result.orderId}`);
  revalidatePath("/dashboard/products");
  revalidateCatalog(current.workspace.id);
  return { ok: true };
}

export async function cancelOrderProviderPaymentAction(
  orderId: string
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) {
    return { ok: false, error: "Not allowed." };
  }

  const result = await cancelMidtransOrderPayment(orderId, {
    workspaceId: current.workspace.id,
    actorId: session.user.id,
  });

  if (!result.ok) return result;

  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${orderId}`);
  revalidatePath("/dashboard/abandoned");
  revalidatePath("/dashboard/follow-up");
  revalidatePath("/dashboard/products");
  revalidateCatalog(current.workspace.id);
  return { ok: true };
}

export async function requestOrderReturnAction(
  workspaceSlug: string,
  orderNumber: string,
  accessToken: string | undefined,
  formData: FormData
): Promise<ActionResult> {
  const items = parseRefundItems(formData.get("items"));
  if (!items.ok) return items;

  const evidence = parseRefundEvidence(formData.get("evidence"));
  if (!evidence.ok) return evidence;

  const result = await submitPublicReturnRequest({
    workspaceSlug,
    orderNumber,
    accessToken,
    amount: Number(formData.get("amount") ?? 0),
    reason: formData.get("reason")?.toString() ?? null,
    note: formData.get("note")?.toString() ?? null,
    items: items.data ?? [],
    evidence: evidence.data ?? [],
  });
  if (!result.ok) return result;

  revalidatePath(`/site/${workspaceSlug}/checkout/success`);
  revalidatePath(`/site/${workspaceSlug}/checkout/return`);
  return { ok: true };
}

function paymentStatusFromOrderStatus(
  status: OrderStatus
): PaymentStatus | null {
  if (status === "PAID" || status === "COMPLETED") return "PAID";
  if (status === "CANCELLED" || status === "FAILED" || status === "EXPIRED") {
    return status;
  }
  return null;
}

function parseRefundItems(
  raw: FormDataEntryValue | null
): ActionResult<OrderRefundItemInput[]> {
  if (!raw) return { ok: true, data: [] };
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    if (!Array.isArray(parsed)) return { ok: true, data: [] };
    const items: OrderRefundItemInput[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const parsedItem = {
        orderItemId:
          typeof record.orderItemId === "string" ? record.orderItemId : "",
        quantity: Number(record.quantity ?? 0),
        restockQuantity: Number(record.restockQuantity ?? 0),
      };
      if (
        parsedItem.orderItemId &&
        (parsedItem.quantity > 0 || parsedItem.restockQuantity > 0)
      ) {
        items.push(parsedItem);
      }
    }
    return { ok: true, data: items };
  } catch {
    return { ok: false, error: "Invalid refund item data." };
  }
}

/**
 * Evidence the browser uploaded ahead of submit, echoed back as JSON. Shape
 * only — `submitPublicReturnRequest` is what decides whether the URLs are
 * really ours.
 */
function parseRefundEvidence(
  raw: FormDataEntryValue | null
): ActionResult<OrderRefundEvidenceInput[]> {
  if (!raw) return { ok: true, data: [] };
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    if (!Array.isArray(parsed)) return { ok: true, data: [] };
    const files: OrderRefundEvidenceInput[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      if (typeof record.url !== "string" || typeof record.mimeType !== "string") {
        continue;
      }
      files.push({
        url: record.url,
        name: typeof record.name === "string" ? record.name : "bukti",
        mimeType: record.mimeType,
        size: Number(record.size ?? 0),
      });
    }
    return { ok: true, data: files };
  } catch {
    return { ok: false, error: "Data bukti tidak valid." };
  }
}

function buildCheckoutMetaData(
  lines: {
    productId: string;
    variantId: string | null;
    nameSnapshot: string;
    unitPrice: number;
    quantity: number;
  }[],
  total: number
): MetaCustomData {
  return {
    content_type: "product",
    content_ids: lines.map((line) => catalogItemId(line.productId, line.variantId)),
    contents: lines.map((line) => ({
      id: catalogItemId(line.productId, line.variantId),
      quantity: line.quantity,
      item_price: line.unitPrice,
    })),
    currency: DEFAULT_AD_CURRENCY,
    value: total,
    num_items: lines.reduce((sum, line) => sum + line.quantity, 0),
  };
}


export type TrackingImportSummary = {
  updated: number;
  /** Rows the seller has to look at: unmatched orders and unusable lines. */
  problems: { reference: string; reason: string }[];
};

/**
 * Applies a pasted list of tracking numbers to many orders at once.
 *
 * Fifty parcels a day meant opening fifty orders. Anything that cannot be
 * applied is reported back by order number rather than skipped, because a
 * parcel whose resi never landed becomes a support ticket a week later.
 */
export async function importOrderTrackingAction(
  formData: FormData
): Promise<ActionResult<TrackingImportSummary>> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) {
    return { ok: false, error: "Not allowed." };
  }

  const parsed = parseTrackingImport(String(formData.get("rows") ?? ""));
  if (parsed.rows.length === 0 && parsed.problems.length === 0) {
    return { ok: false, error: "Tempel dulu daftar nomor order dan resinya." };
  }

  const problems: TrackingImportSummary["problems"] = parsed.problems.map(
    (problem) => ({
      reference: `Baris ${problem.line}`,
      reason: problem.reason,
    })
  );

  const orders = await prisma.order.findMany({
    where: {
      workspaceId: current.workspace.id,
      orderNumber: { in: parsed.rows.map((row) => row.orderNumber) },
    },
    select: { id: true, orderNumber: true },
  });
  const byNumber = new Map(
    orders.map((order) => [order.orderNumber.toUpperCase(), order.id])
  );

  let updated = 0;
  for (const row of parsed.rows) {
    const orderId = byNumber.get(row.orderNumber.toUpperCase());
    if (!orderId) {
      problems.push({
        reference: row.orderNumber,
        reason: "Nomor order tidak ditemukan di toko ini.",
      });
      continue;
    }

    const result = await updateOrderFulfillment(orderId, {
      workspaceId: current.workspace.id,
      actorId: session.user.id,
      status: "SHIPPED",
      trackingNumber: row.trackingNumber,
      trackingCarrier: row.carrier,
    });
    if (result.ok) updated += 1;
    else problems.push({ reference: row.orderNumber, reason: result.error });
  }

  revalidatePath("/dashboard/orders");
  return { ok: true, data: { updated, problems } };
}
