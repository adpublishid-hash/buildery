import { expect, test, type Page } from "@playwright/test";

import { createScenario, prisma, type Scenario } from "./fixtures/scenario";

let scenario: Scenario;
let formId: string;
let emailFieldId: string;

test.beforeAll(async () => {
  scenario = await createScenario({ withAffiliate: false });
  const form = await prisma.form.create({
    data: {
      workspaceId: scenario.workspace.id,
      title: "Registration form",
      slug: `registration-${scenario.id}`,
      status: "DRAFT",
      isOpen: false,
      maxSubmissions: 1,
      closedMessage: "Registration capacity has been reached.",
      fields: {
        create: [
          {
            label: "Email address",
            name: "email",
            type: "EMAIL",
            required: true,
            order: 0,
          },
          {
            label: "Message",
            name: "message",
            type: "TEXTAREA",
            required: false,
            order: 1,
          },
        ],
      },
    },
    include: { fields: true },
  });
  formId = form.id;
  emailFieldId = form.fields.find((field) => field.name === "email")!.id;
});

test.afterAll(async () => {
  await scenario?.destroy();
});

async function signIn(page: Page) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    const email = page.locator("#email");
    if (!(await email.isVisible())) {
      await page.goto("/dashboard");
      if (/\/dashboard/.test(page.url())) break;
      continue;
    }
    await email.fill(scenario.owner.email);
    await page.locator("#password").fill(scenario.owner.password);
    await page.getByRole("button", { name: /masuk|login|sign in/i }).click();
    await page.waitForTimeout(2_000);
    await page.goto("/dashboard");
    if (/\/dashboard/.test(page.url())) break;
  }
  await expect.poll(() => page.url(), { timeout: 60_000 }).toMatch(/\/dashboard/);
}

test("draft, publish, immutable versions, close, reopen, and response limit", async ({
  page,
}) => {
  test.setTimeout(480_000);
  await signIn(page);
  await page.goto(`/dashboard/forms/${formId}/edit`);
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Publish form" }).click();
  await expect
    .poll(
      async () =>
        prisma.form.findUnique({
          where: { id: formId },
          select: { status: true, publishedVersion: true },
        })
    )
    .toEqual({ status: "PUBLISHED", publishedVersion: 1 });

  const form = await prisma.form.findUniqueOrThrow({
    where: { id: formId },
    select: { publishedSlug: true },
  });
  const publicPath = `/site/${scenario.workspace.slug}/forms/${form.publishedSlug}`;
  await page.goto(publicPath);
  await expect(page.getByLabel("Email address")).toBeVisible();

  // Editing the draft must not mutate the version currently seen by visitors.
  await prisma.formField.update({
    where: { id: emailFieldId },
    data: { label: "Work email" },
  });
  await page.reload();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByLabel("Work email")).toHaveCount(0);

  await page.goto(`/dashboard/forms/${formId}/edit`);
  await expect(page.getByText("Unpublished changes")).toBeVisible();
  await page.getByRole("button", { name: "Publish changes" }).click();
  await expect
    .poll(
      async () =>
        (
          await prisma.form.findUniqueOrThrow({
            where: { id: formId },
            select: { publishedVersion: true },
          })
        ).publishedVersion
    )
    .toBe(2);
  await page.goto(publicPath);
  await expect(page.getByLabel("Work email")).toBeVisible();

  await page.goto(`/dashboard/forms/${formId}/edit`);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Restore version 1" }).click();
  await expect
    .poll(
      async () =>
        (
          await prisma.form.findUniqueOrThrow({
            where: { id: formId },
            select: { publishedVersion: true },
          })
        ).publishedVersion
    )
    .toBe(3);
  await page.goto(publicPath);
  await expect(page.getByLabel("Email address")).toBeVisible();

  await page.goto(`/dashboard/forms/${formId}/edit`);
  await page.getByRole("button", { name: "Close form" }).click();
  await expect
    .poll(
      async () =>
        (
          await prisma.form.findUniqueOrThrow({
            where: { id: formId },
            select: { status: true },
          })
        ).status
    )
    .toBe("CLOSED");
  await page.goto(publicPath);
  await expect(page.getByText("Registration capacity has been reached.")).toBeVisible();

  await page.goto(`/dashboard/forms/${formId}/edit`);
  await page.getByRole("button", { name: "Reopen published version" }).click();
  await expect
    .poll(
      async () =>
        (
          await prisma.form.findUniqueOrThrow({
            where: { id: formId },
            select: { status: true },
          })
        ).status
    )
    .toBe("PUBLISHED");
  await page.goto(publicPath);
  await page.getByLabel("Email address").fill("visitor@example.com");
  await page.waitForTimeout(1_600);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("Thanks! We received your submission.")).toBeVisible();
  await expect
    .poll(() => prisma.formSubmission.count({ where: { formId } }))
    .toBe(1);

  await page.reload();
  await expect(page.getByText("Registration capacity has been reached.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit" })).toHaveCount(0);
});
