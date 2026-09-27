import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const BUILDER = path.join(process.cwd(), "components", "builder");
const SETTINGS = path.join(BUILDER, "settings");

function read(file: string) {
  return readFileSync(file, "utf8");
}

describe("settings panel stays split", () => {
  const panel = read(path.join(BUILDER, "settings-panel.tsx"));

  it("keeps the dispatcher small enough to read in one sitting", () => {
    // Dulu 4.792 baris berisi 30+ form block dalam satu modul.
    expect(panel.split("\n").length).toBeLessThan(1000);
  });

  it("loads every per-block form on demand", () => {
    const dynamicImports = panel.match(/dynamic\(\(\) => import\(/g) ?? [];
    expect(dynamicImports.length).toBeGreaterThanOrEqual(25);
  });

  it("does not statically import any per-block form", () => {
    // Satu impor statis saja sudah menarik modulnya kembali ke bundel awal.
    const staticFormImport = /^import \{[^}]*Form[^}]*\} from "\.\/settings\//m;
    expect(staticFormImport.test(panel)).toBe(false);
  });

  it("keeps the cross-block forms eager", () => {
    // Style dan Animation berlaku untuk setiap block, jadi memuatnya lazy
    // hanya menambah kedip tanpa menghemat apa pun.
    expect(panel).toContain("function StyleForm(");
    expect(panel).toContain("function AnimationForm(");
  });

  it("gives every block form its own module", () => {
    const modules = readdirSync(SETTINGS).filter((f) => f.endsWith("-form.tsx"));
    expect(modules.length).toBeGreaterThanOrEqual(25);
  });

  it("exports exactly one form component per module", () => {
    for (const file of readdirSync(SETTINGS).filter((f) =>
      f.endsWith("-form.tsx")
    )) {
      const source = read(path.join(SETTINGS, file));
      const exported = source.match(/^export function (\w+)/gm) ?? [];
      expect(exported.length, `${file} mengekspor ${exported.length}`).toBe(1);
    }
  });

  it("routes shared pieces through one module", () => {
    const shared = read(path.join(SETTINGS, "shared.tsx"));
    for (const name of [
      "ALIGN_OPTIONS",
      "BIO_SOCIAL_OPTIONS",
      "BIO_LINK_ICON_OPTIONS",
      "BUTTON_ICON_OPTIONS",
      "BIO_AVATAR_OPTIONS",
      "NavItemsField",
      "NumberSliderField",
      "BioAvatarField",
    ]) {
      expect(shared).toContain(name);
    }
  });

  it("keeps every module a client component", () => {
    for (const file of readdirSync(SETTINGS).filter((f) => f.endsWith(".tsx"))) {
      expect(read(path.join(SETTINGS, file)).startsWith('"use client"')).toBe(
        true
      );
    }
  });
});

describe("bio profile options match what the renderer accepts", () => {
  const shared = read(path.join(SETTINGS, "shared.tsx"));
  const schema = read(path.join(process.cwd(), "lib", "blocks", "schema.ts"));
  const renderer = read(
    path.join(process.cwd(), "components", "blocks", "bio-profile-block.tsx")
  );

  it("offers only platforms the schema allows", () => {
    // Nilai di luar enum ditolak validasi saat halaman disimpan.
    const block = shared.match(
      /BIO_SOCIAL_OPTIONS = \[([\s\S]*?)\] as const;/
    )![1];
    const offered = [...block.matchAll(/value: "(\w*)"/g)].map((m) => m[1]);
    const allowed = schema
      .match(/bioProfileSocialSchema[\s\S]*?\.enum\(\[([\s\S]*?)\]\)/)![1]
      .match(/"(\w+)"/g)!
      .map((v) => v.replace(/"/g, ""));

    expect(offered.length).toBeGreaterThan(10);
    for (const platform of offered) {
      expect(allowed, `platform ${platform}`).toContain(platform);
    }
  });

  it("offers only link icons the renderer can draw", () => {
    const block = shared.match(/BIO_LINK_ICON_OPTIONS = \[([\s\S]*?)\];/)![1];
    const offered = [...block.matchAll(/value: "([\w-]*)"/g)]
      .map((m) => m[1])
      .filter(Boolean);
    const drawable = renderer
      .match(/const LINK_ICONS[\s\S]*?\n\};/)![0]
      .match(/^\s{2}(\w+):/gm)!
      .map((v) => v.trim().replace(":", ""));

    expect(offered.length).toBeGreaterThan(5);
    for (const icon of offered) {
      expect(drawable, `ikon ${icon}`).toContain(icon);
    }
  });
});
