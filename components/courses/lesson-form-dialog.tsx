"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import {
  CalendarClock,
  Eye,
  FileText,
  Link2,
  Loader2,
  PlayCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { LessonType } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BlogRichTextEditor } from "@/components/blog/blog-rich-text-editor";
import { CourseAssetUpload } from "@/components/courses/course-asset-upload";
import {
  createLessonAction,
  updateLessonAction,
} from "@/lib/actions/lesson";

export type LessonDialogValues = {
  title: string;
  type: LessonType;
  body: string;
  url: string;
  label: string;
  isPreview: boolean;
  dripEnabled: boolean;
  dripDays: string;
  durationMinutes: string;
  transcript: string;
  assetId: string;
  assetName: string;
  assetKind: string;
  assetSize: number;
  attachmentLabel: string;
  prerequisiteLessonId: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  moduleId?: string;
  lessonId?: string;
  defaultValues: LessonDialogValues;
  courseId: string;
  lessonOptions: Array<{ id: string; title: string }>;
};

export function LessonFormDialog({
  open,
  onOpenChange,
  mode,
  moduleId,
  lessonId,
  defaultValues,
  courseId,
  lessonOptions,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<LessonDialogValues>({ defaultValues });

  const typeValue = watch("type");
  const isPreview = watch("isPreview");
  const dripEnabled = watch("dripEnabled");
  const assetId = watch("assetId");
  const assetName = watch("assetName");
  const assetKind = watch("assetKind");
  const assetSize = watch("assetSize");

  // Re-seed the form whenever the dialog opens with a new lesson.
  useEffect(() => {
    if (open) {
      reset(defaultValues);
      setServerError(null);
    }
  }, [open, defaultValues, reset]);

  function onSubmit(values: LessonDialogValues) {
    setServerError(null);
    const fd = new FormData();
    fd.set("title", values.title);
    fd.set("type", values.type);
    fd.set("body", values.body);
    fd.set("url", values.url);
    fd.set("label", values.label);
    fd.set("isPreview", String(values.isPreview));
    fd.set("dripEnabled", String(values.dripEnabled));
    fd.set("dripDays", values.dripDays);
    fd.set("durationMinutes", values.durationMinutes);
    fd.set("transcript", values.transcript);
    fd.set("assetId", values.assetId);
    fd.set("attachmentLabel", values.attachmentLabel);
    fd.set("prerequisiteLessonId", values.prerequisiteLessonId);

    startTransition(async () => {
      const res =
        mode === "create"
          ? await createLessonAction(moduleId!, fd)
          : await updateLessonAction(lessonId!, fd);

      if (!res.ok) {
        setServerError(res.error);
        if (res.fieldErrors) {
          for (const [field, msgs] of Object.entries(res.fieldErrors)) {
            if (msgs?.[0]) {
              setError(field as keyof LessonDialogValues, {
                message: msgs[0],
              });
            }
          }
        }
        return;
      }
      toast.success(mode === "create" ? "Lesson added" : "Lesson saved");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Add lesson" : "Edit lesson"}
          </DialogTitle>
          <DialogDescription>
            Pick a type and fill in the content for this lesson.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="lesson-title">Title</Label>
            <Input
              id="lesson-title"
              autoFocus
              {...register("title", { required: "Title is required" })}
            />
            {errors.title && (
              <p className="text-xs text-red-600">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="lesson-type">Type</Label>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <div className="grid gap-2 sm:grid-cols-4">
                  {LESSON_TYPES.map((option) => {
                    const Icon = option.icon;
                    const active = field.value === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => field.onChange(option.value)}
                        className={`min-h-24 rounded-xl border p-3 text-left transition ${
                          active
                            ? "border-zinc-950 bg-zinc-50 ring-1 ring-zinc-950"
                            : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50"
                        }`}
                      >
                        <Icon className="mb-2 h-4 w-4 text-zinc-600" />
                        <span className="block text-sm font-medium text-zinc-900">
                          {option.label}
                        </span>
                        <span className="mt-1 block text-xs leading-4 text-zinc-500">
                          {option.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            />
          </div>

          {typeValue === "TEXT" ? (
            <div className="space-y-2">
              <Label htmlFor="lesson-body">Body</Label>
              <Controller
                control={control}
                name="body"
                render={({ field }) => (
                  <BlogRichTextEditor value={field.value} onChange={field.onChange} compact />
                )}
              />
              {errors.body && (
                <p className="text-xs text-red-600">{errors.body.message}</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {typeValue !== "LINK" ? (
                <>
                  <Label>Private material</Label>
                  <CourseAssetUpload
                    courseId={courseId}
                    asset={assetId ? { id: assetId, name: assetName || "Private asset", kind: assetKind || typeValue, size: assetSize || 0 } : null}
                    onChange={(asset) => {
                      setValue("assetId", asset?.id ?? "", { shouldDirty: true });
                      setValue("assetName", asset?.name ?? "");
                      setValue("assetKind", asset?.kind ?? "");
                      setValue("assetSize", asset?.size ?? 0);
                    }}
                  />
                  <div className="flex items-center gap-3 py-1 text-xs text-zinc-400"><span className="h-px flex-1 bg-zinc-200" />or use an external URL<span className="h-px flex-1 bg-zinc-200" /></div>
                </>
              ) : null}
              <Label htmlFor="lesson-url">{typeValue === "LINK" ? "URL" : "External URL"}</Label>
              <Input
                id="lesson-url"
                placeholder={
                  typeValue === "VIDEO_EMBED"
                    ? "https://www.youtube.com/watch?v=…"
                    : typeValue === "PDF"
                      ? "https://example.com/file.pdf"
                      : "https://example.com/…"
                }
                {...register("url")}
              />
              {errors.url && (
                <p className="text-xs text-red-600">{errors.url.message}</p>
              )}
            </div>
          )}

          {typeValue === "LINK" ? (
            <div className="space-y-2">
              <Label htmlFor="lesson-label">Button label</Label>
              <Input id="lesson-label" {...register("label")} />
              {errors.label && (
                <p className="text-xs text-red-600">{errors.label.message}</p>
              )}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="lesson-duration">Estimated duration (minutes)</Label>
              <Input id="lesson-duration" type="number" min={0} {...register("durationMinutes")} />
            </div>
            <div className="space-y-2">
              <Label>Prerequisite lesson</Label>
              <Controller
                control={control}
                name="prerequisiteLessonId"
                render={({ field }) => (
                  <Select value={field.value || "none"} onValueChange={(value) => field.onChange(value === "none" ? "" : value)}>
                    <SelectTrigger><SelectValue placeholder="No prerequisite" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No prerequisite</SelectItem>
                      {lessonOptions.filter((item) => item.id !== lessonId).map((item) => (
                        <SelectItem key={item.id} value={item.id}>{item.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          {typeValue === "VIDEO_EMBED" ? (
            <div className="space-y-2">
              <Label htmlFor="lesson-transcript">Transcript / captions</Label>
              <Textarea id="lesson-transcript" rows={5} placeholder="Add an accessible transcript…" {...register("transcript")} />
            </div>
          ) : null}

          {(typeValue === "PDF" || typeValue === "LINK") ? (
            <div className="space-y-2">
              <Label htmlFor="attachment-label">Resource label</Label>
              <Input id="attachment-label" placeholder="Download workbook" {...register("attachmentLabel")} />
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <Controller
              control={control}
              name="isPreview"
              render={({ field }) => (
                <div className="rounded-xl border border-zinc-200 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Eye className="h-4 w-4 text-zinc-500" />
                        <Label>Preview lesson</Label>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-zinc-500">
                        Visitors can open this lesson on the public course page
                        before enrolling.
                      </p>
                    </div>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </div>
                  {isPreview ? (
                    <Badge variant="success" className="mt-3">
                      Public preview
                    </Badge>
                  ) : null}
                </div>
              )}
            />

            <Controller
              control={control}
              name="dripEnabled"
              render={({ field }) => (
                <div className="rounded-xl border border-zinc-200 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <CalendarClock className="h-4 w-4 text-zinc-500" />
                        <Label>Drip content</Label>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-zinc-500">
                        Unlock this lesson a number of days after enrollment.
                      </p>
                    </div>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </div>
                  {dripEnabled ? (
                    <div className="mt-3 space-y-2">
                      <Label htmlFor="lesson-drip-days">Unlock after days</Label>
                      <Input
                        id="lesson-drip-days"
                        type="number"
                        min={0}
                        placeholder="3"
                        {...register("dripDays")}
                      />
                      {errors.dripDays && (
                        <p className="text-xs text-red-600">
                          {errors.dripDays.message}
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            />
          </div>

          {serverError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {serverError}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {mode === "create" ? "Add lesson" : "Save lesson"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const LESSON_TYPES: {
  value: LessonType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    value: "TEXT",
    label: "Text",
    description: "Article-style content",
    icon: FileText,
  },
  {
    value: "VIDEO_EMBED",
    label: "Video",
    description: "YouTube or Vimeo embed",
    icon: PlayCircle,
  },
  {
    value: "PDF",
    label: "PDF",
    description: "Preview or download PDF",
    icon: FileText,
  },
  {
    value: "LINK",
    label: "Link",
    description: "External resource",
    icon: Link2,
  },
];
