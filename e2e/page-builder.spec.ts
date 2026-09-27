import { expect, test } from "@playwright/test";

import { createScenario, prisma, type Scenario } from "./fixtures/scenario";

/**
 * The builder's undo stack and shortcuts.
 *
 * Until now the only way back from a mistake was the server-side revision
 * list, which loses everything since the last save — so these are the paths
 * worth proving against the real editor rather than the reducer alone.
 */

let scenario: Scenario;
let pageId = "";

test.beforeAll(async () => {
  scenario = await createScenario({ withAffiliate: false });

  const website = await prisma.website.create({
    data: {
      workspaceId: scenario.workspace.id,
      name: "Situs E2E",
      slug: "situs-e2e",
    },
  });
  const page = await prisma.page.create({
    data: {
      websiteId: website.id,
      title: "Halaman Builder",
      slug: "halaman-builder",
      status: "DRAFT",
      blocks: {
        create: [
          { type: "TEXT", order: 0, data: { heading: "Blok pertama" } },
          { type: "TEXT", order: 1, data: { heading: "Blok kedua" } },
        ],
      },
    },
  });
  pageId = page.id;
});

test.afterAll(async () => {
  await scenario?.destroy();
});

async function openBuilder(page: import("@playwright/test").Page) {
  // The dev server occasionally drops the first sign-in of a run; one retry
  // keeps the test about the builder rather than about the login form.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    // The first attempt may have landed after all; /login then bounces to the
    // dashboard and there is no form left to fill.
    if (/\/dashboard/.test(page.url())) break;
    await page.locator("#email").fill(scenario.owner.email);
    await page.locator("#password").fill(scenario.owner.password);
    await page.getByRole("button", { name: /masuk|login|sign in/i }).click();
    await page.waitForTimeout(2_000);
    if (/\/dashboard/.test(page.url())) break;
  }
  await expect.poll(() => page.url(), { timeout: 60_000 }).toMatch(/\/dashboard/);

  await page.goto(`/dashboard/pages/${pageId}/builder`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Blok pertama")).toBeVisible({ timeout: 30_000 });
}

test("deleting a block can be undone, and redone", async ({ page }) => {
  await openBuilder(page);

  const undo = page.getByRole("button", { name: /^Undo/ });
  const redo = page.getByRole("button", { name: /^Redo/ });
  // Nothing has happened yet.
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();

  await page.getByText("Blok kedua").click();
  await page.keyboard.press("Delete");
  await expect(page.getByText("Blok kedua")).toHaveCount(0);

  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(page.getByText("Blok kedua")).toBeVisible();

  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(page.getByText("Blok kedua")).toHaveCount(0);
});

test("Ctrl+Z works from the keyboard and Ctrl+D duplicates", async ({ page }) => {
  await openBuilder(page);

  await page.getByText("Blok pertama").click();
  await page.keyboard.press("ControlOrMeta+d");
  // The duplicate carries the same text, so there are now two of it.
  await expect(page.getByText("Blok pertama")).toHaveCount(2);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByText("Blok pertama")).toHaveCount(1);

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.getByText("Blok pertama")).toHaveCount(2);
});

test("undo reaches the server, so the page really goes back", async ({ page }) => {
  await openBuilder(page);

  await page.getByText("Blok kedua").click();
  await page.keyboard.press("Delete");
  // Autosave runs ~1.8s after the last change.
  await expect
    .poll(
      () => prisma.pageBlock.count({ where: { pageId } }),
      { timeout: 30_000 }
    )
    .toBe(1);

  await page.getByRole("button", { name: /^Undo/ }).click();
  await expect
    .poll(
      () => prisma.pageBlock.count({ where: { pageId } }),
      { timeout: 30_000 }
    )
    .toBe(2);
});

test("publishing an edit is visible on the live page immediately", async ({
  page,
}) => {
  // Published pages are served from a tag-invalidated cache; the point of this
  // test is that an edit drops the tag rather than waiting out the TTL.
  await prisma.page.update({ where: { id: pageId }, data: { status: "PUBLISHED" } });
  const website = await prisma.website.findFirstOrThrow({
    where: { workspaceId: scenario.workspace.id },
    select: { id: true },
  });
  await prisma.website.update({
    where: { id: website.id },
    data: { homePageId: pageId },
  });

  const url = `/site/${scenario.workspace.slug}/halaman-builder`;
  await page.goto(url);
  await expect(page.getByText("Blok pertama")).toBeVisible({ timeout: 30_000 });

  // Warm the cache with a second visit, then edit through the builder.
  await page.goto(url);
  await expect(page.getByText("Blok pertama")).toBeVisible();

  await openBuilder(page);
  await page.getByText("Blok kedua").click();
  await page.keyboard.press("Delete");
  await expect
    .poll(() => prisma.pageBlock.count({ where: { pageId } }), { timeout: 30_000 })
    .toBe(1);

  await page.goto(url);
  // Stale would still show it, because the cached copy was built before.
  await expect(page.getByText("Blok kedua")).toHaveCount(0);
  await expect(page.getByText("Blok pertama")).toBeVisible();
});

test("renaming a page redirects its old address instead of 404ing", async ({
  page,
}) => {
  await prisma.page.update({ where: { id: pageId }, data: { status: "PUBLISHED" } });
  const before = await prisma.page.findUniqueOrThrow({
    where: { id: pageId },
    select: { slug: true },
  });

  await openBuilder(page);
  await page.goto(`/dashboard/pages/${pageId}/settings`);
  await page.waitForLoadState("networkidle");

  const slugField = page.locator("#slug");
  await slugField.fill("halaman-pindah");
  await page.getByRole("button", { name: /save settings/i }).click();

  await expect
    .poll(
      async () =>
        (
          await prisma.page.findUniqueOrThrow({
            where: { id: pageId },
            select: { slug: true },
          })
        ).slug,
      { timeout: 20_000 }
    )
    .toBe("halaman-pindah");

  // The link someone already has keeps working.
  await page.goto(`/site/${scenario.workspace.slug}/${before.slug}`);
  await expect.poll(() => page.url()).toContain("halaman-pindah");
  await expect(page.getByText("Blok pertama")).toBeVisible({ timeout: 20_000 });
});
