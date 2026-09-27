import { cn } from "@/lib/utils";

type Props = {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

export function PageHeader({ title, description, action, className }: Props) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-center justify-between gap-[12px] pb-[16px]",
        className
      )}
    >
      <div className="flex min-w-0 animate-kv-rise flex-col items-start gap-[8px] leading-none">
        <h1 className="flex min-h-[24px] min-w-0 flex-wrap items-center gap-[0.25em] break-words text-[22px] font-semibold leading-none tracking-[-0.01em] text-kv-fg">
          {title}
        </h1>
        {description && (
          <p className="break-words text-[13px] leading-[1.35] text-kv-muted-fg">
            {description}
          </p>
        )}
      </div>
      {action && (
        <div className="flex min-w-0 animate-kv-rise flex-wrap items-center gap-[8px] [animation-delay:60ms]">
          {action}
        </div>
      )}
    </div>
  );
}
