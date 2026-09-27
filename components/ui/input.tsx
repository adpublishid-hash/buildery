import * as React from "react";

import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "kv-field flex h-[32px] w-full rounded-[8px] border-[0.8px] border-kv-border bg-kv-card px-[10px] py-[6px] text-[13px] text-kv-fg transition-[border-color,box-shadow] duration-150 hover:border-[#d1d5db] focus-visible:outline-none focus-visible:border-[#9ca3af] focus-visible:shadow-[0_0_0_3px_rgba(156,163,175,0.18)] file:border-0 file:bg-transparent file:text-[13px] file:font-medium placeholder:text-kv-muted-fg disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
