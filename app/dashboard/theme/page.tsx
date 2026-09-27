import { Menu, PaintBucket, PanelBottom } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { EditorSection } from "@/components/dashboard/editor-shell";
import { resolveCustomLinks } from "@/lib/storefront-nav";
import { PageHeader } from "@/components/dashboard/page-header";
import { ThemeTokensForm } from "@/components/workspaces/theme-tokens-form";
import { parseBuilderDesignTokens } from "@/lib/builder-design-tokens";
import { StorefrontHeaderForm } from "@/components/workspaces/storefront-header-form";
import { StorefrontFooterForm } from "@/components/workspaces/storefront-footer-form";

export const metadata = { title: "Tema · My Landing" };

export default async function ThemePage() {
  const { workspace, role } = await requireCurrentWorkspace();
  const canEdit = canInWorkspace(role, "content.edit");

  const [setting, websites] = await Promise.all([
    prisma.storefrontSetting.findUnique({ where: { workspaceId: workspace.id } }),
    prisma.website.findMany({
      where: { workspaceId: workspace.id },
      select: { designTokens: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Token disimpan per situs tapi diatur bersama; yang pertama mewakili.
  const tokens = parseBuilderDesignTokens(
    websites[0]?.designTokens,
    workspace.primaryColor ?? undefined
  );
  const canEditBranding = canInWorkspace(role, "branding.edit");

  return (
    <div className="w-full min-w-0">
      <PageHeader
        title="Tema"
        description="Warna, tipografi, menu header, dan footer yang berlaku di semua halaman publik."
      />

      <div className="kv-editor flex flex-col gap-[12px]">
        <EditorSection title="Warna, tipografi & bentuk" icon={PaintBucket}>
          <ThemeTokensForm
            tokens={tokens}
            canEdit={canEditBranding}
            websiteCount={websites.length}
          />
        </EditorSection>

        <div className="grid min-w-0 gap-[12px] xl:grid-cols-2">
          <EditorSection
            title="Menu header"
            icon={Menu}
            description="Teks menu navigasi di header semua halaman publik. Kosongkan untuk memakai teks bawaan; menu hanya muncul bila isinya ada."
          >
          <StorefrontHeaderForm
            canEdit={canEdit}
            initial={{
              navBlogLabel: setting?.navBlogLabel ?? "",
              navCoursesLabel: setting?.navCoursesLabel ?? "",
              navProductsLabel: setting?.navProductsLabel ?? "",
              navMembershipsLabel: setting?.navMembershipsLabel ?? "",
              navCartLabel: setting?.navCartLabel ?? "",
              navAccountLabel: setting?.navAccountLabel ?? "",
              navLoginLabel: setting?.navLoginLabel ?? "",
            }}
            initialLinks={resolveCustomLinks(setting)}
          />
          </EditorSection>

          <EditorSection
            title="Footer"
            icon={PanelBottom}
            description="Tampil di bawah semua halaman publik yang tidak punya blok Footer sendiri."
            className="xl:self-start"
          >
          <StorefrontFooterForm
            canEdit={canEdit}
            workspaceName={workspace.name}
            initial={{
              footerEnabled: setting?.footerEnabled ?? false,
              footerText: setting?.footerText ?? "",
              footerCopyright: setting?.footerCopyright ?? "",
            }}
          />
          </EditorSection>
        </div>
      </div>
    </div>
  );
}
