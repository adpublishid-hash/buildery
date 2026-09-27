import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex h-[22px] items-center gap-[5px] whitespace-nowrap rounded-[6px] border-[0.8px] px-[8px] text-[12px] font-medium leading-none transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default: "kv-gradient border-kv-fg text-white",
        secondary: "border-black/[0.04] bg-kv-secondary text-kv-secondary-fg",
        outline: "border-kv-border bg-kv-card text-kv-secondary-fg",
        // Near-monochrome by request: the label carries the meaning, a small
        // status dot adds the one touch of colour. "destructive" is the loud one.
        success:
          "border-kv-border bg-kv-card text-kv-secondary-fg before:h-[6px] before:w-[6px] before:shrink-0 before:rounded-full before:bg-kv-success before:content-['']",
        destructive: "kv-gradient border-kv-fg text-white",
      },
    },
    defaultVariants: {
      variant: "secondary",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
