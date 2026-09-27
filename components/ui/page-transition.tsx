"use client";

import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";

/**
 * Re-animates its children whenever the route changes. Keying on the
 * pathname remounts the wrapper, replaying the entrance animation — a
 * lightweight page transition that works with RSC children.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const reduce = useReducedMotion();

  if (reduce) return <div className="min-w-0 max-w-full">{children}</div>;

  return (
    <motion.div
      key={pathname}
      className="min-w-0 max-w-full"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
