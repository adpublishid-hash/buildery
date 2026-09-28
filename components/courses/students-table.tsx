"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { EnrollmentStatus } from "@prisma/client";
import {
  Ban,
  Download,
  Loader2,
  MoreHorizontal,
  Play,
  RotateCcw,
  Search,
  UserPlus,
  X,
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
import { TabBar } from "@/components/ui/tab-bar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { bulkEnrollCourseAction, updateEnrollmentAdminAction } from "@/lib/actions/lms-admin";
import { cn, formatDate } from "@/lib/utils";

export type CourseOption = { id: string; title: string; accessDays: number; seatsLeft: number | null };

export type StudentRow = {
  id: string;
  courseId: string;
  courseTitle: string;
  status: EnrollmentStatus;
  name: string;
  email: string;
  cohort: string | null;
  progressPercent: number;
  completedLessons: number;
  totalLessons: number;
  lastAccessedAt: Date | null;
  enrolledAt: Date;
  accessExpiresAt: Date | null;
  certificate: boolean;
};

type Filters = { courseId: string; status: EnrollmentStatus | "ALL"; q: string };

const STATUS_LABEL: Record<EnrollmentStatus, string> = {
  ACTIVE: "Active",
  COMPLETED: "Completed",
  PENDING: "Awaiting payment",
  CANCELLED: "Suspended",
};

const STATUS_DOT: Record<EnrollmentStatus, string> = {
  ACTIVE: "before:bg-sky-500",
  COMPLETED: "",
  PENDING: "before:bg-amber-500",
  CANCELLED: "before:bg-red-500",
};

export function StudentsTable({
  rows,
  courses,
  filters,
  counts,
  matchingCount,
  now,
}: {
  rows: StudentRow[];
  courses: CourseOption[];
  filters: Filters;
  counts: Partial<Record<EnrollmentStatus, number>>;
  matchingCount: number;
  now: number;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/dashboard/courses/students";
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(filters.q);
  const [confirmReset, setConfirmReset] = useState<StudentRow | null>(null);

  function hrefFor(next: Partial<Filters>) {
    const merged = { ...filters, q: query, ...next };
    const params = new URLSearchParams();
    if (merged.courseId) params.set("course", merged.courseId);
    if (merged.status !== "ALL") params.set("status", merged.status);
    if (merged.q.trim()) params.set("q", merged.q.trim());
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function operate(row: StudentRow, operation: "ACTIVATE" | "CANCEL" | "RESET", success: string, done?: () => void) {
    const fd = new FormData();
    fd.set("operation", operation);
    startTransition(async () => {
      const res = await updateEnrollmentAdminAction(row.id, fd);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(success);
      done?.();
      router.refresh();
    });
  }

  const exportHref = hrefFor({}).replace(pathname, `${pathname}/export`);
  const hasFilters = Boolean(filters.courseId || filters.status !== "ALL" || filters.q);

  return (
    <>
      <div className="flex flex-col gap-[10px] border-b-[0.8px] border-kv-border p-[10px]">
        <div className="flex flex-col gap-[10px] lg:flex-row lg:items-center lg:justify-between">
          <TabBar
            ariaLabel="Filter students by status"
            active={filters.status}
            items={[
              { key: "ALL", label: "All", href: hrefFor({ status: "ALL" }) },
              ...(["ACTIVE", "COMPLETED", "PENDING", "CANCELLED"] as EnrollmentStatus[]).map((status) => ({
                key: status,
                label: STATUS_LABEL[status],
                href: hrefFor({ status }),
                count: counts[status],
              })),
            ]}
          />
          <Button asChild size="sm" variant="outline">
            <a href={exportHref}>
              <Download /> Export CSV
            </a>
          </Button>
        </div>
        <div className="grid gap-[8px] sm:grid-cols-[240px_minmax(0,1fr)]">
          <Select
            value={filters.courseId || "ALL"}
            onValueChange={(value) => router.push(hrefFor({ courseId: value === "ALL" ? "" : value }))}
          >
            <SelectTrigger aria-label="Filter by course">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All courses</SelectItem>
              {courses.map((course) => (
                <SelectItem key={course.id} value={course.id}>
                  {course.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(hrefFor({ q: query }));
            }}
          >
            <Search className="pointer-events-none absolute left-[10px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-kv-muted-fg" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search student name or email"
              className="pl-[30px] pr-[30px]"
              aria-label="Search students"
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  router.push(hrefFor({ q: "" }));
                }}
                className="absolute right-[8px] top-1/2 -translate-y-1/2 rounded p-[2px] text-kv-muted-fg hover:text-kv-fg"
                aria-label="Clear search"
              >
                <X className="h-[14px] w-[14px]" />
              </button>
            ) : null}
          </form>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="px-[16px] py-[40px] text-center">
          <p className="text-[13px] font-medium text-kv-fg">No students match</p>
          <p className="mt-[4px] text-[12px] text-kv-muted-fg">Try another course, status, or search.</p>
          {hasFilters ? (
            <Button variant="link" size="sm" className="mt-[6px]" onClick={() => { setQuery(""); router.push(pathname); }}>
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : (
        <Table className="min-w-[940px]">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-[14px]">Student</TableHead>
              <TableHead>Course</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[180px]">Progress</TableHead>
              <TableHead>Last activity</TableHead>
              <TableHead>Access</TableHead>
              <TableHead className="w-[1%] pr-[14px] text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const expired = row.accessExpiresAt !== null && row.accessExpiresAt.getTime() <= now;
              return (
                <TableRow key={row.id}>
                  <TableCell className="pl-[14px]">
                    <p className="text-[13px] font-medium text-kv-fg">{row.name}</p>
                    <p className="truncate text-[12px] text-kv-muted-fg">
                      {row.email}
                      {row.cohort ? ` · ${row.cohort}` : ""}
                    </p>
                  </TableCell>
                  <TableCell className="max-w-[220px]">
                    <Link href={`/dashboard/courses/${row.courseId}/students`} className="block truncate text-[13px] text-kv-fg hover:underline">
                      {row.courseTitle}
                    </Link>
                    <p className="text-[11px] text-kv-muted-fg">Enrolled {formatDate(row.enrolledAt)}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="success" className={STATUS_DOT[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                    {row.certificate ? <p className="mt-[4px] text-[11px] text-kv-muted-fg">Certificate issued</p> : null}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-[8px]">
                      <div className="h-[6px] flex-1 overflow-hidden rounded-full bg-black/[0.07]" aria-hidden>
                        <div
                          className={cn("h-full rounded-full", row.progressPercent >= 100 ? "bg-kv-success" : "bg-kv-fg")}
                          style={{ width: `${Math.min(100, row.progressPercent)}%` }}
                        />
                      </div>
                      <span className="kv-tabular w-[34px] text-right text-[12px] font-medium text-kv-fg">{row.progressPercent}%</span>
                    </div>
                    <p className="mt-[2px] text-[11px] text-kv-muted-fg">
                      {row.completedLessons}/{row.totalLessons} lessons
                    </p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-[12px] text-kv-muted-fg">
                    {row.lastAccessedAt ? formatDate(row.lastAccessedAt) : "Not started"}
                  </TableCell>
                  <TableCell className={cn("whitespace-nowrap text-[12px]", expired ? "text-amber-700" : "text-kv-muted-fg")}>
                    {row.accessExpiresAt ? `${expired ? "Ended" : "Until"} ${formatDate(row.accessExpiresAt)}` : "Lifetime"}
                  </TableCell>
                  <TableCell className="pr-[14px] text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Actions for ${row.name}`} disabled={pending}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        {row.status === "CANCELLED" || row.status === "PENDING" || expired ? (
                          <DropdownMenuItem onSelect={() => operate(row, "ACTIVATE", `${row.name} has access again`)}>
                            <Play /> {expired && row.status !== "CANCELLED" ? "Renew access" : "Activate"}
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onSelect={() => operate(row, "CANCEL", `${row.name} suspended`)}>
                            <Ban /> Suspend access
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-600 focus:bg-red-50 focus:text-red-700"
                          onSelect={(e) => {
                            e.preventDefault();
                            setConfirmReset(row);
                          }}
                        >
                          <RotateCcw /> Reset progress
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {rows.length > 0 ? (
        <p className="kv-tabular border-t-[0.8px] border-kv-border px-[14px] py-[8px] text-[12px] text-kv-muted-fg">
          {matchingCount.toLocaleString()} {matchingCount === 1 ? "enrollment" : "enrollments"}
          {hasFilters ? " match the current filters" : ""}
        </p>
      ) : null}

      <AlertDialog open={Boolean(confirmReset)} onOpenChange={(open) => !open && setConfirmReset(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset {confirmReset?.name}&apos;s progress?</AlertDialogTitle>
            <AlertDialogDescription>
              Lesson progress and quiz attempts in {confirmReset?.courseTitle} are deleted and any certificate is
              revoked. The student keeps access and starts over. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={(e) => {
                e.preventDefault();
                if (confirmReset) operate(confirmReset, "RESET", "Progress reset", () => setConfirmReset(null));
              }}
            >
              {pending ? "Resetting…" : "Reset progress"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function AddStudentsButton({ courses, defaultCourseId }: { courses: CourseOption[]; defaultCourseId?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [courseId, setCourseId] = useState(defaultCourseId && courses.some((c) => c.id === defaultCourseId) ? defaultCourseId : courses[0]?.id ?? "");
  const [students, setStudents] = useState("");
  const [error, setError] = useState<string | null>(null);
  const course = courses.find((item) => item.id === courseId);
  const lines = students.split(/\r?\n/).filter((line) => line.trim()).length;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("students", students);
    startTransition(async () => {
      const res = await bulkEnrollCourseAction(courseId, fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const s = res.data!;
      const parts = [
        s.created ? `${s.created} enrolled` : null,
        s.reactivated ? `${s.reactivated} reactivated` : null,
        s.extended ? `${s.extended} access extended` : null,
        s.unchanged ? `${s.unchanged} already enrolled` : null,
        s.invalid.length ? `${s.invalid.length} invalid line(s) skipped` : null,
      ].filter(Boolean);
      toast.success(parts.join(" · ") || "No changes");
      setStudents("");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={courses.length === 0} title={courses.length ? undefined : "Create a course first"}>
        <UserPlus /> Add students
      </Button>
      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setError(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add students</DialogTitle>
            <DialogDescription>
              Enroll people without payment. New emails become customers and get an access email. Students who
              already completed the course keep their completion.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="add-course">Course</Label>
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger id="add-course">
                  <SelectValue placeholder="Pick a course" />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {course ? (
                <p className="text-[11px] text-kv-muted-fg">
                  Access: {course.accessDays ? `${course.accessDays} days` : "lifetime"}
                  {course.seatsLeft !== null ? ` · ${course.seatsLeft} seat${course.seatsLeft === 1 ? "" : "s"} left` : ""}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-students">Students</Label>
              <Textarea
                id="add-students"
                rows={5}
                value={students}
                onChange={(e) => setStudents(e.target.value)}
                placeholder={"student@example.com\nJane Doe,jane@example.com"}
              />
              <p className="text-[11px] text-kv-muted-fg">One per line: an email, or Name,email. Up to 500.</p>
            </div>
            {error ? (
              <div role="alert" className="rounded-[8px] border-[0.8px] border-red-200 bg-red-50/70 px-[12px] py-[8px] text-[12px] text-red-700">
                {error}
              </div>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !courseId || lines === 0}>
                {pending ? <Loader2 className="animate-spin" /> : <UserPlus />}
                {lines > 1 ? `Enroll ${lines} students` : "Enroll student"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
