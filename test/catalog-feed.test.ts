import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  setting: vi.fn(),
  products: vi.fn(),
  uploads: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ecommerceSetting: { findUnique: db.setting },
    product: { findMany: db.products },
    uploadFile: { findMany: db.uploads },
  },
}));

import { buildCatalogFeed, renderCatalogFeedXml } from "@/lib/catalog-feed";

const workspace = { id: "ws_1", slug: "tokoku", name: "Toko & Co" };
const CONTROL_CHAR = String.fromCharCode(1);

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: "prod_1",
    name: "Kaos Polos",
    slug: "kaos-polos",
    description: "<p>Katun <strong>premium</strong></p>",
    type: "PHYSICAL",
    price: 150000,
    discountPrice: 120000,
    stock: 5,
    sku: "KP-1",
    galleryImageIds: ["img_2"],
    image: { url: "/uploads/ws_1/kaos.png" },
    category: { name: "Pakaian" },
    variants: [],
    ...overrides,
  };
}

describe("catalog feed", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://landing.my.id");
    db.setting.mockResolvedValue({ currencyCode: "IDR" });
    db.uploads.mockResolvedValue([{ id: "img_2", url: "/uploads/ws_1/kaos-2.png" }]);
  });

  it("lists a product without variants under its own id, with absolute URLs", async () => {
    db.products.mockResolvedValue([product()]);

    const feed = await buildCatalogFeed(workspace);

    expect(feed.items).toEqual([
      expect.objectContaining({
        id: "prod_1",
        itemGroupId: null,
        title: "Kaos Polos",
        description: "Katun premium",
        link: "https://tokoku.landing.my.id/products/kaos-polos",
        imageLink: "https://tokoku.landing.my.id/uploads/ws_1/kaos.png",
        additionalImageLinks: ["https://tokoku.landing.my.id/uploads/ws_1/kaos-2.png"],
        availability: "in stock",
        price: "150000.00 IDR",
        salePrice: "120000.00 IDR",
        brand: "Toko & Co",
        productType: "Pakaian",
      }),
    ]);
  });

  it("lists each variant under its own id, grouped by the product id", async () => {
    db.products.mockResolvedValue([
      product({
        discountPrice: null,
        variants: [
          {
            id: "var_m",
            name: "M / Hitam",
            sku: "KP-M",
            price: 160000,
            discountPrice: null,
            stock: 0,
            options: { Ukuran: "M", Warna: "Hitam" },
            imageUrl: null,
            image: { url: "/uploads/ws_1/hitam.png" },
          },
          {
            id: "var_l",
            name: "L",
            sku: null,
            price: null,
            discountPrice: 140000,
            stock: 3,
            options: {},
            imageUrl: null,
            image: null,
          },
        ],
      }),
    ]);

    const feed = await buildCatalogFeed(workspace);

    expect(feed.items.map((item) => [item.id, item.itemGroupId])).toEqual([
      ["var_m", "prod_1"],
      ["var_l", "prod_1"],
    ]);
    expect(feed.items[0]).toMatchObject({
      title: "Kaos Polos - M / Hitam",
      link: "https://tokoku.landing.my.id/products/kaos-polos?variant=var_m",
      imageLink: "https://tokoku.landing.my.id/uploads/ws_1/hitam.png",
      availability: "out of stock",
      price: "160000.00 IDR",
      size: "M",
      color: "Hitam",
      sku: "KP-M",
    });
    // A variant without its own image or price falls back to the product's.
    expect(feed.items[1]).toMatchObject({
      imageLink: "https://tokoku.landing.my.id/uploads/ws_1/kaos.png",
      price: "150000.00 IDR",
      salePrice: "140000.00 IDR",
      sku: "KP-1",
    });
  });

  it("skips products without any image, and says how many", async () => {
    db.products.mockResolvedValue([
      product({ id: "no_img", image: null }),
      product({ id: "digital", type: "DIGITAL", stock: 0 }),
    ]);

    const feed = await buildCatalogFeed(workspace);

    expect(feed.skippedWithoutImage).toBe(1);
    expect(feed.items.map((item) => item.id)).toEqual(["digital"]);
    // Digital goods never run out.
    expect(feed.items[0].availability).toBe("in stock");
  });

  it("renders valid Google Merchant RSS with escaped text", async () => {
    db.products.mockResolvedValue([
      product({ name: `Kaos <Edisi> "Spesial" & Co${CONTROL_CHAR}` }),
    ]);
    const xml = renderCatalogFeedXml(workspace, await buildCatalogFeed(workspace));

    expect(xml).toContain('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">');
    expect(xml).toContain("<g:id>prod_1</g:id>");
    expect(xml).toContain(
      "<g:title>Kaos &lt;Edisi&gt; &quot;Spesial&quot; &amp; Co</g:title>"
    );
    expect(xml).toContain("<title>Toko &amp; Co</title>");
    expect(xml).toContain("<g:condition>new</g:condition>");
    expect(xml).not.toContain(CONTROL_CHAR);
  });

  it("uses local app URLs in development", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    db.products.mockResolvedValue([product()]);
    const feed = await buildCatalogFeed(workspace);
    expect(feed.items[0].link).toBe("http://localhost:3000/site/tokoku/products/kaos-polos");
    expect(feed.items[0].imageLink).toBe("http://localhost:3000/uploads/ws_1/kaos.png");
  });
});
