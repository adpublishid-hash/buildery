"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, Combine, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createBlogCategoryAction,
  createBlogTagAction,
  deleteBlogCategoryAction,
  deleteBlogTagAction,
  mergeBlogCategoryAction,
  mergeBlogTagAction,
  renameBlogCategoryAction,
  renameBlogTagAction,
} from "@/lib/actions/blog";

type Item = { id: string; name: string; slug: string; postCount: number };
type Kind = "category" | "tag";

export function CategoryManager({ categories, tags }: { categories: Item[]; tags: Item[] }) {
  return (
    <div className="space-y-8">
      <TaxonomySection kind="category" items={categories} />
      <TaxonomySection kind="tag" items={tags} />
    </div>
  );
}

function TaxonomySection({ kind, items }: { kind: Kind; items: Item[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [merging, setMerging] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState("");
  const label = kind === "category" ? "Category" : "Tag";

  function run(task: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        toast.error(result.error || "Action failed");
        return;
      }
      toast.success(success);
      setName("");
      setEditing(null);
      setMerging(null);
      setMergeTarget("");
      router.refresh();
    });
  }

  function add() {
    if (!name.trim()) return;
    const data = new FormData();
    data.set("name", name.trim());
    run(
      () => kind === "category" ? createBlogCategoryAction(data) : createBlogTagAction(data),
      `${label} added`
    );
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-zinc-900">{label}s</h2>
      <div className="mt-3 flex gap-2">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder={`New ${kind} name`}
        />
        <Button type="button" onClick={add} disabled={pending || !name.trim()}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus />} Add
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">No {kind}s yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
          {items.map((item) => (
            <li key={item.id} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  {editing === item.id ? (
                    <Input autoFocus value={editName} onChange={(event) => setEditName(event.target.value)} />
                  ) : (
                    <>
                      <p className="truncate text-sm font-medium text-zinc-900">{item.name}</p>
                      <p className="truncate text-xs text-zinc-500">
                        /{item.slug} · {item.postCount} post{item.postCount === 1 ? "" : "s"}
                      </p>
                    </>
                  )}
                </div>

                {editing === item.id ? (
                  <>
                    <IconButton label="Save name" onClick={() => run(
                      () => kind === "category"
                        ? renameBlogCategoryAction(item.id, editName)
                        : renameBlogTagAction(item.id, editName),
                      `${label} renamed`
                    )}><Check /></IconButton>
                    <IconButton label="Cancel edit" onClick={() => setEditing(null)}><X /></IconButton>
                  </>
                ) : (
                  <>
                    <IconButton label={`Rename ${kind}`} onClick={() => {
                      setEditing(item.id);
                      setEditName(item.name);
                    }}><Pencil /></IconButton>
                    {items.length > 1 ? (
                      <IconButton label={`Merge ${kind}`} onClick={() => setMerging(merging === item.id ? null : item.id)}>
                        <Combine />
                      </IconButton>
                    ) : null}
                    <IconButton label={`Delete ${kind}`} destructive onClick={() => {
                      if (!window.confirm(`Delete ${label.toLowerCase()} “${item.name}”?`)) return;
                      run(
                        () => kind === "category" ? deleteBlogCategoryAction(item.id) : deleteBlogTagAction(item.id),
                        `${label} deleted`
                      );
                    }}><Trash2 /></IconButton>
                  </>
                )}
              </div>

              {merging === item.id ? (
                <div className="mt-3 flex gap-2 border-t border-zinc-100 pt-3">
                  <select
                    value={mergeTarget}
                    onChange={(event) => setMergeTarget(event.target.value)}
                    className="h-9 min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                  >
                    <option value="">Merge into...</option>
                    {items.filter((candidate) => candidate.id !== item.id).map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                    ))}
                  </select>
                  <Button type="button" variant="outline" disabled={pending || !mergeTarget} onClick={() => run(
                    () => kind === "category"
                      ? mergeBlogCategoryAction(item.id, mergeTarget)
                      : mergeBlogTagAction(item.id, mergeTarget),
                    `${label}s merged`
                  )}><Combine /> Merge</Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function IconButton({ label, destructive, onClick, children }: {
  label: string;
  destructive?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors ${
        destructive
          ? "text-zinc-400 hover:bg-red-50 hover:text-red-600"
          : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
      } [&_svg]:h-4 [&_svg]:w-4`}
    >
      {children}
    </button>
  );
}
