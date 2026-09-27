import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { STOREFRONT_PAGES, type StorefrontPageKey } from "@/lib/storefront-content";
import { StorefrontContentForm } from "./storefront-content-form";

/** Renders one settings card per storefront page key (catalog/single). */
export async function StorefrontSettingsCards({
  workspaceId,
  canEdit,
  pageKeys,
}: {
  workspaceId: string;
  canEdit: boolean;
  pageKeys: StorefrontPageKey[];
}) {
  const rows = await prisma.storefrontPageContent.findMany({
    where: { workspaceId, pageKey: { in: pageKeys } },
  });
  const byKey = new Map(
    rows.map((r) => [r.pageKey, (r.content as Record<string, unknown>) ?? {}])
  );

  return (
    <>
      {pageKeys.map((pk) => {
        const def = STOREFRONT_PAGES[pk];
        const content = byKey.get(pk) ?? {};
        const initial: Record<string, string> = {};
        for (const f of def.fields) {
          const v = content[f.key];
          initial[f.key] = typeof v === "string" ? v : "";
        }
        return (
          <Card key={pk}>
            <CardHeader>
              <CardTitle>{def.title}</CardTitle>
              <CardDescription>{def.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <StorefrontContentForm
                pageKey={pk}
                initial={initial}
                canEdit={canEdit}
              />
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}
