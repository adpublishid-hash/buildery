import { z } from "zod";

// ============================================================
// Block animation
//
// A small, serialisable description of how a block enters, reacts
// to hover, idles, and responds to scroll. Kept free of any React or
// Motion imports so it can be parsed on the server, validated by the
// blocks API, and unit-tested in a plain Node environment.
//
// `resolveBlockMotion()` turns that description into the concrete props
// `<BlockMotion>` hands to Motion (motion.dev/docs/react).
// ============================================================

/** Entrance presets. The name describes the direction of travel. */
export const ANIMATION_PRESETS = [
  "none",
  "fade",
  "fade-up",
  "fade-down",
  "fade-left",
  "fade-right",
  "zoom-in",
  "zoom-out",
  "blur-in",
  "flip-up",
  "flip-down",
  "rotate-in",
  "reveal-up",
  "pop",
] as const;

export type AnimationPreset = (typeof ANIMATION_PRESETS)[number];

export const ANIMATION_EASINGS = [
  "smooth",
  "ease-out",
  "ease-in-out",
  "linear",
  "spring",
  "bounce",
] as const;

export type AnimationEasing = (typeof ANIMATION_EASINGS)[number];

export const ANIMATION_HOVERS = [
  "none",
  "lift",
  "grow",
  "shrink",
  "tilt",
  "glow",
] as const;

export type AnimationHover = (typeof ANIMATION_HOVERS)[number];

export const ANIMATION_LOOPS = [
  "none",
  "float",
  "pulse",
  "sway",
  "breathe",
] as const;

export type AnimationLoop = (typeof ANIMATION_LOOPS)[number];

export const blockAnimationSchema = z.object({
  /** Entrance effect. `none` renders the block without a Motion wrapper. */
  preset: z.enum(ANIMATION_PRESETS).default("fade-up"),
  /** `scroll` plays when the block enters the viewport, `load` on mount. */
  trigger: z.enum(["scroll", "load"]).default("scroll"),
  duration: z.number().min(0.05).max(4).default(0.5),
  delay: z.number().min(0).max(4).default(0),
  /** Travel distance in px for the directional and reveal presets. */
  distance: z.number().min(0).max(240).default(24),
  easing: z.enum(ANIMATION_EASINGS).default("smooth"),
  /** Replay every time the block scrolls back into view when false. */
  once: z.boolean().default(true),
  /** Fraction of the block that must be visible before it plays (0-1). */
  amount: z.number().min(0).max(1).default(0.2),
  hover: z.enum(ANIMATION_HOVERS).default("none"),
  loop: z.enum(ANIMATION_LOOPS).default("none"),
  /** Vertical scroll-linked offset in px. 0 disables parallax. */
  parallax: z.number().min(-120).max(120).default(0),
  /** Fade the block towards both ends of its scroll range. */
  scrollFade: z.boolean().default(false),
});

export type BlockAnimation = z.infer<typeof blockAnimationSchema>;

/** Matches the hardcoded reveal used before animation became configurable. */
export const DEFAULT_BLOCK_ANIMATION: BlockAnimation =
  blockAnimationSchema.parse({});

/**
 * Parses possibly-missing or partial stored animation data. Blocks saved
 * before this feature - and the hand-written defaults in the registry -
 * carry no `animation` key at all, so every field falls back to a default.
 */
export function resolveBlockAnimation(raw: unknown): BlockAnimation {
  const result = blockAnimationSchema.safeParse(raw ?? {});
  if (result.success) return result.data;
  return DEFAULT_BLOCK_ANIMATION;
}

type MotionTarget = Record<string, unknown>;
type MotionTransition = Record<string, unknown>;

/** The calm easing already used across the app. */
const EASE_SMOOTH = [0.16, 1, 0.3, 1] as const;

const EASE_CURVES: Record<string, unknown> = {
  smooth: EASE_SMOOTH,
  "ease-out": [0, 0, 0.2, 1],
  "ease-in-out": [0.4, 0, 0.2, 1],
  linear: "linear",
};

