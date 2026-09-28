import Link from "next/link";
import { ArrowRight, Circle, CircleCheck, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { Panel } from "./panel";

export type SetupStep = {
  label: string;
  description: string;
  done: boolean;
  /** Where to go to complete the step. Omitted once done or when there's nowhere to link. */
  href?: string;
};

/** Guided first-run steps for a module, shown until every step is done. */
export function SetupChecklist({
  title,
  icon,
  steps,
  className,
}: {
  title: string;
  icon?: LucideIcon;
  steps: SetupStep[];
  className?: string;
}) {
  const done = steps.filter((step) => step.done).length;
  const percent = steps.length ? Math.round((done / steps.length) * 100) : 0;

  return (
    <Panel
      title={
        <>
          {title}{" "}
          <span className="font-normal text-kv-muted-fg">
            · {done}/{steps.length} done
          </span>
        </>
      }
      icon={icon}
      iconPosition="left"
      action={
        <div
          className="h-[6px] w-[96px] overflow-hidden rounded-full bg-black/[0.08]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={`${title} progress`}
        >
          <div className="h-full rounded-full bg-kv-fg transition-[width] duration-500" style={{ width: `${percent}%` }} />
        </div>
      }
      className={className}
      bodyClassName="grid grid-cols-1 gap-[6px] p-[8px] sm:grid-cols-2 xl:grid-cols-4"
    >
      {steps.map((step, index) => {
        const inner = (
          <>
            {step.done ? (
              <CircleCheck className="mt-[1px] h-[16px] w-[16px] shrink-0 text-kv-success" strokeWidth={1.8} />
            ) : (
              <Circle className="mt-[1px] h-[16px] w-[16px] shrink-0 text-kv-subtle" strokeWidth={1.8} />
            )}
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block text-[13px] font-medium leading-[1.3] text-kv-fg",
                  step.done && "text-kv-subtle line-through"
                )}
              >
                <span className="kv-tabular mr-[4px] text-kv-muted-fg">{index + 1}.</span>
                {step.label}
              </span>
              <span className="mt-[3px] block text-[12px] leading-[1.45] text-kv-muted-fg">
                {step.description}
              </span>
            </span>
            {!step.done && step.href ? (
              <ArrowRight className="mt-[1px] h-[14px] w-[14px] shrink-0 text-kv-muted-fg transition-transform group-hover:translate-x-[2px]" />
            ) : null}
          </>
        );
        const cls =
          "group flex min-w-0 items-start gap-[10px] rounded-[8px] border-[0.8px] border-kv-border bg-kv-card px-[12px] py-[10px]";
        return step.done || !step.href ? (
          <div key={step.label} className={cls}>
            {inner}
          </div>
        ) : (
          <Link
            key={step.label}
            href={step.href}
            className={cn(
              cls,
              "transition-[box-shadow,transform] duration-200 hover:-translate-y-px hover:shadow-kv-hover"
            )}
          >
            {inner}
          </Link>
        );
      })}
    </Panel>
  );
}
