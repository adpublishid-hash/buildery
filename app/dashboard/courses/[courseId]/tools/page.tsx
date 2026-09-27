import { notFound, redirect } from "next/navigation";
import { BookOpenCheck, CalendarDays, Copy, Megaphone, Radio, Settings2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  addQuizQuestionAction,
  createAnnouncementAction,
  createAssignmentAction,
  createCohortAction,
  createLiveSessionAction,
  createQuizAction,
  duplicateCourseAction,
  updateCourseAdvancedAction,
} from "@/lib/actions/lms-admin";
import { canInWorkspace } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/workspace";

export const metadata = { title: "Course tools · My Landing" };

export default async function CourseToolsPage({ params }: { params: { courseId: string } }) {
  const { workspace, role } = await requireCurrentWorkspace();
  if (!canInWorkspace(role, "content.edit")) redirect("/dashboard/courses");
  const [course, categories] = await Promise.all([
    prisma.course.findFirst({
      where: { id: params.courseId, workspaceId: workspace.id },
      include: {
        cohorts: { orderBy: { createdAt: "desc" } },
        announcements: { orderBy: { createdAt: "desc" }, take: 10 },
        liveSessions: { orderBy: { startsAt: "asc" }, take: 20 },
        revisions: { orderBy: { version: "desc" }, take: 10 },
        modules: {
          orderBy: { order: "asc" },
          include: {
            lessons: {
              orderBy: { order: "asc" },
              include: { quiz: { include: { questions: { orderBy: { order: "asc" } } } }, assignment: true },
            },
          },
        },
      },
    }),
    prisma.courseCategory.findMany({ where: { workspaceId: workspace.id }, orderBy: { name: "asc" } }),
  ]);
  if (!course) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3"><p className="text-sm text-zinc-500">{course.revisions.length ? `${course.revisions.length} saved publish revision(s)` : "A revision snapshot is created on every first publish."}</p><form action={async () => { "use server"; await duplicateCourseAction(course.id); }}><Button type="submit" variant="outline"><Copy />Duplicate course</Button></form></div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Settings2 className="h-4 w-4" />Learning settings</CardTitle><CardDescription>Access rules, discovery metadata, instructor, certificate, and SEO.</CardDescription></CardHeader>
        <CardContent>
          <form action={async (data) => { "use server"; await updateCourseAdvancedAction(course.id, data); }} className="grid gap-4 md:grid-cols-2">
            <Field label="Instructor name"><Input name="instructorName" defaultValue={course.instructorName ?? ""} /></Field>
            <Field label="Category"><select name="categoryId" defaultValue={course.categoryId ?? ""} className={selectClass}><option value="">Uncategorized</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label="Difficulty"><select name="difficulty" defaultValue={course.difficulty} className={selectClass}><option value="BEGINNER">Beginner</option><option value="INTERMEDIATE">Intermediate</option><option value="ADVANCED">Advanced</option></select></Field>
            <Field label="Estimated duration (minutes)"><Input name="durationMinutes" type="number" min={0} defaultValue={course.durationMinutes} /></Field>
            <Field label="Access duration (days, 0 = lifetime)"><Input name="accessDays" type="number" min={0} defaultValue={course.accessDays} /></Field>
            <Field label="Enrollment limit"><Input name="enrollmentLimit" type="number" min={1} defaultValue={course.enrollmentLimit ?? ""} placeholder="Unlimited" /></Field>
            <Field label="Tags, comma separated"><Input name="tags" defaultValue={course.tags.join(", ")} /></Field>
            <Field label="SEO title"><Input name="seoTitle" defaultValue={course.seoTitle ?? ""} maxLength={160} /></Field>
            <div className="md:col-span-2"><Field label="Instructor bio"><Textarea name="instructorBio" defaultValue={course.instructorBio ?? ""} rows={3} /></Field></div>
            <div className="md:col-span-2"><Field label="Meta description"><Textarea name="metaDescription" defaultValue={course.metaDescription ?? ""} rows={2} maxLength={300} /></Field></div>
            <div className="flex flex-wrap gap-5 md:col-span-2">
              <Check name="sequentialProgress" label="Require lessons in sequence" checked={course.sequentialProgress} />
              <Check name="certificateEnabled" label="Issue certificate on completion" checked={course.certificateEnabled} />
              <Check name="featured" label="Featured in catalog" checked={course.featured} />
            </div>
            <div className="md:col-span-2"><Button type="submit">Save learning settings</Button></div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />Cohorts</CardTitle><CardDescription>Organize learners by intake and schedule.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <form action={async (data) => { "use server"; await createCohortAction(course.id, data); }} className="grid gap-3 sm:grid-cols-2">
              <Input name="name" placeholder="September intake" required className="sm:col-span-2" />
              <Input name="startsAt" type="date" /><Input name="endsAt" type="date" />
              <Input name="capacity" type="number" min={1} placeholder="Capacity" />
              <Button type="submit">Add cohort</Button>
            </form>
            <div className="space-y-2">{course.cohorts.map((cohort) => <div key={cohort.id} className="flex items-center justify-between border-t border-zinc-100 pt-2 text-sm"><span>{cohort.name}</span><Badge variant="outline">{cohort.capacity ? `${cohort.capacity} seats` : "Unlimited"}</Badge></div>)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Megaphone className="h-4 w-4" />Announcements</CardTitle><CardDescription>Updates shown to enrolled learners.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <form action={async (data) => { "use server"; await createAnnouncementAction(course.id, data); }} className="space-y-3">
              <Input name="title" placeholder="Announcement title" required />
              <Textarea name="body" placeholder="Message" required rows={3} />
              <Button type="submit">Publish announcement</Button>
            </form>
            {course.announcements.map((item) => <div key={item.id} className="border-t border-zinc-100 pt-2"><p className="text-sm font-medium">{item.title}</p><p className="line-clamp-2 text-xs text-zinc-500">{item.body}</p></div>)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Radio className="h-4 w-4" />Live sessions</CardTitle><CardDescription>Schedule cohort calls, workshops, and replay links.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <form action={async (data) => { "use server"; await createLiveSessionAction(course.id, data); }} className="grid gap-3 md:grid-cols-2">
            <Input name="title" placeholder="Weekly coaching call" required />
            <Input name="startsAt" type="datetime-local" required />
            <Input name="durationMinutes" type="number" min={1} defaultValue={60} />
            <Input name="joinUrl" type="url" placeholder="https://meet.google.com/..." required />
            <Input name="replayUrl" type="url" placeholder="Replay URL (optional)" />
            <Input name="description" placeholder="Agenda (optional)" />
            <Button type="submit">Schedule session</Button>
          </form>
          <div className="grid gap-2 md:grid-cols-2">{course.liveSessions.map((session) => <div key={session.id} className="rounded-lg border border-zinc-200 px-3 py-2"><p className="text-sm font-medium">{session.title}</p><p className="text-xs text-zinc-500">{session.startsAt.toLocaleString("id-ID")} · {session.durationMinutes} min</p></div>)}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><BookOpenCheck className="h-4 w-4" />Assessments</CardTitle><CardDescription>Add a quiz or assignment to any lesson. Passing or grading completes that lesson automatically.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          {course.modules.flatMap((module) => module.lessons.map((lesson) => ({ ...lesson, moduleTitle: module.title }))).map((lesson) => (
            <section key={lesson.id} className="border-t border-zinc-200 pt-4 first:border-0 first:pt-0">
              <div className="mb-3 flex flex-wrap items-center gap-2"><p className="font-medium">{lesson.title}</p><Badge variant="outline">{lesson.moduleTitle}</Badge>{lesson.quiz ? <Badge variant="success">Quiz</Badge> : null}{lesson.assignment ? <Badge variant="secondary">Assignment</Badge> : null}</div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3 rounded-lg bg-zinc-50 p-3">
                  <p className="text-sm font-medium">Quiz</p>
                  <form action={async (data) => { "use server"; await createQuizAction(lesson.id, data); }} className="grid gap-2 sm:grid-cols-2">
                    <Input name="title" defaultValue={lesson.quiz?.title ?? "Knowledge check"} required className="sm:col-span-2" />
                    <Input name="passScore" type="number" min={1} max={100} defaultValue={lesson.quiz?.passScore ?? 70} />
                    <Input name="maxAttempts" type="number" min={0} defaultValue={lesson.quiz?.maxAttempts ?? 0} title="0 means unlimited" />
                    <label className="flex items-center gap-2 text-xs"><input name="shuffleQuestions" type="checkbox" defaultChecked={lesson.quiz?.shuffleQuestions} /> Shuffle questions</label>
                    <Button type="submit" size="sm">{lesson.quiz ? "Update quiz" : "Create quiz"}</Button>
                  </form>
                  {lesson.quiz ? <form action={async (data) => { "use server"; await addQuizQuestionAction(lesson.quiz!.id, data); }} className="space-y-2 border-t border-zinc-200 pt-3">
                    <Input name="prompt" placeholder="Question" required />
                    <select name="type" className={selectClass}><option value="SINGLE_CHOICE">Single choice</option><option value="MULTIPLE_CHOICE">Multiple choice</option><option value="TRUE_FALSE">True / false</option><option value="SHORT_TEXT">Short text</option></select>
                    <Textarea name="options" placeholder={"Options, one per line\nOption A\nOption B"} rows={3} />
                    <Input name="correctAnswer" placeholder="Correct answer; separate multiple answers with |" required />
                    <Input name="explanation" placeholder="Explanation (optional)" />
                    <Button type="submit" variant="outline" size="sm">Add question</Button>
                    <p className="text-xs text-zinc-500">{lesson.quiz.questions.length} question(s)</p>
                  </form> : null}
                </div>
                <div className="space-y-3 rounded-lg bg-zinc-50 p-3">
                  <p className="text-sm font-medium">Assignment</p>
                  <form action={async (data) => { "use server"; await createAssignmentAction(lesson.id, data); }} className="space-y-2">
                    <Input name="title" defaultValue={lesson.assignment?.title ?? "Practical assignment"} required />
                    <Textarea name="instructions" defaultValue={lesson.assignment?.instructions ?? ""} placeholder="Instructions and acceptance criteria" required rows={4} />
                    <Input name="maxScore" type="number" min={1} defaultValue={lesson.assignment?.maxScore ?? 100} />
                    <Button type="submit" variant="outline" size="sm">{lesson.assignment ? "Update assignment" : "Create assignment"}</Button>
                  </form>
                </div>
              </div>
            </section>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

const selectClass = "flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm";
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
function Check({ name, label, checked }: { name: string; label: string; checked: boolean }) { return <label className="flex items-center gap-2 text-sm"><input type="checkbox" name={name} defaultChecked={checked} />{label}</label>; }
