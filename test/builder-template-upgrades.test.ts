import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  auditBuilderPage,
  countCertainWhatsappPlaceholders,
  isCertainWhatsappPlaceholder,
  placeholderKind,
  whatsappFloatIssue,
} from "@/lib/builder-audit";
import {
  BUILDER_TEMPLATES,
  createTemplateBlocks,
} from "@/lib/blocks/templates";
import {
  blockDataSchemas,
  blockTypes,
  pageBlocksSchema,
  parseBlockData,
  type Block,
} from "@/lib/blocks/schema";
import {
  normalizeWhatsappNumber,
  personalizeTemplateBlocks,
} from "@/lib/template-personalize";
import {
  applySiteChrome,
  extractSiteChrome,
  hasFooterBlock,
  planSiteChromeWrite,
  siteChromeFingerprint,
} from "@/lib/site-chrome";

const SETTINGS = { title: "Judul halaman yang cukup", seoTitle: "", metaDescription: "", ogImage: "" };

function block<T extends Block["type"]>(
  type: T,
  data: Record<string, unknown>,
  id: string = type
): Block {
  return { id, type, data: parseBlockData(type, data) } as Block;
}

function ids(issues: { id: string }[]) {
  return issues.map((issue) => issue.id);
}

describe("placeholder WhatsApp numbers", () => {
  it("treats the template's old dummy number as a certain placeholder", () => {
    // Formatnya sah untuk nomor Indonesia dan bisa milik orang sungguhan.
    expect(isCertainWhatsappPlaceholder("https://wa.me/6281234567890")).toBe(true);
  });

  it("treats a non-numeric placeholder as certain", () => {
    expect(isCertainWhatsappPlaceholder("https://wa.me/62XXXXXXXXXX")).toBe(true);
    expect(isCertainWhatsappPlaceholder("https://wa.me/62XXXXXXXXXX?text=Halo")).toBe(true);
  });

  it("leaves a real-looking number alone", () => {
    expect(isCertainWhatsappPlaceholder("https://wa.me/6285712345566")).toBe(false);
    expect(placeholderKind("https://wa.me/6285712345566")).toBeNull();
  });

  it("only warns about suspicious patterns that could still be real", () => {
    expect(placeholderKind("https://wa.me/6281111111111")).toBe("whatsapp-suspect");
  });

  it("does not flag in-page anchors", () => {
    // "#harga" adalah tautan yang sah ke section di halaman yang sama.
    expect(placeholderKind("#harga")).toBeNull();
    expect(placeholderKind("#")).toBe("empty");
  });

  it("flags example domains", () => {
    expect(placeholderKind("https://example.com/beli")).toBe("domain");
  });

  it("reads api.whatsapp.com links without swallowing the query", () => {
    expect(
      isCertainWhatsappPlaceholder("https://api.whatsapp.com/send?phone=6281234567890&text=hai")
    ).toBe(true);
  });
});

describe("WhatsApp float block", () => {
  it("blocks the dummy number and only warns about a missing one", () => {
    expect(whatsappFloatIssue("6281234567890")).toBe("dummy");
    expect(whatsappFloatIssue("081234567890")).toBe("dummy");
    expect(whatsappFloatIssue("")).toBe("missing");
    expect(whatsappFloatIssue("62XXXXXXXXXX")).toBe("missing");
    expect(whatsappFloatIssue("0857 1234 5566")).toBeNull();
  });

  it("counts toward the publish guard only when it would route to a stranger", () => {
    const dummy = block("WHATSAPP_FLOAT", { phone: "6281234567890" });
    const empty = block("WHATSAPP_FLOAT", { phone: "" });
    expect(countCertainWhatsappPlaceholders([dummy])).toBe(1);
    // Tanpa nomor, tombolnya tidak dirender — tidak berbahaya.
    expect(countCertainWhatsappPlaceholders([empty])).toBe(0);
  });
});

