import { randomBytes } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import {
  createScenario,
  loadOrder,
  prisma,
  submitManualProof,
  type Scenario,
} from "./fixtures/scenario";

/**
 * Ad tracking across Meta and TikTok, from landing click to purchase.
 *
 * For each funnel step the browser pixels and the server-side queue must carry
 * the same event id (that is what lets each platform count the pair once),
 * and the server copy must keep the visitor's click ids — including the
 * purchase, which is confirmed by the seller long after the browser is gone.
 *
 * No request leaves the machine: the pixel scripts are blocked, `fbq` and
 * `ttq` are recorders, and the queue is inspected in the database instead of
 * being flushed to the platforms.
 */

const TIKTOK_PIXEL = "C4E2ETESTPIXEL00001";

let scenario: Scenario;

test.beforeEach(async () => {
  scenario = await createScenario({ withAffiliate: false });
  await prisma.integrationSetting.create({
    data: {
      workspaceId: scenario.workspace.id,
      metaPixelId: "1234567890",
      metaCapiEnabled: true,
      metaCapiAccessToken: "e2e-meta-token",
      tiktokPixelId: TIKTOK_PIXEL,
      tiktokEventsApiEnabled: true,
      tiktokAccessToken: "e2e-tiktok-token",
      googleAnalyticsId: "G-E2ETEST01",
      googleAnalyticsApiSecret: "e2e-ga4-secret",
    },
  });
});

test.afterEach(async () => {
  await scenario?.destroy();
});

