import { cn } from "@/lib/utils";

/** The brand as a wordmark — text only, no image mark. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "whitespace-nowrap text-[15px] font-semibold leading-none tracking-[-0.02em] text-kv-fg",
        className
      )}
    >
      My Landing
    </span>
  );
}
