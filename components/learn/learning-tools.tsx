"use client";

import { useState, useTransition } from "react";
import { Bookmark, ClipboardCheck, Loader2, MessageCircle, NotebookPen, Send, Star } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  postCourseDiscussionAction,
  saveCourseNoteAction,
  submitAssignmentAction,
  submitCourseReviewAction,
  submitQuizAction,
  toggleLessonBookmarkAction,
} from "@/lib/actions/lms-learning";

export function LessonPersonalTools({ enrollmentId, lessonId, initialNote, initialBookmarked }: { enrollmentId: string; lessonId: string; initialNote: string; initialBookmarked: boolean }) {
  const [note, setNote] = useState(initialNote);
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [pending, startTransition] = useTransition();
  function saveNote() {
    startTransition(async () => {
      const result = await saveCourseNoteAction(enrollmentId, lessonId, note);
      if (result.ok) toast.success("Note saved");
      else toast.error(result.error);
    });
  }
  function toggleBookmark() {
    startTransition(async () => {
      const next = !bookmarked;
      const result = await toggleLessonBookmarkAction(enrollmentId, lessonId, next);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setBookmarked(next);
      toast.success(next ? "Lesson bookmarked" : "Bookmark removed");
    });
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-lg border border-zinc-200 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium"><NotebookPen className="h-4 w-4" />Private note</div>
        <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} placeholder="Capture a key idea..." />
        <Button className="mt-2" size="sm" variant="outline" onClick={saveNote} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null}Save note</Button>
      </div>
      <div className="rounded-lg border border-zinc-200 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Bookmark className="h-4 w-4" />Bookmark</div>
        <p className="text-xs leading-5 text-zinc-500">Keep this lesson easy to find from your member account.</p>
        <Button className="mt-3" size="sm" variant={bookmarked ? "default" : "outline"} onClick={toggleBookmark} disabled={pending}><Bookmark className="h-4 w-4" />{bookmarked ? "Bookmarked" : "Add bookmark"}</Button>
      </div>
    </div>
  );
}

type Discussion = { id: string; body: string; createdAt: Date; customer: { name: string } };

export function DiscussionPanel({ enrollmentId, lessonId, discussions }: { enrollmentId: string; lessonId: string; discussions: Discussion[] }) {
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  function submit() {
    startTransition(async () => {
      const result = await postCourseDiscussionAction(enrollmentId, lessonId, body);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setBody("");
      toast.success("Message posted");
    });
  }
  return <section className="rounded-lg border border-zinc-200 p-4">
    <h2 className="flex items-center gap-2 text-sm font-semibold"><MessageCircle className="h-4 w-4" />Lesson discussion</h2>
    <div className="mt-3 space-y-3">{discussions.length ? discussions.map((item) => <div key={item.id} className="border-b border-zinc-100 pb-3 last:border-0"><div className="flex items-center justify-between gap-2"><p className="text-xs font-medium">{item.customer.name}</p><time className="text-[11px] text-zinc-400">{new Date(item.createdAt).toLocaleDateString("id-ID")}</time></div><p className="mt-1 whitespace-pre-wrap text-sm text-zinc-600">{item.body}</p></div>) : <p className="text-xs text-zinc-500">No discussion yet.</p>}</div>
    <div className="mt-3 flex gap-2"><Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={2} placeholder="Ask a question or share an insight" /><Button size="icon" onClick={submit} disabled={pending || !body.trim()} aria-label="Post message">{pending ? <Loader2 className="animate-spin" /> : <Send />}</Button></div>
  </section>;
}

