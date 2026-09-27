import Link from "next/link";
import { PenSquare, X } from "lucide-react";

import { requirePageAccess } from "@/lib/website";
import { parseBlockData, type Block } from "@/lib/blocks/schema";
import { resolveIntegratedBlocks } from "@/lib/blocks/integrations";
import { BlockMotion } from "@/components/blocks/block-motion";
import { BlockRenderer } from "@/components/blocks/block-renderer";
import { builderDesignTokenStyle, parseBuilderDesignTokens } from "@/lib/builder-design-tokens";

export const metadata = { title: "Preview · My Landing" };

export default async function PreviewPage({
  params,
}: {
  params: { pageId: string };
}) {
  const { page, workspace } = await requirePageAccess(
    params.pageId,
    "content.view"
  );

  const blocks: Block[] = await resolveIntegratedBlocks(
    page.blocks.map(
      (b) =>
        ({
          id: b.id,
          type: b.type,
          data: parseBlockData(b.type, b.data),
        }) as Block
    ),
    workspace
  );
  const designTokens = parseBuilderDesignTokens(
    page.website.designTokens,
    workspace.primaryColor
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Preview chrome — not part of the page itself */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900 px-4 text-zinc-50">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <span className="rounded bg-zinc-700 px-1.5 py-0.5 font-medium uppercase tracking-wider">
            Preview
          </span>
          <span className="truncate text-zinc-300">
            {page.title} · {page.status.toLowerCase()}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <Link
            href={`/dashboard/pages/${page.id}/builder`}
            className="inline-flex items-center gap-1.5 text-zinc-300 transition-colors hover:text-white"
          >
            <PenSquare className="h-3.5 w-3.5" /> Edit
          </Link>
          <Link
            href="/dashboard/pages"
            className="inline-flex items-center gap-1.5 text-zinc-300 transition-colors hover:text-white"
          >
            <X className="h-3.5 w-3.5" /> Close
          </Link>
        </div>
      </div>

      {/* Rendered page */}
      <div
        className="flex-1 overflow-y-auto"
        style={
          {
            ...builderDesignTokenStyle(designTokens),
            ["--bd-accent" as string]: designTokens.accentColor,
          } as React.CSSProperties
        }
      >
        {blocks.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div>
              <p className="text-sm font-medium text-zinc-900">
                This page has no blocks yet
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Open the builder to add content.
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-white">
            {blocks.map((block) => (
              <BlockMotion
                key={block.id}
                animation={(block.data as { motion?: unknown }).motion}
              >
                <BlockRenderer block={block} />
              </BlockMotion>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
