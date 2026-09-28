"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { setAffiliateProgramOpenAction } from "@/lib/actions/affiliate";

/** Header switch for accepting public applications, the program's on/off. */
export function ProgramOpenToggle({ isOpen }: { isOpen: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <label className="flex h-[32px] items-center gap-[8px] rounded-[8px] border-[0.8px] border-kv-border bg-kv-card px-[10px] text-[12px] font-medium text-kv-secondary-fg">
      <Switch
        checked={isOpen}
        disabled={pending}
        aria-label={isOpen ? "Close applications" : "Open applications"}
        onCheckedChange={(next) =>
          startTransition(async () => {
            const res = await setAffiliateProgramOpenAction(next);
            if (!res.ok) {
              toast.error(res.error);
              return;
            }
            toast.success(next ? "Applications are open" : "Applications closed. Existing partners keep earning.");
            router.refresh();
          })
        }
      />
      {isOpen ? "Accepting applications" : "Applications closed"}
    </label>
  );
}
