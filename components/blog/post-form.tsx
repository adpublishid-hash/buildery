"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import {
  CalendarClock,
  ExternalLink,
  FileText,
  History,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { EditorAlert, EditorHeader, EditorLayout, EditorSection, EditorStatus } from "@/components/dashboard/editor-shell";
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
import { Switch } from "@/components/ui/switch";
import {
  createBlogPostAction,
  restoreBlogVersionAction,
  updateBlogPostAction,
} from "@/lib/actions/blog";
import { slugify } from "@/lib/slug";
import { ImageUpload } from "@/components/products/image-upload";
import { BlogRichTextEditor } from "@/components/blog/blog-rich-text-editor";
import { stripRichText } from "@/lib/rich-text";

export type BlogPostFormValues = {
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  status: "DRAFT" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";
  category: string;
  tags: string;
  seoTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  noindex: boolean;
  imageAlt: string;
  imageCaption: string;
  scheduledAt: string;
  featured: boolean;
  imageId: string;
};

type PostVersion = { version: number; title: string; createdAt: string };

type Props = {
  mode: "create" | "edit";
  postId?: string;
  defaultValues: BlogPostFormValues;
  defaultImageUrl: string | null;
  versions?: PostVersion[];
  publishedVersion?: number | null;
};

export function BlogPostForm({
  mode,
  postId,
  defaultValues,
  defaultImageUrl,
  versions = [],
  publishedVersion,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [previewUrl, setPreviewUrl] = useState<string | null>(defaultImageUrl);
  const [autosaveState, setAutosaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    setError,
    reset,
    getValues,
    formState: { errors, isDirty },
  } = useForm<BlogPostFormValues>({ defaultValues });

  const titleValue = watch("title");
  const slugValue = watch("slug");
  const excerptValue = watch("excerpt");
  const bodyValue = watch("body") ?? "";
  const seoTitleValue = watch("seoTitle");
  const metaDescriptionValue = watch("metaDescription");
  const statusValue = watch("status");
  const bodyStats = getTextStats(bodyValue);
  const seoTitle = seoTitleValue?.trim() || titleValue || "Post title";
  const seoDescription =
    metaDescriptionValue?.trim() ||
    excerptValue?.trim() ||
    "A short summary will appear here.";
  const isPublished = statusValue === "PUBLISHED";
  const statusLabel = {
    DRAFT: "Draft",
    SCHEDULED: "Scheduled",
    PUBLISHED: "Published",
    ARCHIVED: "Archived",
  }[statusValue];
  const primaryActionLabel =
    mode === "create"
      ? statusValue === "PUBLISHED"
        ? "Publish post"
        : statusValue === "SCHEDULED"
          ? "Schedule post"
          : "Create post"
      : statusValue === "PUBLISHED"
        ? "Save & publish"
        : statusValue === "SCHEDULED"
          ? "Save schedule"
          : statusValue === "ARCHIVED"
            ? "Archive post"
            : "Save changes";
  const submitDisabled = pending || (mode === "edit" && !isDirty);
  const draftDisabled =
    pending || (mode === "edit" && !isDirty && statusValue === "DRAFT");

  useEffect(() => {
    if (slugTouched) return;
    setValue("slug", slugify(titleValue ?? ""));
  }, [titleValue, slugTouched, setValue]);

  useEffect(() => {
    const value = defaultValues.scheduledAt;
    if (!value || !/[zZ]|[+-]\d\d:\d\d$/.test(value)) return;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return;
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
    setValue("scheduledAt", local, { shouldDirty: false });
  }, [defaultValues.scheduledAt, setValue]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (mode !== "edit" || !postId) return;
    const subscription = watch((rawValues, info) => {
      if (info.type !== "change") return;
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(async () => {
        const values = rawValues as BlogPostFormValues;
        if (!values.title?.trim() || !values.slug?.trim()) return;
        const snapshot = JSON.stringify(values);
        setAutosaveState("saving");
        const result = await updateBlogPostAction(
          postId,
          toFormData({ ...values, status: "DRAFT" })
        );
        if (!result.ok) {
          setAutosaveState("error");
          return;
        }
        setAutosaveState("saved");
        if (
          values.status === "DRAFT" &&
          JSON.stringify(getValues()) === snapshot
        ) {
          reset(values);
        }
      }, 1800);
    });
    return () => {
      subscription.unsubscribe();
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [getValues, mode, postId, reset, watch]);

  function onSubmit(values: BlogPostFormValues) {
    setServerError(null);
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    const fd = toFormData(values);

    startTransition(async () => {
      const res =
        mode === "create"
          ? await createBlogPostAction(fd)
          : await updateBlogPostAction(postId!, fd);
      if (!res.ok) {
        setServerError(res.error);
        if (res.fieldErrors) {
          for (const [field, msgs] of Object.entries(res.fieldErrors)) {
            if (msgs?.[0]) {
              setError(field as keyof BlogPostFormValues, {
                message: msgs[0],
              });
            }
          }
        }
        return;
      }
      toast.success(mode === "create" ? "Post created" : "Post saved");
      reset(values);
      router.push("/dashboard/blog");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <EditorHeader
        backHref="/dashboard/blog"
        backLabel="Kembali ke blog"
        eyebrow={mode === "create" ? "Post baru" : "Edit post"}
        title={titleValue?.trim() || "Untitled post"}
        status={
          <EditorStatus tone={isPublished ? "live" : statusValue === "SCHEDULED" ? "scheduled" : statusValue === "ARCHIVED" ? "archived" : "draft"}>
            {statusLabel}
          </EditorStatus>
        }
        meta={
          <>
            {autosaveState === "saving"
              ? "Autosaving…"
              : autosaveState === "error"
                ? "Autosave gagal"
                : autosaveState === "saved" && isDirty
                  ? "Draft tersimpan otomatis · belum dipublikasikan"
                  : isDirty
                    ? "Ada perubahan belum disimpan"
                    : "Semua perubahan tersimpan"}
            {" · "}
            {bodyStats.words} kata · {bodyStats.minutes} menit baca
          </>
        }
        actions={
          <>
            {mode === "edit" && postId ? (
              <Button asChild type="button" variant="ghost" size="sm">
                <a href={`/dashboard/blog/${postId}/preview`} target="_blank" rel="noreferrer">
                  <ExternalLink /> Preview
                </a>
              </Button>
            ) : null}
            <Button type="button" variant="ghost" size="sm" onClick={() => router.push("/dashboard/blog")} disabled={pending}>
              Batal
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSubmit((values) => onSubmit({ ...values, status: "DRAFT" }))}
              disabled={draftDisabled}
            >
              {pending && statusValue === "DRAFT" ? <Loader2 className="animate-spin" /> : null}
              Simpan draft
            </Button>
            <Button type="submit" size="sm" disabled={submitDisabled}>
              {pending ? (
                <>
                  <Loader2 className="animate-spin" />
                  {mode === "create" ? "Membuat…" : "Menyimpan…"}
                </>
              ) : (
                primaryActionLabel
              )}
            </Button>
          </>
        }
      />

      {serverError ? <EditorAlert>{serverError}</EditorAlert> : null}

      <EditorLayout
        asideWidth="360px"
        aside={
          <>

          <EditorSection title="Publishing">
            <div className="space-y-5">

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DRAFT">Draft</SelectItem>
                        <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                        <SelectItem value="PUBLISHED">Published</SelectItem>
                        <SelectItem value="ARCHIVED">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {statusValue === "SCHEDULED" ? (
                <div className="space-y-2">
                  <Label htmlFor="scheduledAt">Publish date and time</Label>
                  <Input
                    id="scheduledAt"
                    type="datetime-local"
                    {...register("scheduledAt", {
                      required: "Publication time is required",
                    })}
                  />
                  {errors.scheduledAt ? (
                    <p className="text-xs text-kv-destructive">
                      {errors.scheduledAt.message}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <Controller
                control={control}
                name="featured"
                render={({ field }) => (
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <Label htmlFor="featured">Featured post</Label>
                      <p className="text-[11px] text-kv-subtle">
                        Prioritize this post on the blog index.
                      </p>
                    </div>
                    <Switch
                      id="featured"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </div>
                )}
              />

              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  placeholder="e.g. Updates"
                  {...register("category")}
                />
                <p className="text-[11px] text-kv-subtle">
                  Typed categories are created if they don&apos;t exist yet.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">Tags</Label>
                <Input
                  id="tags"
                  placeholder="design, product launch"
                  {...register("tags")}
                />
                <p className="text-[11px] text-kv-subtle">
                  Comma-separated. Up to 20 tags.
                </p>
              </div>
            </div>
          </EditorSection>

          <EditorSection title="Featured image" description="Used on the blog index, post page, and social previews.">
              <ImageUpload
                previewUrl={previewUrl}
                disabled={pending}
                onUploaded={(file) => {
                  setValue("imageId", file.id, { shouldDirty: true });
                  setPreviewUrl(file.url);
                }}
                onRemove={() => {
                  setValue("imageId", "", { shouldDirty: true });
                  setPreviewUrl(null);
                }}
              />
              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="imageAlt">Alt text</Label>
                  <Input
                    id="imageAlt"
                    placeholder="Describe the image"
                    {...register("imageAlt")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="imageCaption">Caption</Label>
                  <Input id="imageCaption" {...register("imageCaption")} />
                </div>
              </div>
            
          </EditorSection>

          <EditorSection title="SEO" description="Falls back to the title and excerpt when blank.">
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="seoTitle">SEO title</Label>
                  <span className="text-[11px] text-kv-subtle">
                    {(seoTitleValue ?? "").length}/160
                  </span>
                </div>
                <Input id="seoTitle" {...register("seoTitle")} />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="metaDescription">Meta description</Label>
                  <span className="text-[11px] text-kv-subtle">
                    {(metaDescriptionValue ?? "").length}/300
                  </span>
                </div>
                <Textarea
                  id="metaDescription"
                  rows={4}
                  className="resize-y"
                  {...register("metaDescription")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="canonicalUrl">Canonical URL</Label>
                <Input
                  id="canonicalUrl"
                  type="url"
                  placeholder="https://example.com/original-article"
                  {...register("canonicalUrl")}
                />
              </div>

              <Controller
                control={control}
                name="noindex"
                render={({ field }) => (
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <Label htmlFor="noindex">Hide from search engines</Label>
                      <p className="text-[11px] text-kv-subtle">
                        Keep the page accessible without indexing it.
                      </p>
                    </div>
                    <Switch
                      id="noindex"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </div>
                )}
              />

              <div className="rounded-xl border border-kv-border bg-kv-secondary p-4">
                <p className="text-[11px] font-medium uppercase text-kv-subtle">
                  Search preview
                </p>
                <p className="mt-2 line-clamp-1 text-sm font-medium text-blue-700">
                  {seoTitle}
                </p>
                <p className="mt-1 text-[11px] text-emerald-700">
                  /blog/{slugValue || "post-slug"}
                </p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-kv-secondary-fg">
                  {seoDescription}
                </p>
              </div>
            </div>
          </EditorSection>

          {mode === "edit" && versions.length ? (
            <EditorSection title={<><History className="h-4 w-4" /> Version history</>} description="Restore a published snapshot into the editor as a draft.">
              <div className="space-y-2">
                {versions.map((version) => (
                  <div
                    key={version.version}
                    className="flex items-center gap-3 rounded-lg border border-kv-border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        Version {version.version}
                        {publishedVersion === version.version ? " · Live" : ""}
                      </p>
                      <p className="flex items-center gap-1 text-[11px] text-kv-subtle">
                        <CalendarClock className="h-3 w-3" />
                        {new Date(version.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title={`Restore version ${version.version}`}
                      disabled={pending}
                      onClick={() => {
                        startTransition(async () => {
                          const result = await restoreBlogVersionAction(
                            postId!,
                            version.version
                          );
                          if (!result.ok) {
                            toast.error(result.error);
                            return;
                          }
                          toast.success(`Version ${version.version} restored`);
                          router.refresh();
                        });
                      }}
                    >
                      <RotateCcw />
                    </Button>
                  </div>
                ))}
              </div>
            </EditorSection>
          ) : null}
          </>
        }
      >
        <EditorSection title="Artikel" icon={FileText} description="Judul, alamat, dan isi tulisan. Baris baru tetap dipertahankan.">
          <div className="space-y-[16px]">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  autoFocus
                  className="h-12 text-lg font-semibold"
                  placeholder="Post title"
                  {...register("title", { required: "Title is required" })}
                />
                {errors.title && (
                  <p className="text-xs text-kv-destructive">{errors.title.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">Slug</Label>
                <div className="kv-field flex h-[32px] items-stretch overflow-hidden rounded-[8px] border-[0.8px] border-kv-border bg-kv-card transition-[border-color,box-shadow] hover:border-[#d1d5db] focus-within:border-[#9ca3af] focus-within:shadow-[0_0_0_3px_rgba(156,163,175,0.18)]">
                  <span className="flex items-center border-r-[0.8px] border-kv-border bg-kv-secondary px-[10px] text-[12px] text-kv-muted-fg">
                    /blog/
                  </span>
                  <input
                    id="slug"
                    className="min-w-0 flex-1 bg-transparent px-[10px] text-[13px] text-kv-fg outline-none"
                    {...register("slug", {
                      required: "Slug is required",
                      onChange: () => setSlugTouched(true),
                    })}
                  />
                </div>
                {errors.slug && (
                  <p className="text-xs text-kv-destructive">{errors.slug.message}</p>
                )}
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] text-kv-subtle">
                    Public URL: /blog/{slugValue || "post-slug"}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSlugTouched(false);
                      setValue("slug", slugify(titleValue ?? ""), {
                        shouldDirty: true,
                      });
                    }}
                    className="text-[11px] font-medium text-kv-muted-fg hover:text-kv-fg"
                  >
                    Regenerate
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="excerpt">Excerpt</Label>
                <Input
                  id="excerpt"
                  placeholder="Short summary shown in the blog index"
                  {...register("excerpt")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="body">Body</Label>
                <Controller
                  control={control}
                  name="body"
                  rules={{
                    validate: (value) =>
                      statusValue === "DRAFT" ||
                      stripRichText(value ?? "").length > 0 ||
                      "Body is required",
                  }}
                  render={({ field }) => (
                    <BlogRichTextEditor
                      value={field.value}
                      disabled={pending}
                      onChange={field.onChange}
                    />
                  )}
                />
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-kv-subtle">
                  <span>{bodyStats.words} words</span>
                  <span>·</span>
                  <span>{bodyStats.minutes} min read</span>
                  <span>·</span>
                  <span>{bodyStats.paragraphs} paragraphs</span>
                </div>
                {errors.body && (
                  <p className="text-xs text-kv-destructive">{errors.body.message}</p>
                )}
              </div>
          </div>
        </EditorSection>
      </EditorLayout>
    </form>
  );
}

function toFormData(values: BlogPostFormValues) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (key === "scheduledAt" && typeof value === "string" && value) {
      const date = new Date(value);
      formData.set(key, Number.isNaN(date.getTime()) ? value : date.toISOString());
    } else {
      formData.set(key, String(value ?? ""));
    }
  }
  return formData;
}

function getTextStats(value: string) {
  const text = stripRichText(value);
  const words = text.split(/\s+/).filter(Boolean).length;
  return {
    words,
    minutes: Math.max(1, Math.ceil(words / 220)),
    paragraphs: text.split(/\n+/).map((part) => part.trim()).filter(Boolean)
      .length,
  };
}

