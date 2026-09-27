import { describe, expect, it } from "vitest";

import {
  DEFAULT_BLOCK_ANIMATION,
  hasCustomAnimation,
  isAnimationIdle,
  resolveBlockAnimation,
  resolveBlockMotion,
} from "@/lib/blocks/animation";
import { blockDataSchemas, parseBlockData } from "@/lib/blocks/schema";

describe("resolveBlockAnimation", () => {
  it("falls back to the legacy reveal for blocks saved before the feature", () => {
    expect(resolveBlockAnimation(undefined)).toEqual(DEFAULT_BLOCK_ANIMATION);
    expect(DEFAULT_BLOCK_ANIMATION.preset).toBe("fade-up");
    expect(DEFAULT_BLOCK_ANIMATION.distance).toBe(24);
    expect(DEFAULT_BLOCK_ANIMATION.duration).toBe(0.5);
    expect(DEFAULT_BLOCK_ANIMATION.once).toBe(true);
  });

  it("keeps known fields and defaults the rest", () => {
    const resolved = resolveBlockAnimation({ preset: "zoom-in", delay: 0.4 });
    expect(resolved.preset).toBe("zoom-in");
    expect(resolved.delay).toBe(0.4);
    expect(resolved.easing).toBe("smooth");
  });

  it("rejects out-of-range and unknown values", () => {
    expect(resolveBlockAnimation({ preset: "explode" })).toEqual(
      DEFAULT_BLOCK_ANIMATION
    );
    expect(resolveBlockAnimation({ duration: 99 })).toEqual(
      DEFAULT_BLOCK_ANIMATION
    );
    expect(resolveBlockAnimation("nonsense")).toEqual(DEFAULT_BLOCK_ANIMATION);
  });
});

describe("resolveBlockMotion", () => {
  it("drops every layer under reduced motion", () => {
    const resolved = resolveBlockMotion(
      { preset: "pop", hover: "lift", loop: "float", parallax: 40 },
      { reducedMotion: true }
    );
    expect(resolved).toEqual({
      active: false,
      enter: null,
      hover: null,
      loop: null,
      scroll: null,
    });
  });

  it("is inert when nothing is configured", () => {
    const resolved = resolveBlockMotion({
      preset: "none",
      hover: "none",
      loop: "none",
      parallax: 0,
      scrollFade: false,
    });
    expect(resolved.active).toBe(false);
    expect(resolved.enter).toBeNull();
  });

  it("mirrors only the properties a preset moves", () => {
    const { enter } = resolveBlockMotion({ preset: "fade-up", distance: 40 });
    expect(enter?.initial).toEqual({ opacity: 0, y: 40 });
    expect(enter?.target).toEqual({ opacity: 1, y: 0 });
    expect(enter?.target).not.toHaveProperty("x");
  });

  it("moves in the direction its preset is named after", () => {
    expect(resolveBlockMotion({ preset: "fade-up", distance: 30 }).enter?.initial)
      .toEqual({ opacity: 0, y: 30 });
    expect(
      resolveBlockMotion({ preset: "fade-down", distance: 30 }).enter?.initial
    ).toEqual({ opacity: 0, y: -30 });
    expect(
      resolveBlockMotion({ preset: "fade-left", distance: 30 }).enter?.initial
    ).toEqual({ opacity: 0, x: 30 });
    expect(
      resolveBlockMotion({ preset: "fade-right", distance: 30 }).enter?.initial
    ).toEqual({ opacity: 0, x: -30 });
  });

  it("resets blur and clip-path to their neutral values", () => {
    expect(resolveBlockMotion({ preset: "blur-in" }).enter?.target).toEqual({
      opacity: 1,
      filter: "blur(0px)",
    });
    const reveal = resolveBlockMotion({ preset: "reveal-up" }).enter;
    expect(reveal?.initial.clipPath).toBe("inset(100% 0% 0% 0%)");
    expect(reveal?.target.clipPath).toBe("inset(0% 0% 0% 0%)");
  });

  it("carries perspective through a 3D flip so it does not snap flat", () => {
    const flip = resolveBlockMotion({ preset: "flip-up" }).enter;
    expect(flip?.initial.transformPerspective).toBe(1200);
    expect(flip?.target.transformPerspective).toBe(1200);
    expect(flip?.target.rotateX).toBe(0);
  });

  it("builds a spring transition without a duration", () => {
    const { enter } = resolveBlockMotion({
      preset: "fade",
      easing: "spring",
      delay: 0.2,
      duration: 1.5,
    });
    expect(enter?.transition).toEqual({
      type: "spring",
      stiffness: 120,
      damping: 18,
      delay: 0.2,
    });
    expect(enter?.transition).not.toHaveProperty("duration");
  });

  it("builds a duration transition for curve easings", () => {
    const { enter } = resolveBlockMotion({
      preset: "fade",
      easing: "linear",
      duration: 0.8,
      delay: 0.1,
    });
    expect(enter?.transition).toEqual({
      duration: 0.8,
      delay: 0.1,
      ease: "linear",
    });
  });

  it("plays on scroll by default and on mount when forced", () => {
    expect(resolveBlockMotion({ preset: "fade" }).enter?.onScroll).toBe(true);
    expect(
      resolveBlockMotion({ preset: "fade", trigger: "load" }).enter?.onScroll
    ).toBe(false);
    expect(
      resolveBlockMotion({ preset: "fade" }, { forcePlayOnMount: true }).enter
        ?.onScroll
    ).toBe(false);
  });

  it("passes the viewport threshold through", () => {
    const { enter } = resolveBlockMotion({
      preset: "fade",
      once: false,
      amount: 0.75,
    });
    expect(enter?.viewport).toEqual({ once: false, amount: 0.75 });
  });

  it("loops forever and hovers on its own faster transition", () => {
    const resolved = resolveBlockMotion({ hover: "grow", loop: "pulse" });
    expect(resolved.loop?.target).toEqual({ scale: [1, 1.03, 1] });
    expect(resolved.loop?.transition.repeat).toBe(Infinity);
    expect(resolved.hover?.target).toEqual({ scale: 1.03 });
    expect(resolved.hover?.transition.duration).toBe(0.25);
  });

  it("is active for scroll-linked effects even with no entrance", () => {
    const parallaxOnly = resolveBlockMotion({ preset: "none", parallax: -60 });
    expect(parallaxOnly.active).toBe(true);
    expect(parallaxOnly.enter).toBeNull();
    expect(parallaxOnly.scroll).toEqual({ parallax: -60, fade: false });

    const fadeOnly = resolveBlockMotion({ preset: "none", scrollFade: true });
    expect(fadeOnly.scroll).toEqual({ parallax: 0, fade: true });
  });
});