describe("auditBuilderPage", () => {
  it("raises an error for a dummy WhatsApp CTA", () => {
    const issues = auditBuilderPage(SETTINGS, [
      block("CTA", { buttonHref: "https://wa.me/6281234567890" }),
    ]);
    const issue = issues.find((item) => item.id === "placeholder-whatsapp");
    expect(issue?.level).toBe("error");
  });

  it("checks the hero image, which the old audit never looked at", () => {
    // Audit lama hanya memeriksa imageUrl/imageAlt. Hero tanpa alt maupun
    // judul dulu dinyatakan lulus.
    const issues = auditBuilderPage(SETTINGS, [
      block("HERO", { mediaUrl: "/uploads/x/hero.jpg", mediaAlt: "", heading: "" }),
    ]);
    expect(ids(issues)).toContain("image-alt");
  });

  it("accepts the heading as the hero's rendered alt text", () => {
    // Renderer memakai heading bila mediaAlt kosong; itu bukan alt yang hilang.
    const issues = auditBuilderPage(SETTINGS, [
      block("HERO", { mediaUrl: "/uploads/x/hero.jpg", mediaAlt: "", heading: "Kopi segar" }),
    ]);
    expect(ids(issues)).not.toContain("image-alt");
  });

  it("checks image and gallery blocks", () => {
    const issues = auditBuilderPage(SETTINGS, [
      block("IMAGE", { url: "/uploads/x/a.jpg", alt: "" }),
    ]);
    expect(ids(issues)).toContain("image-alt");
  });

  it("does not mistake a video embed URL for an image", () => {
    const issues = auditBuilderPage(SETTINGS, [
      block("VIDEO", { url: "https://www.youtube.com/embed/abc123" }),
    ]);
    expect(ids(issues)).not.toContain("image-alt");
  });

  it("calls out schema-default alt text", () => {
    const issues = auditBuilderPage(SETTINGS, [
      block("GALLERY", {
        items: [{ url: "/uploads/x/a.jpg", alt: "Gallery image", title: "", caption: "", href: "", featured: false }],
      }),
    ]);
    expect(ids(issues)).toContain("image-alt-generic");
  });

  it("flags the old demo video default", () => {
    const issues = auditBuilderPage(SETTINGS, [
      block("VIDEO", { url: "https://www.youtube.com/embed/dQw4w9WgXcQ" }),
    ]);
    expect(ids(issues)).toContain("demo-video");
  });

  it("warns when a WhatsApp float has no number", () => {
    const issues = auditBuilderPage(SETTINGS, [block("WHATSAPP_FLOAT", { phone: "" })]);
    expect(ids(issues)).toContain("whatsapp-float-missing");
  });
});

describe("personalizeTemplateBlocks", () => {
  const blocks = [
    block("CTA", { buttonHref: "https://wa.me/62XXXXXXXXXX?text=Halo%20kak" }),
    block("WHATSAPP_FLOAT", { phone: "62XXXXXXXXXX" }),
    block("CTA", { buttonHref: "https://wa.me/6285712345566" }),
  ];

  it("fills placeholders with the workspace's business number", () => {
    const result = personalizeTemplateBlocks(blocks, "0857-9999-8888");
    expect(result.replaced).toBe(2);
    expect(result.remaining).toBe(0);
    expect((result.blocks[0].data as { buttonHref: string }).buttonHref).toBe(
      "https://wa.me/6285799998888?text=Halo%20kak"
    );
    expect((result.blocks[1].data as { phone: string }).phone).toBe("6285799998888");
  });

  it("never touches a number the author already set", () => {
    const result = personalizeTemplateBlocks(blocks, "0857-9999-8888");
    expect((result.blocks[2].data as { buttonHref: string }).buttonHref).toBe(
      "https://wa.me/6285712345566"
    );
  });

  it("reports what is left when the workspace has no number yet", () => {
    const result = personalizeTemplateBlocks(blocks, null);
    expect(result.replaced).toBe(0);
    expect(result.remaining).toBe(2);
  });

  it("normalizes the common Indonesian formats", () => {
    expect(normalizeWhatsappNumber("0812-3456-7899")).toBe("6281234567899");
    expect(normalizeWhatsappNumber("+62 812 3456 7899")).toBe("6281234567899");
    expect(normalizeWhatsappNumber("812 3456 7899")).toBe("6281234567899");
    expect(normalizeWhatsappNumber("12")).toBeNull();
  });
});

describe("site-wide header and footer", () => {
  const shared = parseBlockData("HEADER", { logoText: "Situs", siteWide: true });

  it("shows the shared version in every site-wide block", () => {
    const page = [
      block("HEADER", { logoText: "Salinan lama", siteWide: true }, "h1"),
      block("HEADER", { logoText: "Milik halaman ini", siteWide: false }, "h2"),
    ];
    const applied = applySiteChrome(page, { header: shared, footer: null });
    expect((applied[0].data as { logoText: string }).logoText).toBe("Situs");
    expect((applied[1].data as { logoText: string }).logoText).toBe("Milik halaman ini");
  });

  it("keeps a page's own content when no shared version exists yet", () => {
    const page = [block("HEADER", { logoText: "Pertama", siteWide: true })];
    const applied = applySiteChrome(page, { header: null, footer: null });
    expect((applied[0].data as { logoText: string }).logoText).toBe("Pertama");
  });

  it("extracts only the parts a page actually shares", () => {
    const extracted = extractSiteChrome([
      block("HEADER", { logoText: "A", siteWide: true }),
      block("FOOTER", { brand: "B", siteWide: false }),
    ]);
    expect(extracted.header?.logoText).toBe("A");
    expect(extracted.footer).toBeUndefined();
  });

  it("fingerprints data regardless of key order", () => {
    expect(siteChromeFingerprint({ a: 1, b: [1, { c: 2, d: 3 }] })).toBe(
      siteChromeFingerprint({ b: [1, { d: 3, c: 2 }], a: 1 })
    );
    expect(siteChromeFingerprint(null)).toBeNull();
  });
});