test("every funnel step reaches both pixels and both server queues with one event id", async ({
  page,
  baseURL,
}) => {
  await page.route(/connect\.facebook\.net|analytics\.tiktok\.com|googletagmanager\.com/, (route) =>
    route.abort()
  );
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    const fbqCalls: unknown[][] = [];
    const gtagCalls: unknown[][] = [];
    w.__fbqCalls = fbqCalls;
    w.__gtagCalls = gtagCalls;
    w.fbq = (...args: unknown[]) => fbqCalls.push(args);
    // The GA snippet keeps an existing gtag, so this records every call.
    w.gtag = (...args: unknown[]) => gtagCalls.push(args);
    // The TikTok snippet turns this array into its command queue.
    w.ttq = [];
  });
  // A fresh browser id per run, so the per-visitor ViewContent throttle of an
  // earlier run cannot swallow this one.
  const fbp = `fb.1.1700000000000.${randomBytes(6).toString("hex")}`;
  await page.context().addCookies([
    { name: "_fbp", value: fbp, url: baseURL! },
    { name: "_ga", value: "GA1.1.987654321.1700000000", url: baseURL! },
  ]);

  // --- Landing from an ad click, on the product page -----------------------
  await page.goto(
    `/site/${scenario.workspace.slug}/products/${scenario.product.slug}?fbclid=E2EFBCLID&ttclid=E2ETTCLID`
  );

  const pageViewId = await fbqEventId(page, "PageView");
  const viewContentId = await fbqEventId(page, "ViewContent");
  expect(await ttqCall(page, "track", "ViewContent")).toMatchObject({
    options: { event_id: viewContentId },
  });
  expect(await ttqCall(page, "page")).not.toBeNull();

  const viewContent = await queuedPair("ViewContent", viewContentId);
  expect(viewContent.meta.user_data).toMatchObject({
    fbp,
    // _fbc was never written (the pixel is blocked); the middleware's copy of
    // the click is used instead.
    fbc: expect.stringMatching(/^fb\.1\.\d+\.E2EFBCLID$/),
  });
  expect(viewContent.meta.user_data.external_id).toMatch(/^[a-f0-9]{64}$/);
  expect(viewContent.tiktok.user).toMatchObject({ ttclid: "E2ETTCLID" });
  expect(viewContent.tiktok.event).toBe("ViewContent");

  const pageViewRows = await rowsFor("PageView", pageViewId);
  expect(pageViewRows.map((row) => row.provider)).toEqual(["META"]);

  // The store's own analytics records storefront pages too. They used to be
  // invisible: only builder pages had a tracker, so products, cart, checkout
  // and courses never appeared in any traffic report.
  const productPath = `/site/${scenario.workspace.slug}/products/${scenario.product.slug}`;
  await expect
    .poll(
      async () =>
        prisma.analyticsEvent.findFirst({
          where: { workspaceId: scenario.workspace.id, type: "PAGE_VIEW" },
          select: { path: true, visitorId: true, pageId: true },
        }),
      { timeout: 20_000, message: "first-party page view for the product page" }
    )
    .toMatchObject({
      path: expect.stringContaining(productPath),
      // Carries the visitor cookie, so it joins the funnel and campaign reports.
      visitorId: expect.any(String),
      // Storefront pages have no Page row.
      pageId: null,
    });

  // GA4 e-commerce from the browser, with the catalog id.
  expect(await gtagEvent(page, "view_item")).toMatchObject({
    items: [{ item_id: scenario.product.id }],
  });

  // --- A storefront search -------------------------------------------------
  await page.goto(`/site/${scenario.workspace.slug}/products?q=Kaos`);
  const searchId = await fbqEventId(page, "Search");
  const search = await queuedPair("Search", searchId);
  expect(search.meta.custom_data).toMatchObject({ search_string: "Kaos" });
  expect(search.tiktok.properties).toMatchObject({ query: "Kaos" });
  await page.goto(`/site/${scenario.workspace.slug}/products/${scenario.product.slug}`);

  // --- Add to cart --------------------------------------------------------
  await page.getByRole("button", { name: /add to cart/i }).click();
  await expect(page.getByRole("dialog", { name: /keranjang belanja/i })).toBeVisible();

  const addToCartId = await fbqEventId(page, "AddToCart");
  expect(addToCartId).toMatch(/^add_to_cart:/);
  expect(await ttqCall(page, "track", "AddToCart")).toMatchObject({
    options: { event_id: addToCartId },
  });
  const addToCart = await queuedPair("AddToCart", addToCartId);
  expect(addToCart.tiktok.properties).toMatchObject({
    contents: [{ content_id: scenario.product.id, quantity: 1 }],
    value: scenario.product.price,
  });

  // --- Checkout -----------------------------------------------------------
  await page.goto(`/site/${scenario.workspace.slug}/checkout`);
  await page.locator("#name").fill("Pembeli Iklan");
  await page.locator("#email").fill("pembeli-iklan@buildery.test");
  await page.getByRole("button", { name: /ambil di lokasi/i }).click();
  await page.getByRole("button", { name: /transfer manual/i }).click();
  await page.getByText(scenario.manualMethod.name).click();
  await page.getByRole("button", { name: /buat pesanan/i }).click();
  await page.waitForURL(/checkout\/success/, { timeout: 60_000 });

  const placed = (await loadOrder(scenario.workspace.id))!;
  await queuedPair("AddPaymentInfo", `add_payment_info:order:${placed.orderNumber}`);
  expect(placed.payment!.adContext).toMatchObject({
    userAgent: expect.any(String),
    fbp,
    fbc: expect.stringMatching(/E2EFBCLID$/),
    ttclid: "E2ETTCLID",
    gaClientId: "987654321.1700000000",
  });

  // --- The seller confirms payment, in a different session ----------------
  await submitManualProof(placed.payment!.id);
  await page.context().clearCookies();
  await page.goto("/login");
  await page.locator("#email").fill(scenario.owner.email);
  await page.locator("#password").fill(scenario.owner.password);
  await page.getByRole("button", { name: /masuk|login|sign in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
  await page.goto(`/dashboard/orders/${placed.id}`);
  await page.getByRole("button", { name: /^terima$/i }).first().click();

  const purchase = await queuedPair("Purchase", `purchase:order:${placed.orderNumber}`);
  // Nothing of the buyer's browser is on this request, yet the purchase still
  // carries it — from the payment row.
  expect(purchase.meta.user_data).toMatchObject({
    fbp,
    fbc: expect.stringMatching(/E2EFBCLID$/),
    client_user_agent: expect.any(String),
  });
  expect(purchase.tiktok.event).toBe("CompletePayment");
  expect(purchase.tiktok.user).toMatchObject({ ttclid: "E2ETTCLID" });

  // GA4 gets its server copy of the purchase, joined to the buyer's GA client.
  const ga4Rows = await prisma.metaCapiEvent.findMany({
    where: { workspaceId: scenario.workspace.id, provider: "GA4" },
    select: { eventName: true, payload: true },
  });
  expect(ga4Rows).toHaveLength(1);
  expect(ga4Rows[0].eventName).toBe("purchase");
  expect(ga4Rows[0].payload).toMatchObject({
    client_id: "987654321.1700000000",
    events: [
      {
        name: "purchase",
        params: {
          transaction_id: placed.orderNumber,
          value: scenario.product.price,
          items: [{ item_id: scenario.product.id, quantity: 1 }],
        },
      },
    ],
  });
});

