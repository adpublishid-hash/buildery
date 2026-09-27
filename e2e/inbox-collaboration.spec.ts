import { expect, test } from "@playwright/test";

import { createScenario, prisma, type Scenario } from "./fixtures/scenario";

/**
 * A shared inbox: who owns a thread, what it is about, what the team said
 * privately, and the canned answers. None of it is worth much if the wiring
 * between the panel and the database is wrong, which is only visible here.
 */

let scenario: Scenario;

test.beforeAll(async () => {
  scenario = await createScenario({ withAffiliate: false });

  await prisma.integrationSetting.create({
    data: {
      workspaceId: scenario.workspace.id,
      whatsappProvider: "WABA",
      whatsappIsActive: true,
      whatsappSenderNumber: "628111000999",
    },
  });

  await prisma.inboxQuickReply.create({
    data: {
      workspaceId: scenario.workspace.id,
      shortcut: "ongkir",
      body: "Ongkir ke alamat Anda Rp 20.000, estimasi 2-3 hari kerja.",
    },
  });

  // Fresh: the service window is open.
  const open = await prisma.inboxConversation.create({
    data: {
      workspaceId: scenario.workspace.id,
      channel: "WHATSAPP",
      contactPhone: "628119000001",
      contactName: "Budi Santoso",
      status: "OPEN",
      lastMessagePreview: "Paketnya penyok kak",
      lastMessageAt: new Date(),
      lastInboundAt: new Date(),
    },
  });
  await prisma.inboxMessage.create({
    data: {
      workspaceId: scenario.workspace.id,
      conversationId: open.id,
      direction: "INBOUND",
      status: "RECEIVED",
      body: "Paketnya penyok kak",
    },
  });

  // Three days silent: WhatsApp would reject a free-form reply.
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const stale = await prisma.inboxConversation.create({
    data: {
      workspaceId: scenario.workspace.id,
      channel: "WHATSAPP",
      contactPhone: "628119000002",
      contactName: "Citra Dewi",
      status: "PENDING",
      lastMessagePreview: "Baik kak, ditunggu ya",
      lastMessageAt: threeDaysAgo,
      lastInboundAt: threeDaysAgo,
    },
  });
  await prisma.inboxMessage.create({
    data: {
      workspaceId: scenario.workspace.id,
      conversationId: stale.id,
      direction: "INBOUND",
      status: "RECEIVED",
      body: "Baik kak, ditunggu ya",
      createdAt: threeDaysAgo,
    },
  });
});

test.afterAll(async () => {
  await scenario?.destroy();
});

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  // Filling the form before React attaches submits nothing.
  await page.waitForLoadState("networkidle");
  await page.locator("#email").fill(scenario.owner.email);
  await page.locator("#password").fill(scenario.owner.password);
  await page.getByRole("button", { name: /masuk|login|sign in/i }).click();
  await expect.poll(() => page.url(), { timeout: 60_000 }).toMatch(/\/dashboard/);
}

async function openBudi(page: import("@playwright/test").Page) {
  await page.goto("/dashboard/inbox");
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: /Budi Santoso/ }).click();
  await expect.poll(() => page.url()).toContain("c=");
}

test("a conversation can be handed to a teammate and filtered by it", async ({ page }) => {
  await signIn(page);
  await openBudi(page);

  await page.getByLabel("Petugas percakapan").selectOption(scenario.owner.id);

  await expect
    .poll(
      () =>
        prisma.inboxConversation.count({
          where: { workspaceId: scenario.workspace.id, assignedToId: scenario.owner.id },
        }),
      { timeout: 15_000 }
    )
    .toBe(1);

  // The list row now carries the owner, and the assignee filter finds it.
  await page.getByLabel("Filter petugas").selectOption("mine");
  await expect(page.getByRole("link", { name: /Budi Santoso/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Citra Dewi/ })).toHaveCount(0);

  await page.getByLabel("Filter petugas").selectOption("unassigned");
  await expect(page.getByRole("link", { name: /Citra Dewi/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Budi Santoso/ })).toHaveCount(0);
});

test("a label created in the panel lands on the conversation", async ({ page }) => {
  await signIn(page);
  await openBudi(page);

  await page.getByRole("button", { name: "Tambah label" }).click();
  await page.getByPlaceholder("Label baru").fill("Komplain");
  await page.getByRole("button", { name: "Tambah", exact: true }).click();

  await expect
    .poll(
      async () =>
        (
          await prisma.inboxConversation.findFirstOrThrow({
            where: { workspaceId: scenario.workspace.id, contactPhone: "628119000001" },
            include: { labels: true },
          })
        ).labels.map((label) => label.name),
      { timeout: 15_000 }
    )
    .toEqual(["Komplain"]);
});

test("an internal note is stored as a note, never sent to the customer", async ({
  page,
}) => {
  await signIn(page);
  await openBudi(page);

  await page.getByPlaceholder("Hanya tim yang melihat ini...").fill(
    "Kurir sudah dihubungi, kirim ulang besok."
  );
  await page.getByRole("button", { name: "Simpan catatan" }).click();

  await expect(page.getByText("Kurir sudah dihubungi")).toBeVisible();

  const outbound = await prisma.inboxMessage.count({
    where: { workspaceId: scenario.workspace.id, direction: "OUTBOUND" },
  });
  // A note is not a message: nothing was queued for the provider.
  expect(outbound).toBe(0);
});

test("a quick reply is offered by shortcut and fills the composer", async ({ page }) => {
  await signIn(page);
  await openBudi(page);

  const composer = page.getByPlaceholder(/Tulis balasan WhatsApp/);
  await composer.fill("/ong");
  await page.getByRole("button", { name: /\/ongkir/ }).click();

  // The "/shortcut" was a lookup, so it is replaced by the canned text.
  await expect(composer).toHaveValue(/^Ongkir ke alamat Anda/);

  // Picked from the button instead, it must not throw away what was typed.
  await composer.fill("Halo kak,");
  await page.getByRole("button", { name: "Balasan cepat", exact: true }).click();
  await page.getByRole("button", { name: /\/ongkir/ }).click();
  await expect(composer).toHaveValue(/^Halo kak,[\s\S]*Ongkir ke alamat Anda/);
});

test("a closed 24-hour window blocks a free-form reply", async ({ page }) => {
  await signIn(page);
  await page.goto("/dashboard/inbox");
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: /Citra Dewi/ }).click();

  await expect(page.getByText(/Jendela 24 jam WhatsApp sudah lewat/)).toBeVisible();
  await expect(page.getByPlaceholder(/Tunggu pelanggan menulis lagi/)).toBeDisabled();
  await expect(page.getByRole("button", { name: /^Kirim$/ })).toBeDisabled();
});
