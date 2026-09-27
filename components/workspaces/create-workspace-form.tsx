"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Globe2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWorkspaceAction } from "@/lib/actions/workspace";
import { PUBLIC_SITE_DOMAIN, publicSiteDisplayUrl } from "@/lib/public-url";
import { slugify } from "@/lib/slug";
import { createWorkspaceSchema, type CreateWorkspaceInput } from "@/lib/zod";

export function CreateWorkspaceForm() {
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
  } = useForm<CreateWorkspaceInput>({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: { name: "", slug: "" },
  });

  const nameValue = watch("name");
  const slugValue = watch("slug");

  useEffect(() => {
    if (slugTouched) return;
    setValue("slug", slugify(nameValue ?? ""), { shouldValidate: false });
  }, [nameValue, slugTouched, setValue]);

  function onSubmit(values: CreateWorkspaceInput) {
    setServerError(null);
    const fd = new FormData();
    fd.set("name", values.name);
    fd.set("slug", values.slug);

    startTransition(async () => {
      const res = await createWorkspaceAction(fd);
      if (!res.ok) {
        setServerError(res.error);
        if (res.fieldErrors) {
          for (const [field, msgs] of Object.entries(res.fieldErrors)) {
            if (msgs?.[0]) {
              setError(field as keyof CreateWorkspaceInput, {
                message: msgs[0],
              });
            }
          }
        }
        return;
      }
      toast.success("Workspace berhasil dibuat");
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-[14px]">
      <div className="space-y-[6px]">
        <Label htmlFor="name">Nama workspace</Label>
        <Input
          id="name"
          autoFocus
          placeholder="Acme Studio"
          className="h-[36px]"
          {...register("name")}
        />
        {errors.name && (
          <p className="text-[12px] text-kv-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-[6px]">
        <Label htmlFor="slug">Slug workspace</Label>
        <div className="kv-field flex h-[36px] items-stretch overflow-hidden rounded-[8px] border-[0.8px] border-kv-border bg-kv-card transition-[border-color,box-shadow] duration-150 hover:border-[#d1d5db] focus-within:border-[#9ca3af] focus-within:shadow-[0_0_0_3px_rgba(156,163,175,0.18)]">
          <input
            id="slug"
            className="min-w-0 flex-1 bg-transparent px-[10px] text-[13px] text-kv-fg outline-none placeholder:text-kv-muted-fg"
            placeholder="acme-studio"
            {...register("slug", {
              onChange: () => setSlugTouched(true),
            })}
          />
          <span className="flex items-center border-l-[0.8px] border-kv-border bg-kv-secondary px-[10px] text-[12px] text-kv-muted-fg">
            .{PUBLIC_SITE_DOMAIN}
          </span>
        </div>
        {errors.slug ? (
          <p className="text-[12px] text-kv-destructive">{errors.slug.message}</p>
        ) : (
          <p className="flex items-center gap-[6px] text-[12px] text-kv-muted-fg">
            <Globe2 className="h-[14px] w-[14px]" strokeWidth={1.6} />
            URL publik: {publicSiteDisplayUrl(slugValue || "workspace")}
          </p>
        )}
      </div>

      {serverError && (
        <div className="rounded-[8px] border-[0.8px] border-red-200 bg-red-50/70 px-[10px] py-[8px] text-[12px] text-red-700">
          {serverError}
        </div>
      )}

      <div className="flex items-center justify-end gap-[8px] pt-[4px]">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={pending}
        >
          Batal
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="animate-spin" /> Membuat...
            </>
          ) : (
            "Buat workspace"
          )}
        </Button>
      </div>
    </form>
  );
}