describe("planSiteChromeWrite", () => {
  const v1 = parseBlockData("HEADER", { logoText: "v1", siteWide: true });
  const v2 = parseBlockData("HEADER", { logoText: "v2", siteWide: true });
  const stale = parseBlockData("HEADER", { logoText: "lama", siteWide: true });

  it("does not write when the page did not edit the header", () => {
    // Menulisnya akan menimpa perubahan halaman lain dengan salinan lama.
    const plan = planSiteChromeWrite(
      { header: v1 },
      { header: v1, footer: null },
      { header: siteChromeFingerprint(v1) }
    );
    expect(plan.write.header).toBeUndefined();
    expect(plan.conflicts).toEqual([]);
  });

  it("writes an edit made from the current version", () => {
    const plan = planSiteChromeWrite(
      { header: v2 },
      { header: v1, footer: null },
      { header: siteChromeFingerprint(v1) }
    );
    expect(plan.write.header?.logoText).toBe("v2");
  });

  it("refuses to let a stale tab's autosave revert someone else's change", () => {
    // Tab ini memuat "lama", lalu halaman lain mengubah header situs ke "v2".
    // Autosave tab ini — dipicu edit di bagian lain halaman — tidak boleh
    // mengembalikan header ke "lama".
    const plan = planSiteChromeWrite(
      { header: stale },
      { header: v2, footer: null },
      { header: siteChromeFingerprint(v1) }
    );
    expect(plan.write.header).toBeUndefined();
    expect(plan.conflicts).toEqual(["header"]);
  });

  it("lets the first page become the source", () => {
    const plan = planSiteChromeWrite({ header: v1 }, { header: null, footer: null }, {});
    expect(plan.write.header?.logoText).toBe("v1");
  });
});

describe("footers", () => {
  it("detects when a page brings its own footer", () => {
    expect(hasFooterBlock([block("FOOTER", {})])).toBe(true);
    expect(hasFooterBlock([block("HERO", {})])).toBe(false);
  });

  it("hides duplicate footers with scoped CSS", () => {
    const css = readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");
    expect(css).toContain("body:has([data-bd-page-footer]) [data-bd-store-footer]");
    expect(css).toContain("body:has([data-bd-store-footer]) [data-bd-default-footer]");
  });
});

describe("every built-in template", () => {
  for (const template of BUILDER_TEMPLATES) {
    describe(template.id, () => {
      const blocks = createTemplateBlocks(template.id);
      const json = JSON.stringify(blocks);

      it("matches its metadata and the schema", () => {
        expect(blocks).toHaveLength(template.blockCount);
        expect(pageBlocksSchema.safeParse(blocks).success).toBe(true);
      });

      it("never ships a WhatsApp number that could belong to a stranger", () => {
        const links = json.match(/https?:\/\/(?:wa\.me|api\.whatsapp\.com)[^"\\]*/g) ?? [];
        for (const link of links) {
          const number = link.replace(/\?.*$/, "").replace(/\D/g, "");
          // Placeholder yang pasti tidak bisa dihubungi, atau tidak ada angka sama sekali.
          expect(number.length < 10 || /X/.test(link), link).toBe(true);
        }
      });

      it("hosts every image itself", () => {
        expect(json).not.toContain("images.unsplash.com");
        for (const match of json.matchAll(/"(\/templates\/[^"]+)"/g)) {
          expect(existsSync(path.join(process.cwd(), "public", match[1])), match[1]).toBe(true);
        }
        expect(existsSync(path.join(process.cwd(), "public", template.previewImage))).toBe(true);
      });

      it("never marks its header or footer site-wide", () => {
        // Mengimpor template tidak boleh menimpa header situs milik halaman lain.
        for (const item of blocks) {
          if (item.type === "HEADER" || item.type === "FOOTER") {
            expect((item.data as { siteWide?: boolean }).siteWide ?? false).toBe(false);
          }
        }
      });
    });
  }

  it("puts the use cases the product sells first", () => {
    expect(BUILDER_TEMPLATES.slice(0, 7).map((t) => t.category)).toEqual([
      "Toko UMKM",
      "Produk Digital",
      "Jasa Lokal",
      "Webinar & Event",
      "Link in Bio",
      "Membership",
      "Afiliasi",
    ]);
  });
});

describe("block type registry", () => {
  it("keeps the TypeScript list in step with the Prisma enum", () => {
    // Nilai yang ada di satu sisi saja berarti blok yang tidak bisa disimpan,
    // atau nilai di database yang tidak bisa dirender.
    const schema = readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const enumBody = schema.slice(
      schema.indexOf("enum BlockType {"),
      schema.indexOf("}", schema.indexOf("enum BlockType {"))
    );
    const prismaTypes = [...enumBody.matchAll(/^\s+([A-Z_]+)\s*$/gm)].map((m) => m[1]);
    expect([...prismaTypes].sort()).toEqual([...blockTypes].sort());
  });

  it("gives every type a data schema", () => {
    for (const type of blockTypes) {
      expect(blockDataSchemas[type], type).toBeDefined();
    }
  });

  it("no longer defaults new video blocks to a demo video", () => {
    expect(parseBlockData("VIDEO", {}).url).toBe("");
  });

  it("defaults new image blocks to self-hosted placeholders", () => {
    expect(parseBlockData("IMAGE", {}).url.startsWith("/templates/")).toBe(true);
  });
});
