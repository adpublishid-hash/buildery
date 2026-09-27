"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  LayoutTemplate,
  MousePointer2,
  Sparkles,
  Trash2,
  GripVertical,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import type { Block } from "@/lib/blocks/schema";
import type { PreviewDevice } from "./page-builder";
import { BLOCK_REGISTRY } from "@/lib/blocks/registry";
import { hasCustomAnimation } from "@/lib/blocks/animation";
import { BlockMotion } from "@/components/blocks/block-motion";
import { BlockRenderer } from "@/components/blocks/block-renderer";
import { cn } from "@/lib/utils";
import type { BuilderDesignTokens } from "@/lib/builder-design-tokens";
import { builderDesignTokenStyle } from "@/lib/builder-design-tokens";
import {
  darkModeAttribute,
  darkModeCss,
  darkModeVariables,
} from "@/lib/builder-dark-mode";

type Props = {
  blocks: Block[];
  selectedId: string | null;
  accentColor?: string;
  designTokens: BuilderDesignTokens;
  previewDevice: PreviewDevice;
  /**
   * Bumped by the topbar / animation tab to replay block entrances in the
   * canvas. While it is 0 the canvas renders blocks statically so editing
   * never fights an animation.
   */
  animationReplayToken?: number;
  onSelect: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onReorder: (draggedId: string, targetId: string, position: "before" | "after") => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
};

export function Canvas({
  blocks,
  selectedId,
  accentColor,
  designTokens,
  previewDevice,
  animationReplayToken = 0,
  onSelect,
  onMove,
  onReorder,
  onDuplicate,
  onRemove,
}: Props) {
  const darkCss = darkModeCss(designTokens);
  const reduce = useReducedMotion();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: "before" | "after" } | null>(null);

  return (
    <div className="h-full overflow-y-auto bg-zinc-100 p-4 dark:bg-zinc-900 md:p-6">
      <div className="mb-3 flex items-center justify-center">
        <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-medium text-zinc-500 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
          {previewDevice === "desktop"
            ? "Desktop 1200px"
            : previewDevice === "tablet"
              ? "Tablet 768px"
              : "Mobile 390px"}
        </span>
      </div>
      <div
        className={cn(
          "bd-design-surface mx-auto min-h-[420px] overflow-hidden border border-zinc-200 bg-white shadow-sm transition-all duration-200 dark:border-zinc-800",
          previewDevice === "desktop" && "w-full max-w-[1200px] rounded-xl",
          previewDevice === "tablet" && "w-[768px] max-w-full rounded-[22px]",
          previewDevice === "mobile" && "w-[390px] max-w-full rounded-[28px]",
          previewDevice === "tablet" && "bd-preview-tablet",
          previewDevice === "mobile" && "bd-preview-mobile"
        )}
        data-bd-scheme={darkModeAttribute(designTokens)}
        data-bd-editor=""
        style={{
          ...builderDesignTokenStyle(designTokens),
          ...darkModeVariables(designTokens),
          ["--bd-accent" as string]: designTokens.accentColor || accentColor || "#18181b",
        } as React.CSSProperties}
      >
        {/* Kanvas memakai aturan yang sama dengan halaman publik, supaya mode
            gelap terlihat apa adanya saat diedit. */}
        {darkCss ? <style dangerouslySetInnerHTML={{ __html: darkCss }} /> : null}
        {blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800">
              <LayoutTemplate className="h-6 w-6 text-zinc-400" />
            </div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              Empty page
            </p>
            <p className="mt-1 max-w-xs text-xs text-zinc-500 dark:text-zinc-400">
              Add blocks from the left panel to start building your landing
              page.
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false} mode="popLayout">
            {blocks.map((block, index) => {
              const selected = block.id === selectedId;
              const meta = BLOCK_REGISTRY[block.type];
              const animated = hasCustomAnimation(
                (block.data as { motion?: unknown }).motion
              );
              return (
                <motion.div
                  key={block.id}
                  // `position` keeps iframes and videos from remounting while
                  // a reorder animates.
                  layout={reduce ? false : "position"}
                  initial={reduce ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? undefined : { opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                  onClick={() => onSelect(block.id)}
                  onDragOver={(event) => {
                    if (!draggedId || draggedId === block.id) return;
                    event.preventDefault();
                    const rect = event.currentTarget.getBoundingClientRect();
                    setDropTarget({
                      id: block.id,
                      position: event.clientY < rect.top + rect.height / 2 ? "before" : "after",
                    });
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (draggedId && dropTarget) {
                      onReorder(draggedId, dropTarget.id, dropTarget.position);
                    }
                    setDraggedId(null);
                    setDropTarget(null);
                  }}
                  className={cn(
                    "group relative cursor-pointer border-b border-zinc-100 transition-shadow last:border-b-0 dark:border-zinc-800/60",
                    selected && "ring-2 ring-inset ring-zinc-900 dark:ring-zinc-100",
                    dropTarget?.id === block.id && dropTarget.position === "before" && "border-t-2 border-t-blue-500",
                    dropTarget?.id === block.id && dropTarget.position === "after" && "border-b-2 border-b-blue-500"
                  )}
                >
                  {/* Block label */}
                  <span
                    className={cn(
                      "pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-1 rounded-md bg-zinc-900 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white opacity-0 transition-opacity group-hover:opacity-100",
                      selected && "opacity-100"
                    )}
                  >
                    {meta.label}
                    {animated ? (
                      <Sparkles
                        className="h-2.5 w-2.5 text-amber-300"
                        aria-label="Animasi block ini sudah diubah"
                      />
                    ) : null}
                  </span>

                  {/* Toolbar */}
                  <div
                    className={cn(
                      "absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-white p-0.5 shadow-sm opacity-0 transition-opacity group-hover:opacity-100 dark:border-zinc-700 dark:bg-zinc-900",
                      selected && "opacity-100"
                    )}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span
                      draggable
                      role="button"
                      tabIndex={0}
                      aria-label="Drag to reorder block"
                      title="Drag to reorder"
                      onDragStart={(event) => {
                        setDraggedId(block.id);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", block.id);
                      }}
                      onDragEnd={() => {
                        setDraggedId(null);
                        setDropTarget(null);
                      }}
                      className="flex h-6 w-6 cursor-grab items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 active:cursor-grabbing dark:hover:bg-zinc-800"
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                    </span>
                    {block.type === "CUSTOM_HTML" ? (
                      <ToolbarButton
                        label="Edit imported HTML"
                        onClick={() => onSelect(block.id)}
                      >
                        <MousePointer2 className="h-3.5 w-3.5" />
                      </ToolbarButton>
                    ) : null}
                    <ToolbarButton
                      label="Move up"
                      disabled={index === 0}
                      onClick={() => onMove(block.id, "up")}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </ToolbarButton>
                    <ToolbarButton
                      label="Move down"
                      disabled={index === blocks.length - 1}
                      onClick={() => onMove(block.id, "down")}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </ToolbarButton>
                    <ToolbarButton
                      label="Duplicate block"
                      onClick={() => onDuplicate(block.id)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </ToolbarButton>
                    <ToolbarButton
                      label="Delete block"
                      onClick={() => onRemove(block.id)}
                      danger
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </ToolbarButton>
                  </div>

                  <BlockMotion
                    animation={(block.data as { motion?: unknown }).motion}
                    replayToken={animationReplayToken}
                    disabled={animationReplayToken === 0}
                  >
                    <BlockRenderer block={block} previewDevice={previewDevice} />
                  </BlockMotion>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

function ToolbarButton({
  children,
  label,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-zinc-800",
        danger && "hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
      )}
    >
      {children}
    </button>
  );
}
