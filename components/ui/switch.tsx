"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type SwitchProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
};

/** Lightweight controlled toggle — no external dependency. */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  id,
  ...rest
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-kv-ring/40 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "kv-gradient" : "bg-[#e1e4ea] hover:bg-[#d4d8e0]"
      )}
      {...rest}
    >
      <span
        className={cn(
          "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-[0px_2.2px_3px_0px_rgba(27,28,29,0.12)] ring-0 transition-transform duration-200 ease-out-expo",
          checked ? "translate-x-4" : "translate-x-0.5"
        )}
      />
    </button>
  );
}
