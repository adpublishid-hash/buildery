/* eslint-disable @next/next/no-img-element -- transfer receipts use private, dynamic URLs */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Download, Search, UserRoundCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { bulkEnrollCourseAction, gradeAssignmentAction, reviewEnrollmentPaymentProofAction, updateEnrollmentAdminAction } from "@/lib/actions/lms-admin";
import { canInWorkspace } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { formatPrice } from "@/lib/store";
import { requireCurrentWorkspace } from "@/lib/workspace";

export const metadata = { title: "Course students · My Landing" };

export default async function CourseStudentsPage({ params, searchParams }: { params: { courseId: string }; searchParams: { q?: string; status?: string } }) {
  const { workspace, role } = await requireCurrentWorkspace();
  if (!canInWorkspace(role, "content.edit")) redirect("/dashboard/courses");
  const course = await prisma.course.findFirst({ where: { id: params.courseId, workspaceId: workspace.id }, select: { id: true, title: true } });
  if (!course) notFound();
  const q = (searchParams.q ?? "").trim();
  const status = ["PENDING", "ACTIVE", "CANCELLED", "COMPLETED"].includes(searchParams.status ?? "") ? searchParams.status : "";
  const [totalLessons, enrollments, submissions, cohorts] = await Promise.all([
    prisma.courseLesson.count({ where: { module: { courseId: course.id } } }),
    prisma.enrollment.findMany({
      where: {
        courseId: course.id,
        ...(status ? { status: status as "PENDING" | "ACTIVE" | "CANCELLED" | "COMPLETED" } : {}),
        ...(q ? { customer: { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } } : {}),
      },
      include: {
        customer: { select: { name: true, email: true } },
        cohort: { select: { name: true } },
        certificate: { select: { verificationCode: true, revokedAt: true } },
        payment: { select: { id: true, status: true, amount: true, provider: true, manualProofUrl: true, manualProofStatus: true, manualProofNote: true } },
        _count: { select: { progress: { where: { completedAt: { not: null } } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.assignmentSubmission.findMany({
      where: { assignment: { lesson: { module: { courseId: course.id } } }, status: { in: ["SUBMITTED", "RETURNED"] } },
      include: { customer: { select: { name: true, email: true } }, assignment: { include: { lesson: { select: { title: true } } } } },
      orderBy: { submittedAt: "asc" },
      take: 50,
    }),
    prisma.courseCohort.findMany({ where: { courseId: course.id, isActive: true }, orderBy: { startsAt: "desc" } }),
  ]);

  return <div className="space-y-6">
    <Card><CardHeader><CardTitle>Bulk enrollment</CardTitle><CardDescription>Paste one email per line, or use Name,email. Existing customers are reused.</CardDescription></CardHeader><CardContent><form action={async (data) => { "use server"; await bulkEnrollCourseAction(course.id, data); }} className="grid gap-3 md:grid-cols-[1fr_220px_auto] md:items-end"><Textarea name="students" rows={3} placeholder={"student@example.com\nJane Doe,jane@example.com"} required /><div><label className="text-xs text-zinc-500">Cohort</label><select name="cohortId" className="mt-1 h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm"><option value="">No cohort</option>{cohorts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><Button type="submit">Enroll students</Button></form></CardContent></Card>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <form className="flex flex-1 gap-2">
        <div className="relative max-w-sm flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" /><Input name="q" defaultValue={q} placeholder="Search students" className="pl-9" /></div>
        <select name="status" defaultValue={status} className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm"><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="COMPLETED">Completed</option><option value="PENDING">Pending</option><option value="CANCELLED">Cancelled</option></select>
        <Button type="submit" variant="outline">Filter</Button>
      </form>
      <Button asChild variant="outline"><Link href={`/dashboard/courses/${course.id}/students/export`}><Download />Export CSV</Link></Button>
    </div>

    {enrollments.length === 0 ? <EmptyState icon={UserRoundCheck} title="No students found" description="Enrollments matching this filter will appear here." /> : <Card><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead className="pl-4">Student</TableHead><TableHead>Status</TableHead><TableHead>Progress</TableHead><TableHead>Activity</TableHead><TableHead>Access</TableHead><TableHead className="pr-4">Actions</TableHead></TableRow></TableHeader><TableBody>{enrollments.map((item) => <TableRow key={item.id}>
      <TableCell className="pl-4"><p className="font-medium">{item.customer.name}</p><p className="text-xs text-zinc-500">{item.customer.email}{item.cohort ? ` · ${item.cohort.name}` : ""}</p></TableCell>
      <TableCell><Badge variant={item.status === "COMPLETED" ? "success" : item.status === "ACTIVE" ? "default" : "outline"}>{item.status}</Badge></TableCell>
      <TableCell><p className="text-sm font-medium">{item.progressPercent}%</p><p className="text-xs text-zinc-500">{item._count.progress}/{totalLessons} lessons</p></TableCell>
      <TableCell className="text-xs text-zinc-500">{item.lastAccessedAt ? formatDate(item.lastAccessedAt) : "Not started"}<br />{formatTime(item.totalTimeSeconds)}</TableCell>
      <TableCell className="text-xs text-zinc-500">{item.accessExpiresAt ? formatDate(item.accessExpiresAt) : "Lifetime"}{item.certificate && !item.certificate.revokedAt ? <><br />Certificate issued</> : null}</TableCell>
      <TableCell className="pr-4"><div className="flex flex-wrap gap-1">{item.status === "CANCELLED" ? <Operation enrollmentId={item.id} operation="ACTIVATE" label="Activate" /> : <Operation enrollmentId={item.id} operation="CANCEL" label="Suspend" />}<Operation enrollmentId={item.id} operation="RESET" label="Reset" /></div></TableCell>
    </TableRow>)}</TableBody></Table></CardContent></Card>}

    {enrollments.some((item) => item.payment?.manualProofStatus === "PENDING") ? <Card><CardHeader><CardTitle>Manual payment review</CardTitle><CardDescription>Verify transfer receipts before course access is activated.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">{enrollments.filter((item) => item.payment?.manualProofStatus === "PENDING").map((item) => <div key={item.id} className="rounded-lg border border-zinc-200 p-4"><p className="font-medium">{item.customer.name}</p><p className="text-xs text-zinc-500">{item.customer.email} · {item.payment ? formatPrice(item.payment.amount) : ""}</p>{item.payment?.manualProofUrl ? <a href={item.payment.manualProofUrl} target="_blank" rel="noreferrer"><img src={item.payment.manualProofUrl} alt="Transfer receipt" className="mt-3 max-h-56 w-full object-contain" /></a> : null}{item.payment?.manualProofNote ? <p className="mt-2 text-xs text-zinc-600">{item.payment.manualProofNote}</p> : null}<div className="mt-3 flex gap-2"><ProofOperation paymentId={item.payment!.id} approved /><ProofOperation paymentId={item.payment!.id} approved={false} /></div></div>)}</CardContent></Card> : null}

    <Card><CardHeader><CardTitle>Assignment grading</CardTitle><CardDescription>Submitted work waiting for instructor feedback.</CardDescription></CardHeader><CardContent className="space-y-4">{submissions.length === 0 ? <p className="text-sm text-zinc-500">No assignments waiting for review.</p> : submissions.map((submission) => <form key={submission.id} action={async (data) => { "use server"; await gradeAssignmentAction(submission.id, data); }} className="grid gap-3 border-t border-zinc-200 pt-4 first:border-0 first:pt-0 md:grid-cols-[1fr_120px_1fr_auto] md:items-end">
      <div><p className="text-sm font-medium">{submission.customer.name} · {submission.assignment.lesson.title}</p><p className="mt-1 whitespace-pre-wrap text-xs text-zinc-600">{submission.submissionText || "File submission"}</p>{submission.fileUrl ? <a className="text-xs underline" href={submission.fileUrl} target="_blank" rel="noreferrer">Open file</a> : null}</div>
      <div><label className="text-xs text-zinc-500">Score / {submission.assignment.maxScore}</label><Input name="score" type="number" min={0} max={submission.assignment.maxScore} required /></div>
      <div><label className="text-xs text-zinc-500">Feedback</label><Textarea name="feedback" rows={2} /></div>
      <Button type="submit">Grade</Button>
    </form>)}</CardContent></Card>
  </div>;
}

function Operation({ enrollmentId, operation, label }: { enrollmentId: string; operation: string; label: string }) { return <form action={async (data) => { "use server"; await updateEnrollmentAdminAction(enrollmentId, data); }}><input type="hidden" name="operation" value={operation} /><Button type="submit" size="sm" variant="outline">{label}</Button></form>; }
function ProofOperation({ paymentId, approved }: { paymentId: string; approved: boolean }) { return <form action={async () => { "use server"; await reviewEnrollmentPaymentProofAction(paymentId, approved); }}><Button type="submit" size="sm" variant={approved ? "default" : "outline"}>{approved ? "Verify" : "Reject"}</Button></form>; }
function formatTime(seconds: number) { const minutes = Math.round(seconds / 60); return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`; }
