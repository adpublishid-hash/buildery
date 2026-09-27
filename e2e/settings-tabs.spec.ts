import { expect, test } from "@playwright/test";

import { createScenario, type Scenario } from "./fixtures/scenario";

/**
 * Settings and integrations are split into tabs, which moves three things that
 * used to be implicit: the section now comes from `?tab=`, the old in-page
 * anchors became real links, and the integrations form keeps every field
 * mounted behind one save button. Each is easy to break from a distance.
 */

let scenario: Scenario;

test.beforeAll(async () => {
  scenario = await createScenario({ withAffiliate: false });
});

test.afterAll(async () => {
  await scenario?.destroy();
});

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  // Filling the form before React attaches submits nothing, and the redirect
  // lands back on /login with a callbackUrl.
  await page.waitForLoadState("networkidle");
  await page.locator("#email").fill(scenario.owner.email);
  await page.locator("#password").fill(scenario.owner.password);
  await page.getByRole("button", { name: /masuk|login|sign in/i }).click();
  // Sign-in lands on the dashboard with a soft navigation, which never fires a
  // "load" event for waitForURL to wait on.
  await expect.poll(() => page.url(), { timeout: 60_000 }).toMatch(/\/dashboard/);
}

test("each settings tab is reachable by URL", async ({ page }) => {
  await signIn(page);

  // Routes that used to point at "#branding" / "#ecommerce" anchors.
  await page.goto("/dashboard/settings/branding");
  await page.waitForURL(/tab=tampilan/);
  await expect(page.getByText("Logo, favicon, warna utama")).toBeVisible();

  await page.goto("/dashboard/ecommerce/settings");
  await page.waitForURL(/tab=ecommerce/);

  await page.goto("/dashboard/settings?tab=anggota");
  await expect(page.getByText("Kelola anggota aktif, role")).toBeVisible();
  // Only the active tab renders, so another tab's content must be absent.
  await expect(page.getByText("Identitas dasar workspace")).toHaveCount(0);

  // An unknown tab falls back instead of rendering an empty page.
  await page.goto("/dashboard/settings?tab=bogus");
  await expect(page.getByText("Identitas dasar workspace")).toBeVisible();
});

test("the sidebar highlights only the deepest matching entry", async ({ page }) => {
  await signIn(page);
  await page.goto("/dashboard/settings/integrations");

  const sidebar = page.locator("aside, nav").first();
  const active = /(^|\s)bg-zinc-800(\s|$)/;
  await expect(
    sidebar.getByRole("link", { name: "Integrasi", exact: true })
  ).toHaveClass(active);
  // "/dashboard/settings" is a prefix of this route but not the page we are on.
  await expect(
    sidebar.locator('a[href="/dashboard/settings?tab=umum"]')
  ).not.toHaveClass(active);
});

test("one save submits fields from every integration sub-tab", async ({ page }) => {
  await signIn(page);
  await page.goto("/dashboard/settings/integrations");

  await page.getByRole("tab", { name: "Meta", exact: true }).click();
  await page.locator("#metaPixelId").fill("123456789012345");

  await page.getByRole("tab", { name: "Google", exact: true }).click();
  await page.locator("#googleAnalyticsId").fill("G-E2ETABS01");

  // One button at the bottom, for the whole form — not per tab.
  await page.getByRole("button", { name: /save integrations/i }).click();
  await expect(page.getByText("Integrations saved")).toBeVisible();

  await page.reload();
  await page.getByRole("tab", { name: "Meta", exact: true }).click();
  await expect(page.locator("#metaPixelId")).toHaveValue("123456789012345");
  await page.getByRole("tab", { name: "Google", exact: true }).click();
  await expect(page.locator("#googleAnalyticsId")).toHaveValue("G-E2ETABS01");
});
