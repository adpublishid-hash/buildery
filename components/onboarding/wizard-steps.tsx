import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

const STEPS = [
  { id: 1, label: "Verifikasi email" },
  { id: 2, label: "Buat workspace" },
] as const;

/**
 * Two-step progress above the onboarding card, drawn like the dashboard's
 * toggle pills: done and current steps take the dark gradient.
 */
export function WizardSteps({ current }: { current: 1 | 2 }) {
  return (
    <ol className="mb-[12px] flex items-center gap-[8px]" aria-label="Langkah onboarding">
      {STEPS.map((step) => {
        const done = step.id < current;
        const active = step.id === current;
        return (
          <li
            key={step.id}
            aria-current={active ? "step" : undefined}
            className={cn(
              "flex h-[30px] min-w-0 flex-1 items-center justify-center gap-[8px] rounded-[8px] border-[0.8px] px-[10px] text-[12px] font-medium leading-none",
              active && "kv-gradient border-kv-fg text-white",
              done && "border-kv-border bg-kv-card text-kv-fg",
              !done && !active && "border-kv-border bg-kv-card text-kv-muted-fg"
            )}
          >
            <span
              className={cn(
                "flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full text-[10px]",
                active && "bg-white/15",
                done && "bg-kv-success text-white",
                !done && !active && "border-[0.8px] border-kv-border"
              )}
            >
              {done ? <Check className="h-[10px] w-[10px]" strokeWidth={3} /> : step.id}
            </span>
            <span className="truncate">{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
