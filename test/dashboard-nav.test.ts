import { describe, expect, it } from "vitest";

import { dashboardNav } from "@/components/dashboard/nav-config";
import { locateInNav } from "@/components/dashboard/nav-locate";

function where(url: string) {
  const [pathname, query = ""] = url.split("?");
  const loc = locateInNav(pathname, new URLSearchParams(query));
  return loc ? [loc.item.label, loc.child?.label ?? null] : null;
}

describe("dashboard nav location", () => {
  it("places pages inside their business group", () => {
    expect(where("/dashboard/products")).toEqual(["eCommerce", "Products"]);
    expect(where("/dashboard/orders/cmabc123def456ghi789jkl")).toEqual(["eCommerce", "Orders"]);
    expect(where("/dashboard/blog")).toEqual(["Content", "Posts"]);
    expect(where("/dashboard/media")).toEqual(["Content", "Media"]);
    expect(where("/dashboard/membership/plans")).toEqual(["LMS", "Membership"]);
  });

  it("picks the most specific child when paths nest", () => {
    expect(where("/dashboard/payments")).toEqual(["Payments", "Transactions"]);
    expect(where("/dashboard/payments/tax")).toEqual(["Payments", "Tax report"]);
    expect(where("/dashboard/analytics/campaigns")).toEqual(["Analytics", "Ad campaigns"]);
  });

  it("matches standalone tools and the overview exactly", () => {
    expect(where("/dashboard")).toEqual(["Overview", null]);
    expect(where("/dashboard/affiliate/payouts")).toEqual(["Affiliates", null]);
    expect(where("/dashboard/forms")).toEqual(["Forms", null]);
  });

  it("routes each settings tab to the entry that owns it", () => {
    expect(where("/dashboard/settings")).toEqual(["Settings", "General"]);
    expect(where("/dashboard/settings?tab=umum")).toEqual(["Settings", "General"]);
    expect(where("/dashboard/settings?tab=ecommerce")).toEqual(["eCommerce", "Settings"]);
    expect(where("/dashboard/settings?tab=sales-notif")).toEqual(["Notifications", null]);
    expect(where("/dashboard/settings?tab=anggota")).toEqual(["Settings", null]);
    expect(where("/dashboard/settings/integrations")).toEqual(["Integrations", null]);
    expect(where("/dashboard/users")).toEqual(["Settings", "Team"]);
  });

  it("gives every entry a unique href within its group", () => {
    for (const section of dashboardNav) {
      const top = section.items.map((item) => item.href);
      expect(new Set(top).size).toBe(top.length);
      for (const item of section.items) {
        const children = (item.children ?? []).map((child) => child.href);
        expect(new Set(children).size).toBe(children.length);
      }
    }
  });
});