const HOVER_EASE = EASE_CURVES["ease-out"];

/** Hidden state for each preset, given a travel distance. */
function presetHidden(
  preset: AnimationPreset,
  distance: number
): MotionTarget | null {
  switch (preset) {
    case "fade":
      return { opacity: 0 };
    case "fade-up":
      return { opacity: 0, y: distance };
    case "fade-down":
      return { opacity: 0, y: -distance };
    case "fade-left":
      return { opacity: 0, x: distance };
    case "fade-right":
      return { opacity: 0, x: -distance };
    case "zoom-in":
      return { opacity: 0, scale: 0.92 };
    case "zoom-out":
      return { opacity: 0, scale: 1.08 };
    case "blur-in":
      return { opacity: 0, filter: "blur(12px)" };
    case "flip-up":
      return { opacity: 0, rotateX: -35, transformPerspective: 1200 };
    case "flip-down":
      return { opacity: 0, rotateX: 35, transformPerspective: 1200 };
    case "rotate-in":
      return { opacity: 0, rotate: -8, scale: 0.96 };
    case "reveal-up":
      return { opacity: 0, y: distance, clipPath: "inset(100% 0% 0% 0%)" };
    case "pop":
      return { opacity: 0, scale: 0.6 };
    case "none":
    default:
      return null;
  }
}

/** Visible state, mirroring only the properties the preset actually moves. */
function presetVisible(hidden: MotionTarget): MotionTarget {
  const visible: MotionTarget = { opacity: 1 };
  if ("y" in hidden) visible.y = 0;
  if ("x" in hidden) visible.x = 0;
  if ("scale" in hidden) visible.scale = 1;
  if ("rotate" in hidden) visible.rotate = 0;
  if ("rotateX" in hidden) visible.rotateX = 0;
  if ("filter" in hidden) visible.filter = "blur(0px)";
  if ("clipPath" in hidden) visible.clipPath = "inset(0% 0% 0% 0%)";
  if ("transformPerspective" in hidden) {
    visible.transformPerspective = hidden.transformPerspective;
  }
  return visible;
}

function enterTransition(
  easing: AnimationEasing,
  duration: number,
  delay: number
): MotionTransition {
  if (easing === "spring") {
    return { type: "spring", stiffness: 120, damping: 18, delay };
  }
  if (easing === "bounce") {
    return { type: "spring", stiffness: 320, damping: 14, mass: 0.8, delay };
  }
  return { duration, delay, ease: EASE_CURVES[easing] ?? EASE_SMOOTH };
}

const HOVER_TARGETS: Record<AnimationHover, MotionTarget | null> = {
  none: null,
  lift: { y: -6, scale: 1.01 },
  grow: { scale: 1.03 },
  shrink: { scale: 0.97 },
  tilt: { rotate: -1.2, scale: 1.02 },
  glow: { filter: "brightness(1.08) saturate(1.08)" },
};

type LoopSpec = { animate: MotionTarget; duration: number };

const LOOP_SPECS: Record<AnimationLoop, LoopSpec | null> = {
  none: null,
  float: { animate: { y: [0, -10, 0] }, duration: 4 },
  pulse: { animate: { scale: [1, 1.03, 1] }, duration: 2.4 },
  sway: { animate: { rotate: [-1.4, 1.4, -1.4] }, duration: 5 },
  breathe: { animate: { opacity: [1, 0.72, 1] }, duration: 3.2 },
};

export type ResolvedBlockMotion = {
  /** True when at least one layer below needs a Motion wrapper. */
  active: boolean;
  enter: {
    initial: MotionTarget;
    target: MotionTarget;
    transition: MotionTransition;
    /** Play on viewport entry rather than on mount. */
    onScroll: boolean;
    viewport: { once: boolean; amount: number };
  } | null;
  hover: { target: MotionTarget; transition: MotionTransition } | null;
  loop: { target: MotionTarget; transition: MotionTransition } | null;
  scroll: { parallax: number; fade: boolean } | null;
};

