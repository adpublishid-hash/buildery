"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { slugify } from "@/lib/slug";
import { createPageSchema, type CreatePageInput } from "@/lib/zod";

type CreatePageResponse =
  | { ok: true; data: { pageId: string } }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function CreatePageForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<CreatePageInput>({
    resolver: zodResolver(createPageSchema),
    defaultValues: { title: "", slug: "" },
  });

  const titleValue = watch("title");

  useEffect(() => {
    if (slugTouched) return;
    setValue("slug", slugify(titleValue ?? ""), { shouldValidate: false });
  }, [titleValue, slugTouched, setValue]);

  function onSubmit(values: CreatePageInput) {
    setServerError(null);
    const fd = new FormData();
    fd.set("title", values.title);
    fd.set("slug", values.slug);

    startTransition(async () => {
      let res: CreatePageResponse;
      try {
        const response = await fetch("/api/dashboard/pages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: fd.get("title"),
            slug: fd.get("slug"),
          }),
        });
        const payload = await response.json().catch(() => null);
        res =
          payload && typeof payload === "object" && "ok" in payload
            ? (payload as CreatePageResponse)
            : {
                ok: false,
                error: response.ok
                  ? "Page could not be created."
                  : "Server could not create the page. Please try again.",
              };
      } catch {
        res = {
          ok: false,
          error: "Network error. Please check your connection and try again.",
        };
      }

      if (!res.ok) {
        setServerError(res.error);
        if (res.fieldErrors) {
          for (const [field, msgs] of Object.entries(res.fieldErrors)) {
            if (msgs?.[0]) {
              setError(field as keyof CreatePageInput, { message: msgs[0] });
            }
          }
        }
        return;
      }
      toast.success("Page created");
      router.push(`/dashboard/pages/${res.data.pageId}/builder`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="title">Page title</Label>
        <Input
          id="title"
          autoFocus
          placeholder="Landing page"
          {...register("title")}
        />
        {errors.title && (
          <p className="text-xs text-red-600">{errors.title.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="slug">Page slug</Label>
        <div className="kv-field flex h-[32px] items-stretch overflow-hidden rounded-[8px] border-[0.8px] border-kv-border bg-kv-card transition-[border-color,box-shadow] duration-150 hover:border-[#d1d5db] focus-within:border-[#9ca3af] focus-within:shadow-[0_0_0_3px_rgba(156,163,175,0.18)]">
          <span className="flex items-center pl-[10px] text-[13px] text-kv-muted-fg">
            /
          </span>
          <input
            id="slug"
            className="min-w-0 flex-1 bg-transparent px-[10px] text-[13px] text-kv-fg outline-none placeholder:text-kv-muted-fg pl-[2px]"
            placeholder="landing-page"
            {...register("slug", { onChange: () => setSlugTouched(true) })}
          />
        </div>
        {errors.slug ? (
          <p className="text-xs text-red-600">{errors.slug.message}</p>
        ) : (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            The page is created as a draft. You can change the slug later in
            settings.
          </p>
        )}
      </div>

      {serverError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {serverError}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="animate-spin" /> Creating…
            </>
          ) : (
            "Create page"
          )}
        </Button>
      </div>
    </form>
  );
}