type QuizQuestion = { id: string; prompt: string; type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_TEXT"; options: unknown };
type Quiz = { id: string; title: string; description: string | null; passScore: number; maxAttempts: number; questions: QuizQuestion[]; attempts: Array<{ score: number; passed: boolean }> };

export function QuizPlayer({ enrollmentId, quiz }: { enrollmentId: string; quiz: Quiz }) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [pending, startTransition] = useTransition();
  const best = quiz.attempts.reduce((score, item) => Math.max(score, item.score), 0);
  const exhausted = quiz.maxAttempts > 0 && quiz.attempts.length >= quiz.maxAttempts;
  function answer(questionId: string, value: string, multiple: boolean) {
    setAnswers((current) => {
      if (!multiple) return { ...current, [questionId]: [value] };
      const selected = current[questionId] ?? [];
      return { ...current, [questionId]: selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value] };
    });
  }
  function submit() {
    startTransition(async () => {
      const result = await submitQuizAction(enrollmentId, quiz.id, answers);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast[result.data?.passed ? "success" : "error"](`Score ${result.data?.score}%. ${result.data?.passed ? "Passed" : "Try again"}.`);
    });
  }
  return <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-semibold">{quiz.title}</h2>{quiz.description ? <p className="mt-1 text-sm text-zinc-500">{quiz.description}</p> : null}</div><span className="text-xs text-zinc-500">Pass {quiz.passScore}% · Best {best}%</span></div>
    <div className="mt-4 space-y-4">{quiz.questions.map((question, index) => { const options = optionsFor(question); return <fieldset key={question.id}><legend className="text-sm font-medium">{index + 1}. {question.prompt}</legend>{question.type === "SHORT_TEXT" ? <Input className="mt-2" value={answers[question.id]?.[0] ?? ""} onChange={(event) => answer(question.id, event.target.value, false)} /> : <div className="mt-2 grid gap-2">{options.map((option) => <label key={option} className="flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"><input type={question.type === "MULTIPLE_CHOICE" ? "checkbox" : "radio"} name={question.id} checked={(answers[question.id] ?? []).includes(option)} onChange={() => answer(question.id, option, question.type === "MULTIPLE_CHOICE")} />{option}</label>)}</div>}</fieldset>; })}</div>
    <Button className="mt-4" onClick={submit} disabled={pending || exhausted || quiz.questions.length === 0}>{pending ? <Loader2 className="animate-spin" /> : null}{exhausted ? "Attempts exhausted" : "Submit quiz"}</Button>
  </section>;
}

export function AssignmentPanel({ enrollmentId, assignment }: { enrollmentId: string; assignment: { id: string; title: string; instructions: string; maxScore: number; submissions: Array<{ status: string; submissionText: string | null; fileUrl: string | null; score: number | null; feedback: string | null }> } }) {
  const existing = assignment.submissions[0];
  const [text, setText] = useState(existing?.submissionText ?? "");
  const [url, setUrl] = useState(existing?.fileUrl ?? "");
  const [pending, startTransition] = useTransition();
  function submit() { startTransition(async () => { const result = await submitAssignmentAction(enrollmentId, assignment.id, text, url); if (result.ok) toast.success("Assignment submitted"); else toast.error(result.error); }); }
  return <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-4"><div className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4" /><h2 className="font-semibold">{assignment.title}</h2></div><p className="mt-2 whitespace-pre-wrap text-sm text-zinc-600">{assignment.instructions}</p>{existing?.status === "GRADED" ? <div className="mt-3 rounded-md bg-emerald-50 p-3 text-sm text-emerald-900"><p className="font-medium">Score {existing.score}/{assignment.maxScore}</p>{existing.feedback ? <p className="mt-1">{existing.feedback}</p> : null}</div> : <>{existing?.status === "RETURNED" ? <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p className="font-medium">Returned for revision</p>{existing.feedback ? <p className="mt-1 whitespace-pre-wrap">{existing.feedback}</p> : null}<p className="mt-1 text-xs">Update your answer below and resubmit.</p></div> : existing?.status === "SUBMITTED" ? <p className="mt-3 rounded-md bg-white p-2 text-xs text-zinc-600">Submitted. Waiting for your instructor to review it; you can still update your answer.</p> : null}<Textarea className="mt-3" value={text} onChange={(event) => setText(event.target.value)} rows={5} placeholder="Write your answer" /><Input className="mt-2" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Optional file URL" /><Button className="mt-3" onClick={submit} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null}{existing ? "Resubmit assignment" : "Submit assignment"}</Button></>}</section>;
}

export function CourseReviewPanel({ enrollmentId, existing }: { enrollmentId: string; existing?: { rating: number; title: string | null; body: string | null } | null }) {
  const [rating, setRating] = useState(existing?.rating ?? 5);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [pending, startTransition] = useTransition();
  function submit() { startTransition(async () => { const result = await submitCourseReviewAction(enrollmentId, rating, title, body); if (result.ok) toast.success("Review sent for approval"); else toast.error(result.error); }); }
  return <section className="rounded-lg border border-amber-200 bg-amber-50 p-4"><h2 className="flex items-center gap-2 font-semibold"><Star className="h-4 w-4" />Review this course</h2><div className="mt-3 flex gap-1">{[1,2,3,4,5].map((value) => <button key={value} type="button" onClick={() => setRating(value)} aria-label={`${value} stars`}><Star className={`h-6 w-6 ${value <= rating ? "fill-amber-400 text-amber-400" : "text-zinc-300"}`} /></button>)}</div><Input className="mt-3" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Review title" /><Textarea className="mt-2" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Share your experience" rows={3} /><Button className="mt-3" size="sm" onClick={submit} disabled={pending}>Submit review</Button></section>;
}

function optionsFor(question: QuizQuestion) {
  if (question.type === "TRUE_FALSE") return ["True", "False"];
  return Array.isArray(question.options) ? question.options.map(String) : [];
}
