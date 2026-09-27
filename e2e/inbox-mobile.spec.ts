import { expect, test, type Page } from "@playwright/test";

import { createScenario, prisma, type Scenario } from "./fixtures/scenario";

/**
 * The inbox on a phone.
 *
 * On a desktop the inbox is three columns. Below `lg` that grid collapses to
 * one, and every pane used to stack: the page header, then the filters, then
 * the whole conversation list, then the thread, then the details panel. The
 * chat itself ended up with a few hundred pixels in the middle of a very long
 * scroll, and the composer sat somewhere below the fold.
 *
 * So the phone layout is now one pane at a time, and these tests hold that
 * shape: the list OR the thread, a way back between them, and a chat area that
 * actually fills the screen.
 */

let scenario: Scenario;

const PHONE = { width: 390, height: 844 };

test.use({ viewport: PHONE });

test.beforeAll(async () => {
  scenario = await createScenario({ withAffiliate: false });

  const conversation = await prisma.inboxConversation.create({
    data: {
      workspaceId: scenario.workspace.id,
      channel: "WHATSAPP",
      contactPhone: "6289685350650",
      contactName: "Sari Mobile",
      status: "OPEN",
      unreadCount: 1,
      lastMessagePreview: "Halo, pesanan saya sudah dikirim?",
      lastMessageAt: new Date(),
    },
  });
  await prisma.inboxMessage.createMany({
    data: Array.from({ length: 12 }, (_, i) => ({
      workspaceId: scenario.workspace.id,
      conversationId: conversation.id,
      direction: "INBOUND" as const,
      status: "RECEIVED" as const,
      body: `Pesan ${i + 1} dari Sari`,
      createdAt: new Date(Date.now() - (12 - i) * 60_000),
    })),
  });
});

test.afterAll(async () => {
  await scenario?.destroy();
});

async function signIn(page: Page) {
  // The dev server occasionally drops the first sign-in of a run; one retry
  // keeps these tests about the layout rather than about the login form.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto("/login");
    // Filling the form before React attaches submits nothing.
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
  // Sign-in is a soft navigation, which never fires the "load" event
  // `waitForURL` waits for.
  await expect.poll(() => page.url(), { timeout: 60_000 }).toMatch(/\/dashboard/);
}

async function openThread(page: Page) {
  await page.goto("/dashboard/inbox");
  await page.getByText("Sari Mobile").first().click();
  await expect.poll(() => page.url(), { timeout: 30_000 }).toMatch(/[?&]c=/);
}

test("the list and the thread are separate panes on a phone", async ({ page }) => {
  await signIn(page);
  await page.goto("/dashboard/inbox");

  // Nothing open: the list is the page, and no back arrow is offered.
  await expect(page.getByText("Sari Mobile").first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Kembali ke daftar percakapan" })
  ).toHaveCount(0);

  await openThread(page);

  // Open: the thread replaces the list rather than stacking under it.
  const back = page.getByRole("link", { name: "Kembali ke daftar percakapan" });
  await expect(back).toBeVisible();
  await expect(page.getByText("Pesan 12 dari Sari")).toBeVisible();
  // The list (and its search box) steps aside for the thread.
  await expect(page.getByRole("searchbox", { name: "Cari percakapan" })).toBeHidden();

  // ...and back returns to the list.
  await back.click();
  await expect.poll(() => page.url(), { timeout: 30_000 }).not.toMatch(/[?&]c=/);
  await expect(page.getByText("Sari Mobile").first()).toBeVisible();
});

test("the chat area fills most of the phone screen", async ({ page }) => {
  await signIn(page);
  await openThread(page);

  const composer = page.getByLabel("Balasan WhatsApp");
  await expect(composer).toBeVisible();

  const box = await composer.boundingBox();
  // The composer has to be on screen without scrolling — it used to sit below
  // the list, the thread and the details panel.
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThanOrEqual(PHONE.height);
  // Three rows, not two: a reply is usually more than one line.
  expect(box!.height).toBeGreaterThan(60);

  // The send button is the part that actually fell off. The shell used to size
  // itself with a hard-coded offset that did not account for the breadcrumb
  // above it, so it ran ~20px past the bottom of the screen and clipped the
  // button — while the textarea above it still looked fine.
  const send = await page.getByRole("button", { name: /Kirim/ }).boundingBox();
  expect(send).not.toBeNull();
  expect(send!.y + send!.height).toBeLessThanOrEqual(PHONE.height);

  // ...and the shell itself must end at the fold, not past it.
  const shell = await page.evaluate(() => {
    const el = document.querySelector("[data-inbox-shell]");
    return el ? Math.round(el.getBoundingClientRect().bottom) : null;
  });
  expect(shell).not.toBeNull();
  expect(shell!).toBeLessThanOrEqual(PHONE.height);

  // The messages get the bulk of what is left. Before this the header, the
  // filters and the list ate the screen before the first bubble appeared.
  const messages = page.locator("[data-inbox-messages]");
  const list = await messages.first().boundingBox();
  expect(list).not.toBeNull();
  expect(list!.height).toBeGreaterThan(PHONE.height * 0.45);
});

test("conversation details open in a sheet instead of stacking", async ({ page }) => {
  await signIn(page);
  await openThread(page);

  // Not stacked under the conversation the way the old single column had it.
  await expect(page.getByText("Catatan internal")).toBeHidden();
  // Finishing the chat stays one tap away in the thread header, even on a
  // phone (as an icon button with an accessible name).
  await expect(page.getByRole("button", { name: "Selesaikan" })).toBeVisible();

  await page.getByRole("button", { name: "Buka detail percakapan" }).click();

  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Petugas")).toBeVisible();
  await expect(sheet.getByText("Catatan internal")).toBeVisible();
});

test("a thread opens at its newest message, not its oldest", async ({ page }) => {
  await signIn(page);
  await openThread(page);

  await expect(page.getByText("Pesan 12 dari Sari")).toBeVisible();

  // The pane is mounted but hidden while the list is showing, and a hidden
  // element has no scrollHeight — so the auto-scroll silently did nothing and
  // the thread opened on week-old messages. It is also not a remount: the
  // server had already picked this thread for the desktop's middle column.
  const scroll = await page.evaluate(() => {
    const el = document.querySelector("[data-inbox-messages]") as HTMLElement | null;
    return el
      ? { top: el.scrollTop, max: el.scrollHeight - el.clientHeight }
      : null;
  });
  expect(scroll).not.toBeNull();
  expect(scroll!.max).toBeGreaterThan(0);
  expect(scroll!.top).toBeGreaterThanOrEqual(scroll!.max - 4);
});
