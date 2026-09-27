import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  parseBlockData,
  parseBlockDataWithReport,
  type Block,
} from "@/lib/blocks/schema";
import { protectWhatsappPlaceholders } from "@/lib/template-personalize";

describe("parseBlockData keeps valid content when one field is invalid", () => {
  it("resets only the invalid field", () => {
    // Dulu satu nilai enum yang salah mengembalikan seluruh blok ke default,
    // dan autosave builder lalu menulis default itu ke database.
    const result = parseBlockDataWithReport("CTA", {
      heading: "Isi asli pelanggan",
      buttonLabel: "Beli sekarang",
      layout: "tidak-ada",
    });
    expect(result.data.heading).toBe("Isi asli pelanggan");
    expect(result.data.buttonLabel).toBe("Beli sekarang");
    expect(result.data.layout).toBe(parseBlockData("CTA", {}).layout);
    expect(result.repaired).toEqual(["layout"]);
  });

  it("repairs one bad field inside a list without losing the other items", () => {
    const result = parseBlockDataWithReport("GALLERY", {
      heading: "Galeri",
      items: [
        { url: "/a.jpg", alt: "A", title: "", caption: "", href: "", featured: false },
        { url: "/b.jpg", alt: "B", title: "", caption: "", href: "", featured: "ya" },
        { url: "/c.jpg", alt: "C", title: "", caption: "", href: "", featured: true },
      ],
    });
    expect(result.data.items.map((item) => item.alt)).toEqual(["A", "B", "C"]);
    expect(result.data.items[1].featured).toBe(false);
    expect(result.data.items[2].featured).toBe(true);
    expect(result.repaired).toEqual(["items.1.featured"]);
  });

  it("truncates a list that is too long instead of replacing it", () => {
    const result = parseBlockDataWithReport("TABS", {
      heading: "Layanan",
      tabs: Array.from({ length: 11 }, (_, i) => ({ label: `Tab ${i + 1}` })),
    });
    expect(result.data.tabs).toHaveLength(8);
    expect(result.data.tabs[0].label).toBe("Tab 1");
    expect(result.data.heading).toBe("Layanan");
  });

  it("repairs an invalid union value", () => {
    const result = parseBlockDataWithReport("FEATURE_GRID", {
      heading: "Fitur unggulan",
      columns: 7,
    });
    expect(result.data.heading).toBe("Fitur unggulan");
    expect([2, 3, 4]).toContain(result.data.columns);
  });

  it("reports nothing for valid data", () => {
    expect(parseBlockDataWithReport("CTA", { heading: "Valid" }).repaired).toEqual([]);
  });

  it("still falls back to defaults for data that is not an object at all", () => {
    const result = parseBlockDataWithReport("CTA", "rusak");
    expect(result.repaired).toEqual(["*"]);
    expect(result.data).toEqual(parseBlockData("CTA", {}));
  });

  it("does not mutate the stored value it was given", () => {
    const raw = { heading: "Asli", layout: "tidak-ada" };
    parseBlockDataWithReport("CTA", raw);
    expect(raw).toEqual({ heading: "Asli", layout: "tidak-ada" });
  });

  it("records repairs on the server paths that load stored blocks", () => {
    // Kehilangan data harus meninggalkan jejak di /admin/errors.
    for (const file of [
      ["lib", "public-page.ts"],
      ["app", "dashboard", "pages", "[pageId]", "builder", "page.tsx"],
    ]) {
      const source = readFileSync(path.join(process.cwd(), ...file), "utf8");
      expect(source, file.join("/")).toContain("parseBlockDataWithReport");
      expect(source, file.join("/")).toContain("stored block data repaired");
    }
  });
});

function block(type: Block["type"], data: Record<string, unknown>) {
  return { id: type, type, data: parseBlockData(type, data) } as Block;
}

describe("protectWhatsappPlaceholders on live pages", () => {
  const live = [
    block("CTA", { buttonHref: "https://wa.me/6281234567890?text=Halo" }),
    block("WHATSAPP_FLOAT", { phone: "6281234567890" }),
    block("CTA", { buttonHref: "https://wa.me/6285712345566" }),
  ];

  it("routes old dummy links to the business number when one is set", () => {
    const result = protectWhatsappPlaceholders(live, "0857-9999-8888");
    expect((result.blocks[0].data as { buttonHref: string }).buttonHref).toBe(
      "https://wa.me/6285799998888?text=Halo"
    );
    expect((result.blocks[1].data as { phone: string }).phone).toBe("6285799998888");
    expect(result.neutralized).toBe(0);
  });

  it("disables them when there is no business number yet", () => {
    // Tombol mati jauh lebih baik daripada chat pembeli yang terkirim ke
    // orang asing.
    const result = protectWhatsappPlaceholders(live, null);
    expect((result.blocks[0].data as { buttonHref: string }).buttonHref).toBe("#");
    expect((result.blocks[1].data as { phone: string }).phone).toBe("");
    expect(result.neutralized).toBeGreaterThan(0);
    expect(JSON.stringify(result.blocks)).not.toContain("6281234567890");
  });

  it("never touches a real number", () => {
    for (const number of [null, "0857-9999-8888"]) {
      const result = protectWhatsappPlaceholders(live, number);
      expect((result.blocks[2].data as { buttonHref: string }).buttonHref).toBe(
        "https://wa.me/6285712345566"
      );
    }
  });

  it("leaves blocks without placeholders exactly as they were", () => {
    const clean = [block("CTA", { buttonHref: "/products" })];
    expect(protectWhatsappPlaceholders(clean, null).blocks).toEqual(clean);
  });
});
