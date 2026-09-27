"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Home, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SeoImageUpload } from "@/components/pages/seo-image-upload";
import { setHomePageAction } from "@/lib/actions/page";
import { Switch } from "@/components/ui/switch";
import {
  updatePageSettingsSchema,
  type UpdatePageSettingsInput,
} from "@/lib/zod";

type Props = {
  pageId: string;
  defaultValues: UpdatePageSettingsInput;
  isHomePage: boolean;
  canEdit: boolean;
};

type PageSettingsApiResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
    };

export function PageSettingsForm({
  pageId,
  defaultValues,
  isHomePage,
  canEdit,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [homePending, startHomeTransition] = useTransition();
  const [homeSelected, setHomeSelected] = useState(isHomePage);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setError,
    setValue,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useForm<UpdatePageSettingsInput>({
    resolver: zodResolver(updatePageSettingsSchema),
    defaultValues,
  });

  const metaLen = (watch("metaDescription") ?? "").length;
  const ogImage = watch("ogImage") ?? "";
  const status = watch("status");
  const canSetHomepage = canEdit && status === "PUBLISHED" && !isDirty;

  function onSubmit(values: UpdatePageSettingsInput) {
    setServerError(null);

    startTransition(async () => {
      let res: PageSettingsApiResult;
      try {
        const response = await fetch(`/api/dashboard/pages/${pageId}/settings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: values.title,
            slug: values.slug,
            status: values.status,
            seoTitle: values.seoTitle ?? "",
            metaDescription: values.metaDescription ?? "",
            ogImage: values.ogImage ?? "",
            canonicalUrl: values.canonicalUrl ?? "",
            noindex: values.noindex ?? false,
          }),
        });
        const json = (await response.json().catch(() => null)) as
          | PageSettingsApiResult
          | null;
        res =
          response.ok && json?.ok
            ? { ok: true }
            : {
                ok: false,
                error:
                  json && "error" in json
                    ? json.error
                    : `Request failed with status ${response.status}.`,
                fieldErrors:
                  json && "fieldErrors" in json ? json.fieldErrors : undefined,
              };
      } catch {
        res = {
          ok: false,
          error: "Could not reach the server. Please try again.",
        };
      }

      if (!res.ok) {
        setServerError(res.error);
        if (res.fieldErrors) {
          for (const [field, msgs] of Object.entries(res.fieldErrors)) {
            if (msgs?.[0]) {
              setError(field as keyof UpdatePageSettingsInput, {
                message: msgs[0],
              });
            }
          }
        }
        return;
      }
      toast.success("Page settings saved");
      reset(values);
      router.refresh();
    });
  }

  function makeHomepage() {
    startHomeTransition(async () => {
      const res = await setHomePageAction(pageId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setHomeSelected(true);
      toast.success("Homepage updated");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Page title, URL slug, and status.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" disabled={!canEdit} {...register("title")} />
            {errors.title && (
              <p className="text-xs text-red-600">{errors.title.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <div className="flex h-9 items-stretch overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
                <span className="flex items-center px-3 text-sm text-zinc-400">
                  /
                </span>
                <input
                  id="slug"
                  disabled={!canEdit}
                  className="flex-1 bg-transparent text-sm outline-none disabled:opacity-60"
                  {...register("slug")}
                />
              </div>
              {errors.slug && (
                <p className="text-xs text-red-600">{errors.slug.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={!canEdit}
                  >
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DRAFT">Draft</SelectItem>
                      <SelectItem value="PUBLISHED">Published</SelectItem>
                      <SelectItem value="ARCHIVED">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Homepage</CardTitle>
          <CardDescription>
            Visitors will see this page when opening your root domain.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                <Home className="h-4 w-4" />
              </span>
              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  Set as site homepage
                </p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {homeSelected
                    ? "This page is currently shown at /."
                    : "Publish and save this page first, then make it the default root page."}
                </p>
              </div>
            </div>
            <Switch
              checked={homeSelected}
              disabled={!canSetHomepage || homePending}
              aria-label="Set as homepage"
              onCheckedChange={(checked) => {
                if (checked) {
                  makeHomepage();
                } else {
                  toast.info("Choose another published page as the homepage.");
                }
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SEO</CardTitle>
          <CardDescription>
            How this page appears in search results and social shares.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="seoTitle">SEO title</Label>
            <Input
              id="seoTitle"
              disabled={!canEdit}
              placeholder="Falls back to the page title"
              {...register("seoTitle")}
            />
            {errors.seoTitle && (
              <p className="text-xs text-red-600">{errors.seoTitle.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="metaDescription">Meta description</Label>
              <span className="text-[11px] text-zinc-400">{metaLen}/180</span>
            </div>
            <Textarea
              id="metaDescription"
              rows={3}
              disabled={!canEdit}
              placeholder="A short summary shown in search results."
              {...register("metaDescription")}
            />
            {errors.metaDescription && (
              <p className="text-xs text-red-600">
                {errors.metaDescription.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>OG image</Label>
            <SeoImageUpload
              value={ogImage}
              disabled={!canEdit}
              onChange={(url) =>
                setValue("ogImage", url, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
            {errors.ogImage && (
              <p className="text-xs text-red-600">{errors.ogImage.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="canonicalUrl">Canonical URL</Label>
            <Input
              id="canonicalUrl"
              placeholder="https://contoh.com/halaman-asli"
              disabled={!canEdit}
              {...register("canonicalUrl")}
            />
            <p className="text-xs text-zinc-500">
              Isi kalau halaman ini menduplikasi halaman lain, supaya mesin
              pencari menghitung rankingnya di satu tempat.
            </p>
            {errors.canonicalUrl && (
              <p className="text-xs text-red-600">
                {errors.canonicalUrl.message}
              </p>
            )}
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              value="true"
              disabled={!canEdit}
              className="mt-0.5 h-4 w-4"
              {...register("noindex")}
            />
            <span>
              <span className="font-medium">Sembunyikan dari mesin pencari</span>
              <span className="mt-0.5 block text-xs text-zinc-500">
                Halaman tetap bisa dibuka lewat link, tapi tidak diindeks.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      {serverError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {serverError}
        </div>
      )}

      {canEdit && (
        <div className="flex justify-end">
          <Button type="submit" disabled={pending || !isDirty}>
            {pending ? (
              <>
                <Loader2 className="animate-spin" /> Saving…
              </>
            ) : (
              "Save settings"
            )}
          </Button>
        </div>
      )}
    </form>
  );
}
