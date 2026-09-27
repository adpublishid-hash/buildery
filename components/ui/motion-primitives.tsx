"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";

// A calm, consistent easing used across the app.
const EASE = [0.16, 1, 0.3, 1] as const;

type DivProps = {
  children: React.ReactNode;
  className?: string;
  /** Seconds to delay the entrance. */
  delay?: number;
};

/** Fades content in (with a small upward drift) once on mount. */
export function FadeIn({ children, className, delay = 0 }: DivProps) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

const containerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.34, ease: EASE } },
};

/**
 * Staggers the entrance of its direct `<StaggerItem>` children. Wrap a grid
 * or list and let each child appear in sequence.
 */
export function Stagger({ children, className }: Omit<DivProps, "delay">) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={containerVariants}
      initial={reduce ? false : "hidden"}
      animate="show"
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: Omit<DivProps, "delay">) {
  return (
    <motion.div className={className} variants={itemVariants}>
      {children}
    </motion.div>
  );
}

/** Reveals content as it scrolls into view — used for long public pages. */
export function RevealOnScroll({ children, className, delay = 0 }: DivProps) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
