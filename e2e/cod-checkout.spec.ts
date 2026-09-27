import { expect, test } from "@playwright/test";

import { createScenario, loadOrder, prisma, type Scenario } from "./fixtures/scenario";

/**
 * Cash on delivery. The money arrives with the courier, so the order must be
 * created without a payment deadline — an expiry sweep would otherwise cancel
 * a parcel that is already in transit.
 */

let scenario: Scenario;

test.beforeAll(async () => {
  scenario = await createScenario({ withAffiliate: false, price: 150_000 });
  await prisma.ecommerceSetting.update({
    where: { workspaceId: scenario.workspace.id },
    data: {
      pickupEnabled: true,
      flatRateEnabled: true,
      flatRateName: "Ongkir flat",
      flatRateCost: 20_000,
      codEnabled: true,
      codFee: 5_000,
      codMinimum: 50_000,
    },
  });
});

test.afterAll(async () => {
  await scenario?.destroy();
});

/**
 * The cart lives in a cookie the server action sets, and the drawer opens from
 * React state — so a visible drawer is not yet proof the cookie has landed.
 * Checking out before it does lands on an empty cart.
 */
async function addToCart(page: import("@playwright/test").Page) {
  await page.goto(`/site/${scenario.workspace.slug}/products/${scenario.product.slug}`);
  await page.getByRole("button", { name: /add to cart/i }).click();
  await expect
    .poll(
      async () =>
        (await page.context().cookies()).some((cookie) => cookie.name === "bd_cart"),
      { timeout: 15_000 }
    )
    .toBe(true);
}

test("a COD order is created with its fee and no payment deadline", async ({ page }) => {
  await addToCart(page);

  await page.goto(`/site/${scenario.workspace.slug}/checkout`);
  await page.locator("#name").fill("Budi Santoso");
  await page.locator("#email").fill("budi@contoh.test");

  // A courier has to be carrying something for COD to be offered.
  await page.getByRole("button", { name: /ongkir flat/i }).click();
  await page.locator("#recipientName").fill("Budi Santoso");
  await page.locator("#recipientPhone").fill("081234567890");
  await page.locator("#destSearch").first().fill("Bandung");
  await page.locator("#address").fill("Jl. Merdeka No. 1");
  await page.locator("#postalCode").fill("40111");
  await page.getByRole("button", { name: /bayar di tempat/i }).click();
  await expect(page.getByText(/Bayar tunai ke kurir/i)).toBeVisible();

  await page.getByRole("button", { name: /buat pesanan/i }).click();
  // Checkout finishes with a soft navigation, which fires no "load" event.
  await expect
    .poll(() => page.url(), { timeout: 60_000 })
    .toMatch(/checkout\/success/);

  const order = await loadOrder(scenario.workspace.id);
  expect(order).not.toBeNull();
  expect(order!.codFee).toBe(5_000);
  // 150.000 goods + 20.000 shipping + 5.000 COD.
  expect(order!.total).toBe(175_000);
  expect(order!.payment!.provider).toBe("cod");
  // No deadline: the expiry sweep must never cancel an order in transit.
  expect(order!.payment!.expiresAt).toBeNull();
  expect(order!.status).toBe("PENDING");
});

test("COD is refused for store pickup", async ({ page }) => {
  await addToCart(page);

  await page.goto(`/site/${scenario.workspace.slug}/checkout`);
  await page.getByRole("button", { name: /ongkir flat/i }).click();
  await page.getByRole("button", { name: /bayar di tempat/i }).click();

  // Switching to pickup takes the courier away, so the choice cannot stand.
  await page.getByRole("button", { name: /ambil di lokasi/i }).click();
  await expect(page.getByText(/Bayar tunai ke kurir/i)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /bayar di tempat/i })
  ).toBeDisabled();
});