test("with consent required, nothing is tracked until the visitor accepts", async ({ page }) => {
  await prisma.integrationSetting.update({
    where: { workspaceId: scenario.workspace.id },
    data: { adConsentRequired: true },
  });
  const pixelRequests: string[] = [];
  await page.route(/connect\.facebook\.net|analytics\.tiktok\.com|googletagmanager\.com/, (route) => {
    pixelRequests.push(route.request().url());
    return route.abort();
  });

  const productUrl = `/site/${scenario.workspace.slug}/products/${scenario.product.slug}`;
  await page.goto(productUrl);
  const banner = page.getByRole("region", { name: /persetujuan cookie/i });
  await expect(banner).toBeVisible();

  // No tag script is even requested, and the server copies are held back.
  await page.getByRole("button", { name: /add to cart/i }).click();
  await expect(page.getByRole("dialog", { name: /keranjang belanja/i })).toBeVisible();
  await page.waitForTimeout(1500);
  expect(pixelRequests).toEqual([]);
  expect(
    await prisma.metaCapiEvent.count({ where: { workspaceId: scenario.workspace.id } })
  ).toBe(0);

  // Declining persists and keeps tracking off.
  await page.keyboard.press("Escape");
  await banner.getByRole("button", { name: /tolak/i }).click();
  await expect(banner).toBeHidden();
  await page.reload();
  await expect(page.getByRole("region", { name: /persetujuan cookie/i })).toHaveCount(0);
  expect(pixelRequests).toEqual([]);

  // Changing their mind: accepting loads the tags and events flow again.
  await page.context().clearCookies({ name: "bd_consent" });
  await page.reload();
  await page.getByRole("region", { name: /persetujuan cookie/i }).getByRole("button", { name: /terima/i }).click();
  await expect.poll(() => pixelRequests.length, { timeout: 20_000 }).toBeGreaterThan(0);
  await page.getByRole("button", { name: /add to cart/i }).click();
  await expect
    .poll(
      () =>
        prisma.metaCapiEvent.count({
          where: { workspaceId: scenario.workspace.id, eventName: "AddToCart" },
        }),
      { timeout: 30_000 }
    )
    .toBe(2);
});

test("the catalog feed lists the product with the id the events use", async ({ request }) => {
  const image = await prisma.uploadFile.create({
    data: {
      workspaceId: scenario.workspace.id,
      name: "kaos.png",
      url: "/uploads/e2e/kaos.png",
      mimeType: "image/png",
    },
  });
  await prisma.product.update({
    where: { id: scenario.product.id },
    data: { imageId: image.id },
  });

  const res = await request.get(`/site/${scenario.workspace.slug}/catalog.xml`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/xml");
  const xml = await res.text();
  expect(xml).toContain(`<g:id>${scenario.product.id}</g:id>`);
  expect(xml).toMatch(/<g:link>https?:\/\/[^<]+\/products\/[^<]+<\/g:link>/);
  expect(xml).toMatch(/<g:image_link>https?:\/\/[^<]+\/uploads\/e2e\/kaos\.png<\/g:image_link>/);
  expect(xml).toContain(`<g:price>${scenario.product.price}.00 IDR</g:price>`);
});

async function gtagEvent(page: Page, eventName: string) {
  let params: Record<string, unknown> | null = null;
  await expect
    .poll(
      async () => {
        params = await page.evaluate((name) => {
          const calls = (window as unknown as { __gtagCalls: unknown[][] }).__gtagCalls;
          const call = [...calls].reverse().find((args) => args[0] === "event" && args[1] === name);
          return (call?.[2] as Record<string, unknown> | undefined) ?? null;
        }, eventName);
        return params;
      },
      { timeout: 20_000, message: `gtag ${eventName}` }
    )
    .not.toBeNull();
  return params;
}

async function fbqEventId(page: Page, eventName: string): Promise<string> {
  let eventId = "";
  await expect
    .poll(
      async () => {
        eventId = await page.evaluate((name) => {
          const calls = (window as unknown as { __fbqCalls: unknown[][] }).__fbqCalls;
          const call = [...calls]
            .reverse()
            .find((args) => args[0] === "track" && args[1] === name);
          return ((call?.[3] as { eventID?: string } | undefined)?.eventID) ?? "";
        }, eventName);
        return eventId;
      },
      { timeout: 20_000, message: `fbq ${eventName}` }
    )
    .not.toBe("");
  return eventId;
}

async function ttqCall(page: Page, method: string, eventName?: string) {
  let found: { params: unknown; options: unknown } | null = null;
  await expect
    .poll(
      async () => {
        found = await page.evaluate(
          ([m, name]) => {
            const queue = (window as unknown as { ttq: unknown[] }).ttq;
            const entry = [...queue]
              .reverse()
              .find(
                (item) =>
                  Array.isArray(item) && item[0] === m && (!name || item[1] === name)
              ) as unknown[] | undefined;
            return entry ? { params: entry[2] ?? null, options: entry[3] ?? null } : null;
          },
          [method, eventName ?? ""] as const
        );
        return found;
      },
      { timeout: 20_000, message: `ttq ${method} ${eventName ?? ""}` }
    )
    .not.toBeNull();
  return found;
}

async function rowsFor(eventName: string, eventId: string) {
  return prisma.metaCapiEvent.findMany({
    where: { workspaceId: scenario.workspace.id, eventName, eventId },
    orderBy: { provider: "asc" },
    select: { provider: true, payload: true },
  });
}

type Json = Record<string, any>;

async function queuedPair(eventName: string, eventId: string) {
  let rows: Awaited<ReturnType<typeof rowsFor>> = [];
  await expect
    .poll(
      async () => {
        rows = await rowsFor(eventName, eventId);
        return rows.map((row) => row.provider);
      },
      { timeout: 30_000, message: `queued ${eventName} ${eventId}` }
    )
    .toEqual(["META", "TIKTOK"]);
  return {
    meta: rows[0].payload as Json,
    tiktok: rows[1].payload as Json,
  };
}
