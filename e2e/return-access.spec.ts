import { expect, test } from "@playwright/test";

import { createScenario, prisma, type Scenario } from "./fixtures/scenario";
import { issueTestAccessToken } from "./fixtures/access-token";

/**
 * The public return page is reachable without a login, so its signed `access`
 * token is the entire authorisation. These cover the cases where that token
 * must not open the door.
 *
 * They assert on the rendered not-found page rather than a 404 status: the
 * dev server answers `notFound()` with a 200 carrying the not-found UI, and
 * the suite has to pass against `pnpm dev` as well as a production build.
 */

async function expectNotFound(page: import("@playwright/test").Page) {
  await expect(
    page.getByRole("heading", { name: /page not found/i })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /kirim request/i })
  ).toHaveCount(0);
}

let scenario: Scenario;

test.beforeEach(async () => {
  scenario = await createScenario({ withAffiliate: false });
});

test.afterEach(async () => {
  await scenario?.destroy();
});

test("a return link without a token is not found", async ({ page }) => {
  const order = await seedPaidOrder(scenario.workspace.id, scenario.product.id);

  await page.goto(
    `/site/${scenario.workspace.slug}/checkout/return?order=${order.orderNumber}`
  );

  await expectNotFound(page);
});

test("a forged token is not found", async ({ page }) => {
  const order = await seedPaidOrder(scenario.workspace.id, scenario.product.id);

  await page.goto(
    `/site/${scenario.workspace.slug}/checkout/return?order=${order.orderNumber}&access=not-a-real-token`
  );

  await expectNotFound(page);
});

test("an expired token is not found", async ({ page }) => {
  const order = await seedPaidOrder(scenario.workspace.id, scenario.product.id);
  const expired = issueTestAccessToken("order", order.id, -60);

  await page.goto(
    `/site/${scenario.workspace.slug}/checkout/return?order=${
      order.orderNumber
    }&access=${encodeURIComponent(expired)}`
  );

  await expectNotFound(page);
});

test("another order's token does not open this order", async ({ page }) => {
  const order = await seedPaidOrder(scenario.workspace.id, scenario.product.id);
  const other = await seedPaidOrder(scenario.workspace.id, scenario.product.id);
  const otherToken = issueTestAccessToken("order", other.id, 3600);

  await page.goto(
    `/site/${scenario.workspace.slug}/checkout/return?order=${
      order.orderNumber
    }&access=${encodeURIComponent(otherToken)}`
  );

  await expectNotFound(page);
});

test("a valid token opens the request form", async ({ page }) => {
  const order = await seedPaidOrder(scenario.workspace.id, scenario.product.id);
  const token = issueTestAccessToken("order", order.id, 3600);

  await page.goto(
    `/site/${scenario.workspace.slug}/checkout/return?order=${
      order.orderNumber
    }&access=${encodeURIComponent(token)}`
  );

  await expect(page.getByRole("button", { name: /kirim request/i })).toBeVisible();
});

let sequence = 0;

async function seedPaidOrder(workspaceId: string, productId: string) {
  sequence += 1;
  return prisma.order.create({
    data: {
      workspaceId,
      orderNumber: `E2E-${Date.now()}-${sequence}`,
      status: "PAID",
      customerNameSnapshot: "Pembeli E2E",
      customerEmailSnapshot: "pembeli-e2e@buildery.test",
      subtotal: 250_000,
      total: 250_000,
      items: {
        create: {
          productId,
          nameSnapshot: "Kaos E2E",
          unitPrice: 250_000,
          quantity: 1,
        },
      },
    },
  });
}
