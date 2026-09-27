"use client";

import { useRef } from "react";
import {
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useTransform,
  type Target,
  type TargetAndTransition,
  type Transition,
} from "motion/react";

import { resolveBlockMotion } from "@/lib/blocks/animation";

// `lib/blocks/animation` stays free of Motion imports so it can run on the
// server and in Node tests, so its plain records are narrowed here instead.
const target = (value: Record<string, unknown>) => value as TargetAndTransition;
const initialTarget = (value: Record<string, unknown>) => value as Target;
const transition = (value: Record<string, unknown>) => value as Transition;

type Props = {
  /** Raw `data.animation` from the block. Missing/partial data is fine. */
  animation: unknown;
  children: React.ReactNode;
  className?: string;
  /**
   * Play the entrance on mount instead of on scroll, and remount whenever the
   * value changes. The builder bumps this to replay an animation on demand.
   */
  replayToken?: number;
  /** Skip every layer - used by the canvas until the user hits replay. */
  disabled?: boolean;
};

/**
 * Wraps one block in the Motion layers its animation settings call for.
 *
 * Each layer only exists when it is actually used, so a block with no
 * animation renders a single plain `<div>` and ships no animation work:
 *
 *   scroll (parallax / scroll fade)
 *     └ enter (preset, on mount or on viewport entry)
 *         └ hover
 *             └ loop (ambient, infinite)
 */
export function BlockMotion({
  animation,
  children,
  className,
  replayToken = 0,
  disabled = false,
}: Props) {
  const reducedMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  // Hooks must run on every render, so the scroll values are always created
  // and simply left unused when the block has no scroll-linked effect.
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const resolved = resolveBlockMotion(animation, {
    reducedMotion: Boolean(reducedMotion) || disabled,
    forcePlayOnMount: replayToken > 0,
  });
  const enterViewport = resolved.enter?.viewport;
  // Observe the unclipped container. Observing the animated element itself can
  // deadlock reveal presets because their initial clip-path has no visible area.
  const isInView = useInView(ref, {
    once: enterViewport?.once ?? true,
    amount: enterViewport?.amount ?? 0.2,
  });

  const parallax = resolved.scroll?.parallax ?? 0;
  const parallaxY = useTransform(
    scrollYProgress,
    [0, 1],
    [parallax, -parallax]
  );
  const scrollOpacity = useTransform(
    scrollYProgress,
    [0, 0.22, 0.78, 1],
    [0.25, 1, 1, 0.25]
  );

  if (!resolved.active) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  let content = children;

  if (resolved.loop) {
    content = (
      <motion.div
        animate={target(resolved.loop.target)}
        transition={transition(resolved.loop.transition)}
      >
        {content}
      </motion.div>
    );
  }

  if (resolved.hover) {
    content = (
      <motion.div
        whileHover={target(resolved.hover.target)}
        transition={transition(resolved.hover.transition)}
      >
        {content}
      </motion.div>
    );
  }

  if (resolved.enter) {
    const enter = resolved.enter;
    const visible = target(enter.target);
    const hidden = initialTarget(enter.initial);
    const enterTransition = transition(enter.transition);
    content = enter.onScroll ? (
      <motion.div
        key={replayToken}
        initial={hidden}
        animate={isInView ? visible : hidden}
        transition={enterTransition}
      >
        {content}
      </motion.div>
    ) : (
      <motion.div
        key={replayToken}
        initial={hidden}
        animate={visible}
        transition={enterTransition}
      >
        {content}
      </motion.div>
    );
  }

  if (resolved.scroll) {
    return (
      <motion.div
        ref={ref}
        className={className}
        style={{
          y: parallax !== 0 ? parallaxY : undefined,
          opacity: resolved.scroll.fade ? scrollOpacity : undefined,
          willChange: "transform",
        }}
      >
        {content}
      </motion.div>
    );
  }

  return (
    <div ref={ref} className={className}>
      {content}
    </div>
  );
}
