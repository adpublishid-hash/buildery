import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type Props = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "flex animate-kv-fade flex-col items-center justify-center gap-[6px] rounded-[12px] border-[0.8px] border-dashed border-kv-border bg-kv-card px-[24px] py-[48px] text-center",
        className
      )}
    >
      {Icon && (
        <div className="mb-[6px] flex items-center rounded-[8px] border-[0.8px] border-kv-input bg-kv-card p-[8px] text-kv-secondary-fg">
          <Icon className="h-[16px] w-[16px]" strokeWidth={1.6} />
        </div>
      )}
      <h3 className="text-[13px] font-medium text-kv-fg">
        {title}
      </h3>
      {description && (
        <p className="max-w-sm text-[12px] leading-[1.5] text-kv-muted-fg">
          {description}
        </p>
      )}
      {action && <div className="mt-[10px]">{action}</div>}
    </div>
  );
}
