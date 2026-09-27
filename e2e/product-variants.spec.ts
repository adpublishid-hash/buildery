import { expect, test } from "@playwright/test";

import { createScenario, prisma, type Scenario } from "./fixtures/scenario";

/**
 * Variants as a matrix of option axes: declared once in the dashboard,
 * generated in bulk, and offered to the shopper as one selector per axis
 * instead of a flat list of hand-typed names.
 */

let scenario: Scenario;

/** 1x1 PNGs, so the swatches load for real instead of 404ing. */
const SWATCH_BLACK =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const SWATCH_WHITE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

test.beforeAll(async () => {
  scenario = await createScenario({ withAffiliate: false, stock: 0 });
});

test.afterAll(async () => {
  await scenario?.destroy();
});

async function signIn(page: import("@playwright/test").Page) {
  // Two session requests can race while the dev server warms up and replace
  // the first CSRF cookie. Retrying keeps this spec focused on variants.
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

test("new products create their variant matrix before the submit action", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/dashboard/products/new");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Opsi varian", { exact: true })).toBeVisible();
  await page.getByLabel("Product name").fill(`Produk Varian ${scenario.id}`);
  await page.locator('input[name="price"]').fill("125000");
  await page.getByRole("button", { name: "Tambah opsi" }).click();
  await page.getByLabel("Nama opsi").fill("Warna");
  await page
    .getByLabel("Nilai (pisahkan dengan koma)")
    .fill("Hitam, Putih");
  await expect(page.getByText("2 varian akan dibuat bersama produk")).toBeVisible();

  // The save button lives in the sticky editor header: with the variant
  // options on screen it must still be in view, so nobody saves blind or
  // hunts for it below the panel.
  await page.getByText("Opsi varian", { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Buat produk" })).toBeInViewport();

  await page.getByRole("button", { name: "Buat produk" }).click();
  await expect.poll(() => page.url(), { timeout: 20_000 }).toMatch(/\/edit#variants$/);

  const created = await prisma.product.findFirstOrThrow({
    where: {
      workspaceId: scenario.workspace.id,
      name: `Produk Varian ${scenario.id}`,
    },
    select: {
      stock: true,
      variantOptions: true,
      variants: { orderBy: { sortOrder: "asc" }, select: { name: true } },
    },
  });
  expect(created.stock).toBe(0);
  expect(created.variantOptions).toEqual([
    { name: "Warna", values: ["Hitam", "Putih"] },
  ]);
  expect(created.variants).toEqual([{ name: "Hitam" }, { name: "Putih" }]);

  await page.getByText("Opsi varian", { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Simpan perubahan" })).toBeInViewport();
});

test("generating the matrix creates every combination once", async ({ page }) => {
  await signIn(page);
  await page.goto(`/dashboard/products/${scenario.product.id}/edit`);
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Tambah opsi" }).click();
  await page.getByLabel("Nama opsi").fill("Warna");
  await page.getByLabel("Nilai (pisahkan dengan koma)").fill("Hitam, Putih");

  await page.getByRole("button", { name: "Tambah opsi" }).click();
  await page.getByLabel("Nama opsi").nth(1).fill("Ukuran");
  await page.getByLabel("Nilai (pisahkan dengan koma)").nth(1).fill("S, M, L");

  await expect(page.getByText("6 kombinasi")).toBeVisible();
  await page.getByRole("button", { name: "Buat kombinasi" }).click();

  await expect
    .poll(
      () => prisma.productVariant.count({ where: { productId: scenario.product.id } }),
      { timeout: 15_000 }
    )
    .toBe(6);

  const variants = await prisma.productVariant.findMany({
    where: { productId: scenario.product.id },
    select: { name: true, options: true },
  });
  expect(variants.map((v) => v.name).sort()).toEqual([
    "Hitam / L",
    "Hitam / M",
    "Hitam / S",
    "Putih / L",
    "Putih / M",
    "Putih / S",
  ]);
  expect(variants[0].options).toMatchObject({ Warna: expect.any(String) });

  // Running it again is a no-op, not a second set of six.
  await page.goto(`/dashboard/products/${scenario.product.id}/edit`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Buat kombinasi" }).click();
  await page.waitForTimeout(1500);
  expect(
    await prisma.productVariant.count({ where: { productId: scenario.product.id } })
  ).toBe(6);
});

test("stock edited in the grid rolls up to the product", async ({ page }) => {
  await signIn(page);
  await page.goto(`/dashboard/products/${scenario.product.id}/edit`);
  await page.waitForLoadState("networkidle");

  const variants = await prisma.productVariant.findMany({
    where: { productId: scenario.product.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  // Only "Hitam / S" gets stock, so the storefront can prove the rest are out.
  const target = variants.find((v) => v.name === "Hitam / S")!;
  await page.getByLabel(`Stok ${target.name}`).fill("4");
  await page.getByRole("button", { name: "Simpan stok & harga" }).click();

  await expect
    .poll(
      async () =>
        (
          await prisma.product.findUniqueOrThrow({
            where: { id: scenario.product.id },
            select: { stock: true },
          })
        ).stock,
      { timeout: 15_000 }
    )
    .toBe(4);
});

test("the storefront offers one selector per axis", async ({ page }) => {
  await page.goto(`/site/${scenario.workspace.slug}/products/${scenario.product.slug}`);
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Warna", { exact: true })).toBeVisible();
  await expect(page.getByText("Ukuran", { exact: true })).toBeVisible();

  // Only Hitam / S has stock, so every other value is unbuyable.
  await expect(page.getByRole("button", { name: "Warna: Hitam" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Warna: Putih" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Ukuran: S" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Ukuran: M" })).toBeDisabled();

  // The in-stock combination is preselected and can be bought.
  await expect(page.getByRole("button", { name: "Warna: Hitam" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await page.getByRole("button", { name: /add to cart/i }).click();
  await expect(page.getByRole("dialog", { name: /keranjang belanja/i })).toBeVisible();
});

test("the picker shows swatches and puts the choice in the URL", async ({ page }) => {
  // Give each colour its own photo and its own price.
  const variants = await prisma.productVariant.findMany({
    where: { productId: scenario.product.id },
    select: { id: true, name: true },
  });
  for (const variant of variants) {
    const hitam = variant.name.startsWith("Hitam");
    await prisma.productVariant.update({
      where: { id: variant.id },
      data: {
        stock: 5,
        // Data URIs: a 404 would now correctly fall back to the label.
        imageUrl: hitam ? SWATCH_BLACK : SWATCH_WHITE,
        price: hitam ? 150_000 : 190_000,
      },
    });
  }
  await prisma.product.update({
    where: { id: scenario.product.id },
    data: { stock: 30 },
  });

  await page.goto(`/site/${scenario.workspace.slug}/products/${scenario.product.slug}`);
  await page.waitForLoadState("networkidle");

  // Colour becomes swatches; size stays as labels, because a row of identical
  // thumbnails would say nothing.
  const hitam = page.getByRole("button", { name: "Warna: Hitam" });
  await expect(hitam.locator("img")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ukuran: M" }).locator("img")
  ).toHaveCount(0);

  // Prices differ across variants, so the page shows the range.
  await expect(page.getByText(/Rp\s?150\.000\s*–\s*Rp\s?190\.000/)).toBeVisible();

  await page.getByRole("button", { name: "Warna: Putih" }).click();
  // The chosen variant is in the address bar, so the page can be shared.
  await expect.poll(() => page.url()).toMatch(/variant=/);

  const chosen = new URL(page.url()).searchParams.get("variant");
  const record = await prisma.productVariant.findUniqueOrThrow({
    where: { id: chosen! },
    select: { name: true },
  });
  expect(record.name).toContain("Putih");

  // Reloading that URL lands on the same variant.
  await page.goto(page.url());
  await expect(page.getByRole("button", { name: "Warna: Putih" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});

test("a swatch whose photo is missing falls back to its name", async ({ page }) => {
  await prisma.productVariant.updateMany({
    where: { productId: scenario.product.id },
    data: { imageUrl: "/uploads/does-not-exist.png", isActive: true, stock: 5 },
  });
  // Distinct per colour, so the picker tries swatches in the first place.
  for (const warna of ["Hitam", "Putih"]) {
    await prisma.productVariant.updateMany({
      where: { productId: scenario.product.id, name: { startsWith: warna } },
      data: { imageUrl: `/uploads/missing-${warna.toLowerCase()}.png` },
    });
  }

  await page.goto(`/site/${scenario.workspace.slug}/products/${scenario.product.slug}`);
  await page.waitForLoadState("networkidle");

  // The image 404s, so the button shows the colour name instead of an empty box.
  const hitam = page.getByRole("button", { name: "Warna: Hitam" });
  await expect(hitam).toContainText("Hitam");
  await expect(hitam.locator("img")).toHaveCount(0);
});

test("the matrix grid edits image, weight and the active flag", async ({ page }) => {
  await signIn(page);
  await page.goto(`/dashboard/products/${scenario.product.id}/edit`);
  await page.waitForLoadState("networkidle");

  const target = await prisma.productVariant.findFirstOrThrow({
    where: { productId: scenario.product.id, name: "Putih / L" },
    select: { id: true, name: true },
  });

  await page.getByLabel(`Berat ${target.name}`).fill("320");
  await page.getByLabel(`Gambar ${target.name}`).fill("/uploads/putih-l.jpg");
  await page.getByLabel(`Aktifkan ${target.name}`).uncheck();
  await page.getByRole("button", { name: "Simpan stok & harga" }).click();

  await expect
    .poll(
      async () =>
        prisma.productVariant.findUniqueOrThrow({
          where: { id: target.id },
          select: { weightGrams: true, imageUrl: true, isActive: true },
        }),
      { timeout: 15_000 }
    )
    .toEqual({
      weightGrams: 320,
      imageUrl: "/uploads/putih-l.jpg",
      isActive: false,
    });
});

test("digital products expose variants without inventory limits", async ({ page }) => {
  await prisma.productVariant.deleteMany({
    where: { productId: scenario.product.id },
  });
  await prisma.product.update({
    where: { id: scenario.product.id },
    data: {
      type: "DIGITAL",
      stock: 0,
      variantOptions: [{ name: "Format", values: ["PDF", "Video"] }],
    },
  });
  await prisma.productVariant.createMany({
    data: [
      {
        productId: scenario.product.id,
        name: "PDF",
        sku: `${scenario.id}-PDF`,
        stock: 0,
        options: { Format: "PDF" },
        isActive: true,
        sortOrder: 0,
      },
      {
        productId: scenario.product.id,
        name: "Video",
        sku: `${scenario.id}-VIDEO`,
        stock: 0,
        options: { Format: "Video" },
        isActive: true,
        sortOrder: 1,
      },
    ],
  });

  await signIn(page);
  await page.goto(`/dashboard/products/${scenario.product.id}/edit`);
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("link", { name: "Manage variants" })).toBeVisible();
  await page.getByRole("link", { name: "Manage variants" }).click();
  await expect(page.getByText("Varian digital tersedia tanpa batas stok.")).toBeVisible();
  await expect(page.getByLabel("Stok PDF")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Simpan varian" })).toBeVisible();

  await page.goto(`/site/${scenario.workspace.slug}/products/${scenario.product.slug}`);
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("button", { name: "Format: PDF" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Format: Video" })).toBeEnabled();
  await page.getByRole("button", { name: /add to cart/i }).click();
  await expect(page.getByRole("dialog", { name: /keranjang belanja/i })).toBeVisible();
});
