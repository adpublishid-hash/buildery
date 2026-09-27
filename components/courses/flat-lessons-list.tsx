"use client";

import { useState } from "react";
import type { LessonType } from "@prisma/client";
import { FileText, Link2, PenSquare, PlayCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LessonFormDialog,
  type LessonDialogValues,
} from "./lesson-form-dialog";

export type FlatLessonRow = {
  id: string;
  title: string;
  type: LessonType;
  isPreview: boolean;
  dripDays: number | null;
  moduleTitle: string;
  defaultValues: LessonDialogValues;
};

const ICON: Record<LessonType, React.ComponentType<{ className?: string }>> = {
  TEXT: FileText,
  VIDEO_EMBED: PlayCircle,
  PDF: FileText,
  LINK: Link2,
};

const LABEL: Record<LessonType, string> = {
  TEXT: "Text",
  VIDEO_EMBED: "Video",
  PDF: "PDF",
  LINK: "Link",
};

export function FlatLessonsList({ lessons, courseId }: { lessons: FlatLessonRow[]; courseId: string }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<FlatLessonRow | null>(null);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Lesson</TableHead>
            <TableHead>Module</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Access</TableHead>
            <TableHead className="w-12 pr-4 text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lessons.map((lesson) => {
            const Icon = ICON[lesson.type];
            return (
              <TableRow key={lesson.id}>
                <TableCell className="pl-4">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-zinc-400" />
                    <span className="text-sm font-medium text-zinc-900">
                      {lesson.title}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-zinc-500">
                  {lesson.moduleTitle}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{LABEL[lesson.type]}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    {lesson.isPreview ? (
                      <Badge variant="success">Preview</Badge>
                    ) : null}
                    {lesson.dripDays != null ? (
                      <Badge variant="outline">Day {lesson.dripDays}</Badge>
                    ) : null}
                    {!lesson.isPreview && lesson.dripDays == null ? (
                      <span className="text-xs text-zinc-400">Enrolled only</span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Edit lesson"
                    onClick={() => {
                      setActive(lesson);
                      setOpen(true);
                    }}
                  >
                    <PenSquare className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {active ? (
        <LessonFormDialog
          open={open}
          onOpenChange={setOpen}
          mode="edit"
          lessonId={active.id}
          defaultValues={active.defaultValues}
          courseId={courseId}
          lessonOptions={lessons.map((lesson) => ({ id: lesson.id, title: lesson.title }))}
        />
      ) : null}
    </>
  );
}
