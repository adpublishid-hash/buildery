import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Published landing pages are the pages a shop points its ads at, and they used
 * to carry ~120 kB (39 kB gzipped) of animation runtime whether or not a single
 * block animated — pulled in by a two-pixel progress bar in the root layout.
 *
 * These are source assertions rather than bundle measurements: they fail on the
 * commit that reintroduces the import, which is when it is cheap to fix, and
 * they need no build to run.
 */

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const ANIMATION_IMPORT = /from\s+["'](motion\/react|framer-motion)["']/;

describe("root layout weight", () => {
  it("keeps the animation library out of the progress bar", () => {
    const source = read("components/ui/route-progress.tsx");
    // It renders on every route in the app, public pages included.
    expect(source).not.toMatch(ANIMATION_IMPORT);
  });

  it("keeps the animation library out of everything the root layout renders", () => {
    const layout = read("app/layout.tsx");
    const imported = [...layout.matchAll(/from\s+"@\/(components\/[^"]+)"/g)].map(
      (match) => match[1]
    );

    for (const module of imported) {
      const source = read(`${module}.tsx`);
      expect(
        source,
        `${module} pulls an animation library into every page in the app`
      ).not.toMatch(ANIMATION_IMPORT);
    }
  });
});

describe("published page renderer", () => {
  it("loads the animation wrapper on demand, not with the page", () => {
    const source = read("components/blocks/public-block-renderer.tsx");
    // A static import would put the runtime on every page again.
    expect(source).not.toMatch(/import\s+\{\s*BlockMotion\s*\}\s+from/);
    expect(source).toMatch(/dynamic\(\s*\(\)\s*=>\s*import\("\.\/block-motion"\)/);
  });

  it("only wraps blocks that actually animate", () => {
    const source = read("components/blocks/public-block-renderer.tsx");
    expect(source).toContain("hasCustomAnimation");
  });
});
