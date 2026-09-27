import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Kravio button set: a dark gradient primary, white outline/surface buttons
// that lift on hover, and a quiet ghost for icon buttons.
const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-[6px] whitespace-nowrap font-medium leading-none outline-none select-none transition-[background-color,border-color,box-shadow,transform,color,filter] duration-150 ease-out active:scale-[0.97] focus-visible:ring-[3px] focus-visible:ring-kv-ring/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:h-[16px] [&_svg]:w-[16px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "kv-gradient rounded-[8px] border border-kv-fg text-white hover:brightness-110",
        // Monochrome by request: a destructive action reads through its label
        // and the confirmation step, not a red button.
        destructive:
          "kv-gradient rounded-[8px] border border-kv-fg text-white hover:brightness-110",
        outline:
          "rounded-[8px] border-[0.8px] border-kv-border bg-kv-card text-kv-secondary-fg hover:border-[#d1d5db] hover:bg-[#fcfcfc] hover:text-kv-fg hover:shadow-kv-hover data-[state=open]:border-[#d1d5db] data-[state=open]:bg-[#fcfcfc]",
        secondary:
          "rounded-[8px] border-[0.8px] border-kv-input bg-kv-card text-kv-secondary-fg hover:bg-[#fcfcfc] hover:text-kv-fg hover:shadow-kv-hover data-[state=open]:bg-[#fcfcfc]",
        ghost:
          "rounded-md text-kv-secondary-fg hover:bg-black/[0.04] hover:text-kv-fg data-[state=open]:bg-black/[0.05]",
        link: "text-kv-fg underline-offset-4 hover:underline",
      },
      size: {
        default: "h-[32px] px-[10px] text-[12px]",
        sm: "h-[28px] px-[8px] text-[12px]",
        lg: "h-[36px] px-[14px] text-[13px]",
        icon: "h-[32px] w-[32px] p-[8px]",
        "icon-sm": "h-[24px] w-[24px] p-[4px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
