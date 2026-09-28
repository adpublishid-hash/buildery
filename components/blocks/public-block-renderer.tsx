import Link from "next/link";
import dynamic from "next/dynamic";

import type { Block } from "@/lib/blocks/schema";
import { hasCustomAnimation } from "@/lib/blocks/animation";
import { isBlockHidden } from "@/lib/blocks/style";
import { BlockRenderer } from "./block-renderer";
import { hasFooterBlock } from "@/lib/site-chrome";

/**
 * Motion is ~119 kB of JavaScript, and it was on every published page whether
 * or not a single block animated — landing pages, the ones ads point at, paid
 * for a library they never used. Loaded on demand, a page with no animation
 * never references the chunk at all.
 */
const BlockMotion = dynamic(() =>
  import("./block-motion").then((module) => module.BlockMotion)
);
import type { BuilderDesignTokens } from "@/lib/builder-design-tokens";
import { builderDesignTokenStyle, parseBuilderDesignTokens } from "@/lib/builder-design-tokens";
import {
  darkModeAttribute,
  darkModeCss,
  darkModeVariables,
} from "@/lib/builder-dark-mode";

type Props = {
  blocks: Block[];
  accentColor?: string;
  workspaceName: string;
  designTokens?: BuilderDesignTokens;
};

/**
 * Renders a full published page: the ordered blocks plus a minimal footer.
 * The workspace accent color is exposed to blocks via the `--bd-accent`
 * CSS variable.
 */
export function PublicBlockRenderer({
  blocks: allBlocks,
  accentColor,
  workspaceName,
  designTokens,
}: Props) {
  // Blocks hidden in the builder are drafts: they never reach visitors, and a
  // hidden Footer block must not suppress the default footer either.
  const blocks = allBlocks.filter((block) => !isBlockHidden(block.data));
  const tokens = designTokens ?? parseBuilderDesignTokens(null, accentColor);
  const darkCss = darkModeCss(tokens);
  // Halaman yang membawa blok Footer sendiri tidak butuh footer tambahan.
  // Dulu footer bawaan ini selalu ikut dirender, jadi halaman dari template
  // tampil dengan dua footer bertumpuk.
  const pageHasFooter = hasFooterBlock(blocks);
  return (
    <div
      className="bd-design-surface min-h-screen"
      data-bd-scheme={darkModeAttribute(tokens)}
      data-bd-page-footer={pageHasFooter ? "" : undefined}
      style={
        {
          ...builderDesignTokenStyle(tokens),
          ...darkModeVariables(tokens),
          ["--bd-accent" as string]: tokens.accentColor || accentColor || "#18181b",
        } as React.CSSProperties
      }
    >
      {/* Aturannya disuntik di sini, bukan di stylesheet global: setiap situs
          punya warna gelapnya sendiri, dan situs bermode terang tidak ikut
          membayar CSS yang tidak dipakainya. */}
      {darkCss ? <style dangerouslySetInnerHTML={{ __html: darkCss }} /> : null}

      <main>
        {blocks.length === 0 ? (
          <div className="flex min-h-[60vh] items-center justify-center px-6 text-center">
            <div>
              <p className="text-sm font-medium text-zinc-900">
                This page is empty
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                No content has been published here yet.
              </p>
            </div>
          </div>
        ) : (
          blocks.map((block) => {
            const animation = (block.data as { motion?: unknown }).motion;
            // Sticky only works on the element whose parent is <main>, so an
            // animated block moves it onto the animation wrapper.
            const sticky = Boolean(block.data.style?.sticky);
            // A block left on the defaults renders as plain markup, so the
            // animation runtime is never pulled in for it.
            return hasCustomAnimation(animation) ? (
              <BlockMotion
                key={block.id}
                animation={animation}
                className={sticky ? "bd-block-sticky" : undefined}
              >
                <BlockRenderer block={block} />
              </BlockMotion>
            ) : (
              <BlockRenderer key={block.id} block={block} />
            );
          })
        )}
      </main>

      {pageHasFooter ? null : (
      <footer data-bd-default-footer="" className="border-t border-zinc-100 px-6 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 text-xs text-zinc-400 sm:flex-row">
          <span>
            © {new Date().getFullYear()} {workspaceName}
          </span>
          <Link
            href="/"
            className="transition-colors hover:text-zinc-600"
            target="_blank"
          >
            Made with My Landing
          </Link>
        </div>
      </footer>
      )}
    </div>
  );
}
