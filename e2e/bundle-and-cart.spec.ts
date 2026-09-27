import { expect, test } from "@playwright/test";

import { createScenario, loadOrder, prisma, type Scenario } from "./fixtures/scenario";

/**
 * Two things the database alone cannot prove: that buying a bundle draws down
 * the products inside it, and that a cart follows a shopper from one browser
 * to the next.
 */

let scenario: Scenario;
let bundleId = "";
let bundleSlug = "";

test.beforeAll(async () => {
  scenario = await createScenario({ withAffiliate: false, price: 150_000, stock: 6 });
  await prisma.ecommerceSetting.update({
    where: { workspaceId: scenario.workspace.id },
    data: { pickupEnabled: true, stockDecrementTiming: "CHECKOUT" },
  });

  const bundle = await prisma.product.create({
    data: {
      workspaceId: scenario.workspace.id,
      name: "Paket Hemat",
      slug: "paket-hemat",
      type: "BUNDLE",
      status: "ACTIVE",
      price: 250_000,
      // Deliberately wrong: a bundle's own number must never be believed.
      stock: 999,
    },
  });
  bundleId = bundle.id;
  bundleSlug = bundle.slug;

  await prisma.productBundleItem.create({
    data: {
      workspaceId: scenario.workspace.id,
      bundleId: bundle.id,
      productId: scenario.product.id,
      quantity: 2,
    },
  });
});

test.afterAll(async () => {
  await scenario?.destroy();
});

async function addToCart(page: import("@playwright/test").Page, slug: string) {
  await page.goto(`/site/${scenario.workspace.slug}/products/${slug}`);
  await page.getByRole("button", { name: /add to cart/i }).click();
  await expect
    .poll(
      async () =>
        (await page.context().cookies()).some((cookie) => cookie.name === "bd_cart"),
      { timeout: 15_000 }
    )
    .toBe(true);
}

test("a bundle sells only as far as its contents allow", async ({ page }) => {
  await page.goto(`/site/${scenario.workspace.slug}/products/${bundleSlug}`);
  // Six shirts, two per bundle: three bundles, not the 999 on its own row.
  await expect(page.getByRole("button", { name: /add to cart/i })).toBeEnabled();

  await prisma.product.update({
    where: { id: scenario.product.id },
    data: { stock: 1 },
  });
  await page.goto(`/site/${scenario.workspace.slug}/products/${bundleSlug}`);
  // One shirt cannot make a two-shirt bundle.
  await expect(page.getByText(/stok habis|sold out/i).first()).toBeVisible();

  await prisma.product.update({
    where: { id: scenario.product.id },
    data: { stock: 6 },
  });
});

test("buying a bundle reserves the products inside it", async ({ page }) => {
  await addToCart(page, bundleSlug);

  await page.goto(`/site/${scenario.workspace.slug}/checkout`);
  await page.locator("#name").fill("Budi Santoso");
  await page.locator("#email").fill("budi@contoh.test");
  await page.getByRole("button", { name: /ambil di lokasi/i }).click();
  await page.getByRole("button", { name: /transfer manual/i }).click();
  await page.getByText(scenario.manualMethod.name).click();
  await page.getByRole("button", { name: /buat pesanan/i }).click();
  await expect.poll(() => page.url(), { timeout: 60_000 }).toMatch(/checkout\/success/);

  const order = await loadOrder(scenario.workspace.id);
  expect(order).not.toBeNull();

  // Two shirts left the shelf; the bundle's own row is untouched.
  const shirt = await prisma.product.findUniqueOrThrow({
    where: { id: scenario.product.id },
    select: { stock: true },
  });
  expect(shirt.stock).toBe(4);
  const bundle = await prisma.product.findUniqueOrThrow({
    where: { id: bundleId },
    select: { stock: true },
  });
  expect(bundle.stock).toBe(999);
});

test("a signed-in shopper finds their cart again in a new browser", async ({
  browser,
}) => {
  const email = `cart-${Date.now()}@contoh.test`;
  const password = "Password123!";

  const first = await browser.newContext();
  const firstPage = await first.newPage();
  await firstPage.goto(`/site/${scenario.workspace.slug}/member/register`);
  await firstPage.waitForLoadState("networkidle");
  await firstPage.locator("#member-name").fill("Citra Dewi");
  await firstPage.locator("#member-email").fill(email);
  await firstPage.locator("#member-password").fill(password);
  await firstPage.locator("#member-confirm-password").fill(password);
  await firstPage.getByRole("button", { name: /create account/i }).click();
  await expect.poll(() => firstPage.url(), { timeout: 60_000 }).not.toMatch(/register/);

  await firstPage.goto(
    `/site/${scenario.workspace.slug}/products/${scenario.product.slug}`
  );
  await firstPage.getByRole("button", { name: /add to cart/i }).click();
  // Scoped to this shopper: a leftover anonymous cart from another test would
  // otherwise make this pass without the member's cart ever being written.
  await expect
    .poll(
      async () =>
        prisma.cartItem.count({
          where: { cart: { workspaceId: scenario.workspace.id, customer: { email } } },
        }),
      { timeout: 20_000 }
    )
    .toBeGreaterThan(0);
  await first.close();

  // A different browser: no cookie, only the account.
  const second = await browser.newContext();
  const secondPage = await second.newPage();
  await secondPage.goto(`/site/${scenario.workspace.slug}/member/login`);
  await secondPage.waitForLoadState("networkidle");
  await secondPage.locator("#member-email").fill(email);
  await secondPage.locator("#member-password").fill(password);
  await secondPage.getByRole("button", { name: /^log in$/i }).click();
  await expect.poll(() => secondPage.url(), { timeout: 60_000 }).not.toMatch(/login/);

  await secondPage.goto(`/site/${scenario.workspace.slug}/cart`);
  await secondPage.waitForLoadState("networkidle");

  const product = await prisma.product.findUniqueOrThrow({
    where: { id: scenario.product.id },
    select: { name: true },
  });
  // The cart came from the account, not from a cookie this browser never had.
  await expect(
    secondPage.getByText(product.name, { exact: false }).first()
  ).toBeVisible({ timeout: 20_000 });
  await second.close();
});
