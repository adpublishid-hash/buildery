"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleStop, History, Loader2, Play, Rocket, RotateCcw } from "lucide-react";
import type { FormStatus } from "@prisma/client";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  closeFormAction,
  publishFormAction,
  reopenFormAction,
  restoreFormVersionAction,
} from "@/lib/actions/form";

export function FormPublicationActions({
  formId,
  status,
  publishedVersion,
  hasDraftChanges,
  versions,
}: {
  formId: string;
  status: FormStatus;
  publishedVersion: number | null;
  hasDraftChanges: boolean;
  versions: Array<{ version: number; createdAt: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error || "Could not update the form.");
        return;
      }
      toast.success(success);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {status === "PUBLISHED" ? (
        <>
          <Button
            type="button"
            className="w-full"
            disabled={pending || !hasDraftChanges}
            onClick={() =>
              run(
                () => publishFormAction(formId),
                `Published version ${(publishedVersion ?? 0) + 1}`
              )
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <Rocket />}
            {hasDraftChanges ? "Publish changes" : "Published"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={pending}
            onClick={() => run(() => closeFormAction(formId), "Form closed")}
          >
            <CircleStop /> Close form
          </Button>
        </>
      ) : status === "CLOSED" ? (
        <>
          {hasDraftChanges ? (
            <Button
              type="button"
              className="w-full"
              disabled={pending}
              onClick={() =>
                run(
                  () => publishFormAction(formId),
                  `Published version ${(publishedVersion ?? 0) + 1}`
                )
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : <Rocket />}
              Publish changes
            </Button>
          ) : null}
          <Button
            type="button"
            variant={hasDraftChanges ? "outline" : "default"}
            className="w-full"
            disabled={pending || !publishedVersion}
            onClick={() => run(() => reopenFormAction(formId), "Form reopened")}
          >
            {pending ? <Loader2 className="animate-spin" /> : <Play />}
            Reopen published version
          </Button>
        </>
      ) : (
        <Button
          type="button"
          className="w-full"
          disabled={pending}
          onClick={() =>
            run(() => publishFormAction(formId), "Form published")
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Rocket />}
          Publish form
        </Button>
      )}
      <p className="text-xs leading-5 text-kv-muted-fg">
        Saving keeps a draft. Publishing creates an immutable public version.
      </p>
      {versions.length > 0 ? (
        <div className="border-t border-kv-border pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-kv-cell">
            <History className="h-3.5 w-3.5" /> Version history
          </p>
          <div className="space-y-1.5">
            {versions.map((item) => {
              const current = item.version === publishedVersion;
              return (
                <div
                  key={item.version}
                  className="flex items-center gap-2 rounded-md border border-kv-border px-2.5 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-kv-fg">
                      Version {item.version}{current ? " · Current" : ""}
                    </p>
                    <p className="text-[11px] text-kv-subtle">
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {!current ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={pending}
                      aria-label={`Restore version ${item.version}`}
                      title={`Restore version ${item.version}`}
                      onClick={() => {
                        if (
                          !confirm(
                            `Restore version ${item.version}? It will be published as a new version.`
                          )
                        ) {
                          return;
                        }
                        run(
                          () => restoreFormVersionAction(formId, item.version),
                          `Version ${item.version} restored`
                        );
                      }}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
