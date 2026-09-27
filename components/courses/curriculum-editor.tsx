"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LessonType } from "@prisma/client";
import {
  ArrowDown,
  ArrowUp,
  FileText,
  Lightbulb,
  Layers,
  Link2,
  PenSquare,
  PlayCircle,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import {
  createModuleAction,
  deleteModuleAction,
  moveModuleAction,
  updateModuleAction,
} from "@/lib/actions/module";
import {
  deleteLessonAction,
  moveLessonAction,
} from "@/lib/actions/lesson";
import { cn } from "@/lib/utils";

import {
  LessonFormDialog,
  type LessonDialogValues,
} from "./lesson-form-dialog";

export type LessonRow = {
  id: string;
  title: string;
  type: LessonType;
  isPreview: boolean;
  dripDays: number | null;
  durationMinutes: number;
  transcript: string | null;
  asset: { id: string; name: string; kind: string; size: number } | null;
  attachmentLabel: string | null;
  prerequisiteLessonId: string | null;
  content: {
    body?: string;
    url?: string;
    label?: string;
  };
};

export type ModuleRow = {
  id: string;
  title: string;
  lessons: LessonRow[];
};

type Props = {
  courseId: string;
  modules: ModuleRow[];
};

const LESSON_ICON: Record<LessonType, React.ComponentType<{ className?: string }>> = {
  TEXT: FileText,
  VIDEO_EMBED: PlayCircle,
  PDF: FileText,
  LINK: Link2,
};

const LESSON_TYPE_LABEL: Record<LessonType, string> = {
  TEXT: "Text",
  VIDEO_EMBED: "Video",
  PDF: "PDF",
  LINK: "Link",
};

const MODULE_TEMPLATES = [
  {
    label: "Starter course",
    modules: ["Welcome", "Core lessons", "Practice", "Next steps"],
  },
  {
    label: "4-week program",
    modules: ["Week 1", "Week 2", "Week 3", "Week 4"],
  },
  {
    label: "Mini workshop",
    modules: ["Before you start", "Workshop", "Resources"],
  },
];

function emptyLessonDefaults(): LessonDialogValues {
  return {
    title: "",
    type: "TEXT",
    body: "",
    url: "",
    label: "Open link",
    isPreview: false,
    dripEnabled: false,
    dripDays: "",
    durationMinutes: "0",
    transcript: "",
    assetId: "",
    assetName: "",
    assetKind: "",
    assetSize: 0,
    attachmentLabel: "",
    prerequisiteLessonId: "",
  };
}

function lessonToDialogValues(lesson: LessonRow): LessonDialogValues {
  return {
    title: lesson.title,
    type: lesson.type,
    body: lesson.content.body ?? "",
    url: lesson.content.url ?? "",
    label: lesson.content.label ?? "Open link",
    isPreview: lesson.isPreview,
    dripEnabled: lesson.dripDays != null,
    dripDays: lesson.dripDays != null ? String(lesson.dripDays) : "",
    durationMinutes: String(lesson.durationMinutes),
    transcript: lesson.transcript ?? "",
    assetId: lesson.asset?.id ?? "",
    assetName: lesson.asset?.name ?? "",
    assetKind: lesson.asset?.kind ?? "",
    assetSize: lesson.asset?.size ?? 0,
    attachmentLabel: lesson.attachmentLabel ?? "",
    prerequisiteLessonId: lesson.prerequisiteLessonId ?? "",
  };
}

export function CurriculumEditor({ courseId, modules }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // module dialog state
  const [moduleDialog, setModuleDialog] = useState<{
    open: boolean;
    mode: "create" | "edit";
    moduleId?: string;
    title: string;
  }>({ open: false, mode: "create", title: "" });

  // lesson dialog state
  const [lessonDialog, setLessonDialog] = useState<{
    open: boolean;
    mode: "create" | "edit";
    moduleId?: string;
    lessonId?: string;
    defaultValues: LessonDialogValues;
  }>({ open: false, mode: "create", defaultValues: emptyLessonDefaults() });

  // module delete confirm
  const [moduleDelete, setModuleDelete] = useState<{
    open: boolean;
    moduleId?: string;
    title?: string;
    lessonCount?: number;
  }>({ open: false });

  // lesson delete confirm
  const [lessonDelete, setLessonDelete] = useState<{
    open: boolean;
    lessonId?: string;
    title?: string;
  }>({ open: false });

  function submitModule() {
    const fd = new FormData();
    fd.set("title", moduleDialog.title);
    startTransition(async () => {
      const res =
        moduleDialog.mode === "create"
          ? await createModuleAction(courseId, fd)
          : await updateModuleAction(moduleDialog.moduleId!, fd);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        moduleDialog.mode === "create" ? "Module added" : "Module renamed"
      );
      setModuleDialog({ open: false, mode: "create", title: "" });
      router.refresh();
    });
  }

  function createModule(title: string) {
    const fd = new FormData();
    fd.set("title", title);
    startTransition(async () => {
      const res = await createModuleAction(courseId, fd);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Module added");
      router.refresh();
    });
  }

  function applyTemplate(modulesToCreate: string[]) {
    startTransition(async () => {
      for (const title of modulesToCreate) {
        const fd = new FormData();
        fd.set("title", title);
        const res = await createModuleAction(courseId, fd);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
      }
      toast.success("Curriculum template added");
      router.refresh();
    });
  }

  function moveModule(moduleId: string, direction: "up" | "down") {
    startTransition(async () => {
      const res = await moveModuleAction(moduleId, direction);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  function removeModule() {
    if (!moduleDelete.moduleId) return;
    startTransition(async () => {
      const res = await deleteModuleAction(moduleDelete.moduleId!);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Module deleted");
      setModuleDelete({ open: false });
      router.refresh();
    });
  }

  function moveLesson(lessonId: string, direction: "up" | "down") {
    startTransition(async () => {
      const res = await moveLessonAction(lessonId, direction);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  function removeLesson() {
    if (!lessonDelete.lessonId) return;
    startTransition(async () => {
      const res = await deleteLessonAction(lessonDelete.lessonId!);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Lesson deleted");
      setLessonDelete({ open: false });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          {modules.length === 0
            ? "Start by adding your first module."
            : `${modules.length} module${modules.length === 1 ? "" : "s"}`}
        </p>
        <Button
          onClick={() =>
            setModuleDialog({ open: true, mode: "create", title: "" })
          }
        >
          <Plus /> Add module
        </Button>
      </div>

      {modules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 px-6 py-10">
          <div className="mx-auto max-w-xl text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100">
              <Layers className="h-5 w-5 text-zinc-400" />
            </div>
            <p className="text-sm font-medium text-zinc-900">No modules yet</p>
            <p className="mt-1 text-xs text-zinc-500">
              Start from a template or add one module manually.
            </p>
          </div>
          <div className="mt-6 grid gap-2 md:grid-cols-3">
            {MODULE_TEMPLATES.map((template) => (
              <button
                key={template.label}
                type="button"
                disabled={pending}
                onClick={() => applyTemplate(template.modules)}
                className="rounded-xl border border-zinc-200 bg-white p-4 text-left transition hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Lightbulb className="mb-3 h-4 w-4 text-zinc-400" />
                <p className="text-sm font-medium text-zinc-900">
                  {template.label}
                </p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  {template.modules.join(", ")}
                </p>
              </button>
            ))}
          </div>
          <div className="mt-4 flex justify-center">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => createModule("Introduction")}
            >
              <Plus /> Add introduction module
            </Button>
          </div>
        </div>
      ) : (
        <ol className="space-y-3">
          {modules.map((mod, mIdx) => (
            <li
              key={mod.id}
              className="overflow-hidden rounded-xl border border-zinc-200/70"
            >
              <div className="flex items-center gap-3 border-b border-zinc-200/70 bg-zinc-50/60 px-3 py-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-xs font-semibold text-zinc-500 ring-1 ring-zinc-200">
                  {mIdx + 1}
                </span>
                <button
                  type="button"
                  className="flex-1 truncate text-left text-sm font-medium text-zinc-900 hover:underline"
                  onClick={() =>
                    setModuleDialog({
                      open: true,
                      mode: "edit",
                      moduleId: mod.id,
                      title: mod.title,
                    })
                  }
                >
                  {mod.title}
                </button>
                <div className="flex items-center gap-0.5">
                  <IconBtn
                    aria="Move module up"
                    disabled={pending || mIdx === 0}
                    onClick={() => moveModule(mod.id, "up")}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </IconBtn>
                  <IconBtn
                    aria="Move module down"
                    disabled={pending || mIdx === modules.length - 1}
                    onClick={() => moveModule(mod.id, "down")}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </IconBtn>
                  <IconBtn
                    aria="Rename module"
                    onClick={() =>
                      setModuleDialog({
                        open: true,
                        mode: "edit",
                        moduleId: mod.id,
                        title: mod.title,
                      })
                    }
                  >
                    <PenSquare className="h-3.5 w-3.5" />
                  </IconBtn>
                  <IconBtn
                    aria="Delete module"
                    onClick={() =>
                      setModuleDelete({
                        open: true,
                        moduleId: mod.id,
                        title: mod.title,
                        lessonCount: mod.lessons.length,
                      })
                    }
                    danger
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconBtn>
                </div>
              </div>

              {mod.lessons.length === 0 ? (
                <p className="px-4 py-3 text-xs text-zinc-400">
                  No lessons yet.
                </p>
              ) : (
                <ol className="divide-y divide-zinc-100">
                  {mod.lessons.map((lesson, lIdx) => {
                    const Icon = LESSON_ICON[lesson.type];
                    return (
                      <li
                        key={lesson.id}
                        className="flex items-center gap-3 px-4 py-2"
                      >
                        <Icon className="h-4 w-4 shrink-0 text-zinc-400" />
                        <button
                          type="button"
                          className="flex-1 truncate text-left text-sm text-zinc-700 hover:text-zinc-900 hover:underline"
                          onClick={() =>
                            setLessonDialog({
                              open: true,
                              mode: "edit",
                              lessonId: lesson.id,
                              defaultValues: lessonToDialogValues(lesson),
                            })
                          }
                        >
                          {lesson.title}
                        </button>
                        <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                          {LESSON_TYPE_LABEL[lesson.type]}
                        </span>
                        {lesson.isPreview ? (
                          <Badge variant="success" className="hidden sm:inline-flex">
                            Preview
                          </Badge>
                        ) : null}
                        {lesson.dripDays != null ? (
                          <Badge variant="outline" className="hidden sm:inline-flex">
                            Day {lesson.dripDays}
                          </Badge>
                        ) : null}
                        <div className="flex items-center gap-0.5">
                          <IconBtn
                            aria="Move lesson up"
                            disabled={pending || lIdx === 0}
                            onClick={() => moveLesson(lesson.id, "up")}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </IconBtn>
                          <IconBtn
                            aria="Move lesson down"
                            disabled={pending || lIdx === mod.lessons.length - 1}
                            onClick={() => moveLesson(lesson.id, "down")}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </IconBtn>
                          <IconBtn
                            aria="Edit lesson"
                            onClick={() =>
                              setLessonDialog({
                                open: true,
                                mode: "edit",
                                lessonId: lesson.id,
                                defaultValues: lessonToDialogValues(lesson),
                              })
                            }
                          >
                            <PenSquare className="h-3.5 w-3.5" />
                          </IconBtn>
                          <IconBtn
                            aria="Delete lesson"
                            danger
                            onClick={() =>
                              setLessonDelete({
                                open: true,
                                lessonId: lesson.id,
                                title: lesson.title,
                              })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </IconBtn>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}

              <div className="border-t border-zinc-100 px-3 py-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setLessonDialog({
                      open: true,
                      mode: "create",
                      moduleId: mod.id,
                      defaultValues: emptyLessonDefaults(),
                    })
                  }
                >
                  <Plus /> Add lesson
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {/* Module create/edit dialog */}
      <Dialog
        open={moduleDialog.open}
        onOpenChange={(open) =>
          setModuleDialog((m) => ({ ...m, open }))
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {moduleDialog.mode === "create" ? "Add module" : "Rename module"}
            </DialogTitle>
            <DialogDescription>
              Modules group lessons by topic or week.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="module-title">Title</Label>
            <Input
              id="module-title"
              autoFocus
              value={moduleDialog.title}
              onChange={(e) =>
                setModuleDialog((m) => ({ ...m, title: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitModule();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setModuleDialog((m) => ({ ...m, open: false }))}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              onClick={submitModule}
              disabled={pending || !moduleDialog.title.trim()}
            >
              {moduleDialog.mode === "create" ? "Add module" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LessonFormDialog
        open={lessonDialog.open}
        onOpenChange={(open) =>
          setLessonDialog((l) => ({ ...l, open }))
        }
        mode={lessonDialog.mode}
        moduleId={lessonDialog.moduleId}
        lessonId={lessonDialog.lessonId}
        defaultValues={lessonDialog.defaultValues}
        courseId={courseId}
        lessonOptions={modules.flatMap((module) => module.lessons.map((lesson) => ({ id: lesson.id, title: lesson.title })))}
      />

      {/* Module delete confirm */}
      <AlertDialog
        open={moduleDelete.open}
        onOpenChange={(open) => setModuleDelete((s) => ({ ...s, open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete module &ldquo;{moduleDelete.title}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {moduleDelete.lessonCount && moduleDelete.lessonCount > 0
                ? `This will also delete ${moduleDelete.lessonCount} lesson${
                    moduleDelete.lessonCount === 1 ? "" : "s"
                  } inside the module.`
                : "The module will be removed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                removeModule();
              }}
              disabled={pending}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {pending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lesson delete confirm */}
      <AlertDialog
        open={lessonDelete.open}
        onOpenChange={(open) => setLessonDelete((s) => ({ ...s, open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete lesson &ldquo;{lessonDelete.title}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The lesson and its progress records will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                removeLesson();
              }}
              disabled={pending}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {pending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  disabled,
  aria,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  aria: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={aria}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-30",
        danger && "hover:bg-red-50 hover:text-red-600"
      )}
    >
      {children}
    </button>
  );
}
