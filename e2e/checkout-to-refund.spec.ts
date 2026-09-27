import { expect, test, type Page } from "@playwright/test";

import {
  createScenario,
  loadOrder,
  productStock,
  submitManualProof,
  type Scenario,
} from "./fixtures/scenario";

/**
 * The money path, end to end: a customer buys a physical product, the seller
 * confirms the transfer, the customer asks for a return, and the seller
 * refunds it. Stock and affiliate commission must come back out the far side.
 *
 * Nothing here touches Midtrans — the store is seeded with manual transfer
 * as its only payment method.
 */

let scenario: Scenario;

test.beforeEach(async () => {
  scenario = await createScenario({ stock: 10, price: 250_000 });
});

test.afterEach(async () => {
  await scenario?.destroy();
});

test("checkout to refund restores stock and reverses commission", async ({
  page,
}) => {
  // --- Attribution: the customer arrives through an affiliate link. -------
  await page.goto(`/r/${scenario.affiliate!.referralCode}`);

  // --- Checkout ----------------------------------------------------------
  await page.goto(`/site/${scenario.workspace.slug}/products/${scenario.product.slug}`);
  await page.getByRole("button", { name: /add to cart/i }).click();
  // The cart cookie is written by a server action; the drawer only opens
  // once that round-trip lands, so it is the signal that the cart is real.
  await expect(
    page.getByRole("dialog", { name: /keranjang belanja/i })
  ).toBeVisible();
  await expect(page.getByText(/keranjang kosong/i)).toHaveCount(0);

  await page.goto(`/site/${scenario.workspace.slug}/checkout`);
  await page.locator("#name").fill("Pembeli E2E");
  await page.locator("#email").fill("pembeli-e2e@buildery.test");
  await page.getByRole("button", { name: /ambil di lokasi/i }).click();
  await page.getByRole("button", { name: /transfer manual/i }).click();
  await page.getByText(scenario.manualMethod.name).click();
  await page.getByRole("button", { name: /buat pesanan/i }).click();

  await page.waitForURL(/checkout\/success/, { timeout: 60_000 });

  const placed = await loadOrder(scenario.workspace.id);
  expect(placed).not.toBeNull();
  expect(placed!.status).toBe("PENDING");
  expect(placed!.payment?.provider).toContain("manual:");
  expect(placed!.total).toBe(scenario.product.price);
  // Stock is reserved the moment the order exists.
  expect(await productStock(scenario.product.id)).toBe(9);

  const orderNumber = placed!.orderNumber;
  const accessToken = new URL(page.url()).searchParams.get("access")!;
  expect(accessToken).toBeTruthy();

  // --- Seller confirms the transfer --------------------------------------
  await submitManualProof(placed!.payment!.id);
  await signIn(page, scenario.owner.email, scenario.owner.password);
  await page.goto(`/dashboard/orders/${placed!.id}`);
  await page.getByRole("button", { name: /^terima$/i }).first().click();

  await expect
    .poll(async () => (await loadOrder(scenario.workspace.id))!.status, {
      timeout: 30_000,
    })
    .toBe("PAID");

  const paid = await loadOrder(scenario.workspace.id);
  // A paid, attributed sale earns the affiliate their cut.
  expect(paid!.commissions).toHaveLength(1);
  expect(paid!.commissions[0].amount).toBe(
    Math.round((scenario.product.price * scenario.affiliate!.percent) / 100)
  );

  // --- Customer files a return -------------------------------------------
  await page.context().clearCookies({ name: "next-auth.session-token" });
  await page.goto(
    `/site/${scenario.workspace.slug}/checkout/return?order=${encodeURIComponent(
      orderNumber
    )}&access=${encodeURIComponent(accessToken)}`
  );
  await page.getByLabel(/^refund$/i).first().fill("1");
  await page.getByLabel(/alasan/i).fill("Ukuran tidak sesuai.");
  await page.getByRole("button", { name: /kirim request/i }).click();
  // The action revalidates the route, which remounts the form; the toast is
  // the confirmation that survives, and the page then reports the order as
  // fully covered rather than offering the form again.
  await expect(page.getByText(/request terkirim/i)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /kirim request/i })
  ).toHaveCount(0);

  const requested = await loadOrder(scenario.workspace.id);
  expect(requested!.refunds).toHaveLength(1);
  expect(requested!.refunds[0].status).toBe("REQUESTED");
  expect(requested!.refunds[0].type).toBe("RETURN");
  expect(requested!.refunds[0].returnToStock).toBe(true);
  // Still reserved — nothing comes back until the seller approves.
  expect(await productStock(scenario.product.id)).toBe(9);

  // --- Seller refunds it --------------------------------------------------
  await signIn(page, scenario.owner.email, scenario.owner.password);
  await page.goto(`/dashboard/orders/${placed!.id}`);
  const refundRow = page.locator(
    `[data-refund-id="${requested!.refunds[0].id}"]`
  );
  await refundRow.getByRole("combobox").click();
  await page.getByRole("option", { name: /^refunded$/i }).click();

  await expect
    .poll(
      async () => (await loadOrder(scenario.workspace.id))!.refunds[0].status,
      { timeout: 30_000 }
    )
    .toBe("REFUNDED");

  // --- The far side -------------------------------------------------------
  expect(await productStock(scenario.product.id)).toBe(10);

  const refunded = await loadOrder(scenario.workspace.id);
  expect(refunded!.refunds[0].restockedAt).not.toBeNull();
  expect(refunded!.refunds[0].amount).toBe(scenario.product.price);

  // Net revenue: the order still says what it charged, and the refund row is
  // what nets it back out.
  expect(refunded!.total).toBe(scenario.product.price);
  const netRevenue =
    refunded!.total -
    refunded!.refunds
      .filter((refund) => refund.status === "REFUNDED")
      .reduce((sum, refund) => sum + refund.amount, 0);
  expect(netRevenue).toBe(0);

  // And the affiliate's cut is withdrawn rather than left standing.
  const adjustments = await commissionAdjustments(refunded!.refunds[0].id);
  expect(adjustments.length).toBeGreaterThan(0);
});

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /masuk|login|sign in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}

async function commissionAdjustments(refundId: string) {
  const { prisma } = await import("./fixtures/scenario");
  return prisma.commissionAdjustment.findMany({ where: { refundId } });
}
