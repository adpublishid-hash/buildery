import * as React from "react";

import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "kv-field flex min-h-20 w-full rounded-[8px] border-[0.8px] border-kv-border bg-kv-card px-[10px] py-[8px] text-[13px] leading-[1.5] text-kv-fg transition-[border-color,box-shadow] duration-150 placeholder:text-kv-muted-fg hover:border-[#d1d5db] focus-visible:outline-none focus-visible:border-[#9ca3af] focus-visible:shadow-[0_0_0_3px_rgba(156,163,175,0.18)] disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
