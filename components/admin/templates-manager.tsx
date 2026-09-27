"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SiteTemplate } from "@prisma/client";
import { Loader2, MoreHorizontal, PenSquare, Plus, Trash2 } from "lucide-react";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createTemplateAction,
  deleteTemplateAction,
  updateTemplateAction,
} from "@/lib/actions/admin";
import { slugify } from "@/lib/slug";

type Values = {
  name: string;
  slug: string;
  description: string;
  thumbnail: string;
  isPublished: "true" | "false";
};

const EMPTY: Values = {
  name: "",
  slug: "",
  description: "",
  thumbnail: "",
  isPublished: "false",
};

export function TemplatesManager({ templates }: { templates: SiteTemplate[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{
    open: boolean;
    mode: "create" | "edit";
    id?: string;
    values: Values;
  }>({ open: false, mode: "create", values: EMPTY });
  const [confirmDelete, setConfirmDelete] = useState<SiteTemplate | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (dialog.open) {
      setErrors({});
      setServerError(null);
    }
  }, [dialog.open]);

  function update(patch: Partial<Values>) {
    setDialog((d) => ({ ...d, values: { ...d.values, ...patch } }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setServerError(null);
    const fd = new FormData();
    for (const [k, v] of Object.entries(dialog.values)) fd.set(k, v);

    startTransition(async () => {
      const res =
        dialog.mode === "create"
          ? await createTemplateAction(fd)
          : await updateTemplateAction(dialog.id!, fd);
      if (!res.ok) {
        setServerError(res.error);
        if (res.fieldErrors) {
          const flat: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.fieldErrors)) {
            if (v?.[0]) flat[k] = v[0];
          }
          setErrors(flat);
        }
        return;
      }
      toast.success(dialog.mode === "create" ? "Template added" : "Template saved");
      setDialog((d) => ({ ...d, open: false }));
      router.refresh();
    });
  }

  function remove() {
    if (!confirmDelete) return;
    startTransition(async () => {
      const res = await deleteTemplateAction(confirmDelete.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Template deleted");
      setConfirmDelete(null);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex justify-end pb-3">
        <Button
          onClick={() =>
            setDialog({ open: true, mode: "create", values: EMPTY })
          }
        >
          <Plus /> New template
        </Button>
      </div>

      {templates.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-10 text-center text-sm text-zinc-400">
          No website templates yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Template</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Block</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12 pr-4 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="pl-4">
                    <p className="text-sm font-medium text-zinc-900">
                      {t.name}
                    </p>
                    {t.description ? (
                      <p className="truncate text-xs text-zinc-500">
                        {t.description}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-zinc-500">
                    {t.slug}
                  </TableCell>
                  <TableCell>
                    {t.blockCount > 0 ? (
                      <span className="text-sm text-zinc-700">
                        {t.blockCount}
                      </span>
                    ) : (
                      // Template tanpa block tidak akan pernah muncul di
                      // builder; katakan, jangan biarkan tampak normal.
                      <Badge variant="outline" className="text-[11px]">
                        Kosong
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={t.isPublished ? "success" : "secondary"}>
                      {t.isPublished ? "Published" : "Draft"}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Template actions"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            setDialog({
                              open: true,
                              mode: "edit",
                              id: t.id,
                              values: {
                                name: t.name,
                                slug: t.slug,
                                description: t.description ?? "",
                                thumbnail: t.thumbnail ?? "",
                                isPublished: t.isPublished ? "true" : "false",
                              },
                            });
                          }}
                        >
                          <PenSquare /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            setConfirmDelete(t);
                          }}
                          className="text-red-600 focus:bg-red-50 focus:text-red-700"
                        >
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog.mode === "create" ? "New template" : "Edit template"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="t-name">Name</Label>
              <Input
                id="t-name"
                value={dialog.values.name}
                onChange={(e) => {
                  const name = e.target.value;
                  update(
                    dialog.mode === "create"
                      ? { name, slug: slugify(name) }
                      : { name }
                  );
                }}
              />
              {errors.name && (
                <p className="text-xs text-red-600">{errors.name}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="t-slug">Slug</Label>
              <Input
                id="t-slug"
                value={dialog.values.slug}
                onChange={(e) => update({ slug: e.target.value })}
              />
              {errors.slug && (
                <p className="text-xs text-red-600">{errors.slug}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="t-desc">Description</Label>
              <Textarea
                id="t-desc"
                rows={2}
                value={dialog.values.description}
                onChange={(e) => update({ description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="t-thumb">Thumbnail URL</Label>
              <Input
                id="t-thumb"
                value={dialog.values.thumbnail}
                onChange={(e) => update({ thumbnail: e.target.value })}
              />
              {errors.thumbnail && (
                <p className="text-xs text-red-600">{errors.thumbnail}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="t-status">Status</Label>
              <Select
                value={dialog.values.isPublished}
                onValueChange={(v) =>
                  update({ isPublished: v as "true" | "false" })
                }
              >
                <SelectTrigger id="t-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">Draft</SelectItem>
                  <SelectItem value="true">Published</SelectItem>
                </SelectContent>
              </Select>
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
                onClick={() => setDialog((d) => ({ ...d, open: false }))}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : null}
                {dialog.mode === "create" ? "Create" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &ldquo;{confirmDelete?.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The template is removed from the gallery.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                remove();
              }}
              disabled={pending}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {pending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
