import { expect, test } from "@playwright/test";

import { createScenario, prisma, type Scenario } from "./fixtures/scenario";

/**
 * The inbox keeps its state in the URL and its data in Postgres: the list is
 * filtered and paged by the server, a thread loads only its newest messages,
 * and opening one is what clears the unread badge. All of that is invisible to
 * a unit test of the queries alone.
 */

let scenario: Scenario;

const THREAD_LENGTH = 60;

test.beforeAll(async () => {
  scenario = await createScenario({ withAffiliate: false });

  const people = [
    { name: "Budi Santoso", phone: "628119000001", unread: 2 },
    { name: "Citra Dewi", phone: "628119000002", unread: 3 },
  ];

  for (const person of people) {
    const conversation = await prisma.inboxConversation.create({
      data: {
        workspaceId: scenario.workspace.id,
        channel: "WHATSAPP",
        contactPhone: person.phone,
        contactName: person.name,
        status: "OPEN",
        unreadCount: person.unread,
        lastMessagePreview: `Halo, saya ${person.name}`,
        lastMessageAt: new Date(),
      },
    });
    await prisma.inboxMessage.createMany({
      data: Array.from({ length: THREAD_LENGTH }, (_, i) => ({
        workspaceId: scenario.workspace.id,
        conversationId: conversation.id,
        direction: "INBOUND" as const,
        status: "RECEIVED" as const,
        body: `Pesan ${i + 1} dari ${person.name}`,
        createdAt: new Date(Date.now() - (THREAD_LENGTH - i) * 60_000),
      })),
    });
  }

  // One reply that never left, so the failure reason has somewhere to show.
  const budi = await prisma.inboxConversation.findFirstOrThrow({
    where: { workspaceId: scenario.workspace.id, contactPhone: "628119000001" },
  });
  await prisma.inboxMessage.create({
    data: {
      workspaceId: scenario.workspace.id,
      conversationId: budi.id,
      direction: "OUTBOUND",
      status: "FAILED",
      body: "Baik kak, saya cek dulu ya.",
      errorMessage: "Aktifkan provider WhatsApp di Settings > Integrasi sebelum mengirim.",
    },
  });
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

test("a thread opens at its newest message and keeps the rest behind a link", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/dashboard/inbox");
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: /Budi Santoso/ }).click();

  // 50 of 60 are loaded, ending at the most recent one.
  await expect(
    page.getByText(`Pesan ${THREAD_LENGTH} dari Budi Santoso`)
  ).toBeInViewport();
  await expect(page.getByText("Pesan 1 dari Budi Santoso")).toHaveCount(0);

  await page.getByRole("link", { name: /muat pesan lama/i }).click();
  await expect(page.getByText("Pesan 1 dari Budi Santoso")).toBeVisible();

  // A send that failed says why, instead of only "failed".
  await expect(
    page.getByText("Aktifkan provider WhatsApp di Settings")
  ).toBeVisible();
});

test("opening a conversation clears its unread badge", async ({ page }) => {
  // Earlier tests read these threads; start from a known unread state.
  await prisma.inboxConversation.updateMany({
    where: { workspaceId: scenario.workspace.id },
    data: { unreadCount: 2 },
  });

  await signIn(page);
  await page.goto("/dashboard/inbox");
  await page.waitForLoadState("networkidle");

  const inboxLink = page.locator("aside").first().getByRole("link", { name: /^Inbox/ });

  // The thread that opens by default is marked read on sight — no reply, no
  // status change — so one of the two conversations is left unread.
  await expect(inboxLink).toContainText("1");

  // Visiting the other one leaves nothing unread…
  for (const name of ["Budi Santoso", "Citra Dewi"]) {
    await page.getByRole("link", { name: new RegExp(name) }).click();
    await expect.poll(() => page.url()).toContain("c=");
  }
  await expect
    .poll(
      () =>
        prisma.inboxConversation.count({
          where: { workspaceId: scenario.workspace.id, unreadCount: { gt: 0 } },
        }),
      { timeout: 15_000 }
    )
    .toBe(0);

  // …and the sidebar badge, which lives outside this route, follows.
  await expect(inboxLink).not.toContainText(/[0-9]/);
});

test("search and status filters run on the server", async ({ page }) => {
  await signIn(page);
  await page.goto("/dashboard/inbox");
  await page.waitForLoadState("networkidle");

  // A soft navigation, so assert on what the server sent back, not on a load.
  await page.getByRole("searchbox", { name: "Cari percakapan" }).fill("citra");
  await expect(page.getByRole("link", { name: /Citra Dewi/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Budi Santoso/ })).toHaveCount(0);

  // Searching by a number typed with punctuation finds the same thread.
  await page.getByRole("searchbox", { name: "Cari percakapan" }).fill("+628 119 000 001");
  await expect(page.getByRole("link", { name: /Budi Santoso/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Citra Dewi/ })).toHaveCount(0);

  await page.getByRole("combobox", { name: "Filter status" }).selectOption({ label: "Selesai" });
  await expect(page.getByText("Tidak ada yang cocok")).toBeVisible();
});
