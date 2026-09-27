import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The dashboard's section surface (Kravio): a muted, faintly hatched frame
 * with the title strip on top and a white card inside. The icon sits on the
 * right of the title by default, or before it with `iconPosition="left"`.
 */
export function Panel({
  title,
  icon: Icon,
  iconPosition = "right",
  action,
  children,
  className,
  bodyClassName,
  style,
  id,
}: {
  title?: React.ReactNode;
  icon?: LucideIcon;
  iconPosition?: "left" | "right";
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  style?: React.CSSProperties;
  id?: string;
}) {
  const icon = Icon ? (
    <Icon className="h-[16px] w-[16px] shrink-0 text-kv-secondary-fg" strokeWidth={1.6} />
  ) : null;
  const titleId = id ? `${id}-title` : undefined;

  return (
    <section
      id={id}
      aria-labelledby={titleId}
      style={style}
      className={cn("kv-frame flex min-w-0 flex-col items-start p-[4px]", className)}
    >
      {title || action ? (
        <div className="relative flex min-h-[30px] w-full shrink-0 flex-wrap items-center justify-between gap-[8px] px-[8px] py-[6px] sm:flex-nowrap">
          <div className="flex min-w-0 items-center gap-[8px]">
            {iconPosition === "left" ? icon : null}
            <h2
              id={titleId}
              className="truncate whitespace-nowrap text-[13px] font-medium leading-none text-kv-secondary-fg"
            >
              {title}
            </h2>
          </div>
          <div className="flex min-w-0 items-center gap-[8px]">
            {action}
            {iconPosition === "right" ? icon : null}
          </div>
        </div>
      ) : null}
      <div
        className={cn(
          "relative flex min-h-px w-full min-w-0 flex-1 flex-col overflow-clip rounded-[10px] border-[0.8px] border-kv-input bg-kv-card",
          bodyClassName
        )}
      >
        {children}
      </div>
    </section>
  );
}