export type ResolveOptions = {
  /** Honour `prefers-reduced-motion` - drops every layer. */
  reducedMotion?: boolean;
  /** Force the entrance to play on mount (used by the builder replay). */
  forcePlayOnMount?: boolean;
};

/**
 * Turns stored animation data into the concrete Motion props used by
 * `<BlockMotion>`. Returns `active: false` when nothing should animate so
 * callers can skip the wrapper entirely and keep the published DOM flat.
 */
export function resolveBlockMotion(
  raw: unknown,
  options: ResolveOptions = {}
): ResolvedBlockMotion {
  const inert: ResolvedBlockMotion = {
    active: false,
    enter: null,
    hover: null,
    loop: null,
    scroll: null,
  };

  if (options.reducedMotion) return inert;

  const config = resolveBlockAnimation(raw);
  const hidden = presetHidden(config.preset, config.distance);

  const enter = hidden
    ? {
        initial: hidden,
        target: presetVisible(hidden),
        transition: enterTransition(
          config.easing,
          config.duration,
          config.delay
        ),
        onScroll: config.trigger === "scroll" && !options.forcePlayOnMount,
        viewport: { once: config.once, amount: config.amount },
      }
    : null;

  const hoverTarget = HOVER_TARGETS[config.hover];
  const hover = hoverTarget
    ? { target: hoverTarget, transition: { duration: 0.25, ease: HOVER_EASE } }
    : null;

  const loopSpec = LOOP_SPECS[config.loop];
  const loop = loopSpec
    ? {
        target: loopSpec.animate,
        transition: {
          duration: loopSpec.duration,
          ease: "easeInOut",
          repeat: Infinity,
          repeatType: "loop",
        },
      }
    : null;

  const scroll =
    config.parallax !== 0 || config.scrollFade
      ? { parallax: config.parallax, fade: config.scrollFade }
      : null;

  return {
    active: Boolean(enter || hover || loop || scroll),
    enter,
    hover,
    loop,
    scroll,
  };
}

type PresetOption = { value: AnimationPreset; label: string; hint: string };

/** Labels for the preset picker in the builder settings panel. */
export const ANIMATION_PRESET_OPTIONS: PresetOption[] = [
  { value: "none", label: "Tidak ada", hint: "Tampil langsung" },
  { value: "fade", label: "Fade", hint: "Muncul halus" },
  { value: "fade-up", label: "Fade up", hint: "Naik dari bawah" },
  { value: "fade-down", label: "Fade down", hint: "Turun dari atas" },
  { value: "fade-left", label: "Fade left", hint: "Geser ke kiri" },
  { value: "fade-right", label: "Fade right", hint: "Geser ke kanan" },
  { value: "zoom-in", label: "Zoom in", hint: "Membesar" },
  { value: "zoom-out", label: "Zoom out", hint: "Mengecil" },
  { value: "blur-in", label: "Blur in", hint: "Dari buram" },
  { value: "flip-up", label: "Flip up", hint: "Putar 3D" },
  { value: "flip-down", label: "Flip down", hint: "Putar 3D" },
  { value: "rotate-in", label: "Rotate", hint: "Miring ke lurus" },
  { value: "reveal-up", label: "Reveal", hint: "Tersingkap" },
  { value: "pop", label: "Pop", hint: "Meletup" },
];

/** True when a block uses no animation at all. */
export function isAnimationIdle(raw: unknown): boolean {
  const config = resolveBlockAnimation(raw);
  return (
    config.preset === "none" &&
    config.hover === "none" &&
    config.loop === "none" &&
    config.parallax === 0 &&
    !config.scrollFade
  );
}

/**
 * True when a block was tuned away from the default reveal. Drives the badge
 * in the builder canvas - every block animates by default, so flagging "has
 * an animation" would mark all of them and say nothing.
 */
export function hasCustomAnimation(raw: unknown): boolean {
  const config = resolveBlockAnimation(raw);
  return (Object.keys(config) as (keyof BlockAnimation)[]).some(
    (key) => config[key] !== DEFAULT_BLOCK_ANIMATION[key]
  );
}