describe("isAnimationIdle", () => {
  it("is false for the default reveal and true once cleared", () => {
    expect(isAnimationIdle(undefined)).toBe(false);
    expect(isAnimationIdle({ preset: "none" })).toBe(true);
    expect(isAnimationIdle({ preset: "none", hover: "lift" })).toBe(false);
    expect(isAnimationIdle({ preset: "none", parallax: 10 })).toBe(false);
  });
});

describe("hasCustomAnimation", () => {
  it("does not flag blocks left on the default reveal", () => {
    expect(hasCustomAnimation(undefined)).toBe(false);
    expect(hasCustomAnimation({})).toBe(false);
    expect(hasCustomAnimation({ ...DEFAULT_BLOCK_ANIMATION })).toBe(false);
  });

  it("flags any deviation, including turning the animation off", () => {
    expect(hasCustomAnimation({ preset: "none" })).toBe(true);
    expect(hasCustomAnimation({ hover: "lift" })).toBe(true);
    expect(hasCustomAnimation({ duration: 1.2 })).toBe(true);
    expect(hasCustomAnimation({ parallax: 20 })).toBe(true);
  });
});

describe("block schema integration", () => {
  it("gives every block type a motion field with defaults", () => {
    for (const type of Object.keys(blockDataSchemas)) {
      const data = blockDataSchemas[type as keyof typeof blockDataSchemas].parse(
        {}
      ) as { motion?: unknown };
      expect(data.motion, `${type} is missing motion defaults`).toEqual(
        DEFAULT_BLOCK_ANIMATION
      );
    }
  });

  it("backfills motion onto legacy stored block data", () => {
    const parsed = parseBlockData("HERO", { heading: "Legacy hero" }) as {
      heading: string;
      motion: unknown;
    };
    expect(parsed.heading).toBe("Legacy hero");
    expect(parsed.motion).toEqual(DEFAULT_BLOCK_ANIMATION);
  });

  it("leaves the BUTTON block's own animation field untouched", () => {
    const parsed = parseBlockData("BUTTON", { animation: "shine" }) as {
      animation: string;
      motion: unknown;
    };
    expect(parsed.animation).toBe("shine");
    expect(parsed.motion).toEqual(DEFAULT_BLOCK_ANIMATION);
  });
});
