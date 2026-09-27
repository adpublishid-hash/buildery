import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Published pages are served from a tag-invalidated cache. That is only safe
 * while *every* write path drops the tag — one that forgets serves a shop's old
 * page for the whole TTL, and the merchant sees their edit vanish.
 *
 * Two write paths exist: the builder's API routes and the page server actions.
 * A source assertion catches a new one on the commit that adds it.
 */

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const WRITE_ROUTES = [
  "app/api/dashboard/pages/[pageId]/blocks/route.ts",
  "app/api/dashboard/pages/[pageId]/settings/route.ts",
  "app/api/dashboard/pages/[pageId]/status/route.ts",
  "app/api/dashboard/pages/[pageId]/design-tokens/route.ts",
];

describe("published page cache invalidation", () => {
  it.each(WRITE_ROUTES)("%s drops the page cache", (file) => {
    expect(read(file)).toContain("revalidatePublicPages");
  });

  it("every page action that revalidates the site also drops the cache", () => {
    const source = read("lib/actions/page.ts");
    // The one helper they all call is where the invalidation lives.
    expect(source).toMatch(
      /async function revalidateWorkspaceSite[\s\S]{0,200}revalidatePublicPages/
    );
  });

  it("saving blocks through the action invalidates too, not only the route", () => {
    const source = read("lib/actions/page.ts");
    const action = source.slice(source.indexOf("export async function savePageBlocksAction"));
    const body = action.slice(0, action.indexOf("\n}\n"));
    expect(body).toContain("revalidateWorkspaceSite");
  });

  it("tags the cache by workspace, so one shop's edit never drops another's", () => {
    const source = read("lib/public-page.ts");
    expect(source).toMatch(/return `page:\$\{workspaceId\}`/);
    // Product changes also change what showcase blocks render.
    expect(source).toContain("catalogTag(workspace.id)");
  });

  it("never lets a failed invalidation take a request down with it", () => {
    const source = read("lib/public-page.ts");
    const fn = source.slice(source.indexOf("export function revalidatePublicPages"));
    expect(fn.slice(0, fn.indexOf("\n}\n"))).toContain("catch");
  });
});
