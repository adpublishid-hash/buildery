import "server-only";

import { headers } from "next/headers";

import {
  getPublicWorkspaceSlugFromHost,
  normalizePublicPath,
  publicSiteHref,
} from "@/lib/public-url";

export function publicSiteContextHref(workspaceSlug: string, path = "") {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? null;

  if (getPublicWorkspaceSlugFromHost(host) === workspaceSlug) {
    return normalizePublicPath(path) || "/";
  }

  return publicSiteHref(workspaceSlug, path);
}
