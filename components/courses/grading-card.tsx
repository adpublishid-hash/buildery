"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheck, ExternalLink, Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { gradeAssignmentAction, returnAssignmentAction } from "@/lib/actions/lms-admin";
import { formatDate } from "@/lib/utils";

export type GradingItem = {
  id: string;
  status: "SUBMITTED" | "GRADED" | "RETURNED";
  learnerName: string;
  learnerEmail: string;
  courseId: string;
  courseTitle: string;
  lessonTitle: string;
  assignmentTitle: string;
  instructions: string;
  maxScore: number;
  submissionText: string | null;
  fileUrl: string | null;
  submittedAt: Date | null;
  gradedAt: Date | null;
  score: number | null;
  feedback: string | null;
};

export function GradingCard({ item }: { item: GradingItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [score, setScore] = useState(item.score == null ? "" : String(item.score));
  const [feedback, setFeedback] = useState(item.feedback ?? "");
  const [showInstructions, setShowInstructions] = useState(false);
  const [editing, setEditing] = useState(item.status === "SUBMITTED");
  const scoreNumber = Number(score);
  const scoreValid = score.trim() !== "" && Number.isInteger(scoreNumber) && scoreNumber >= 0 && scoreNumber <= item.maxScore;

  function run(kind: "grade" | "return") {
    const fd = new FormData();
    fd.set("score", score);
    fd.set("feedback", feedback);
    startTransition(async () => {
      const res = kind === "grade" ? await gradeAssignmentAction(item.id, fd) : await returnAssignmentAction(item.id, fd);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        kind === "grade"
          ? `${item.learnerName}: ${scoreNumber}/${item.maxScore}. Lesson marked complete.`
          : `Returned to ${item.learnerName} for revision`
      );
      router.refresh();
    });
  }

  return (
    <article className="grid gap-[14px] border-b-[0.8px] border-kv-border px-[14px] py-[14px] last:border-b-0 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-[6px]">
          <p className="text-[13px] font-semibold text-kv-fg">{item.learnerName}</p>
          <span className="text-[12px] text-kv-muted-fg">{item.learnerEmail}</span>
          {item.status === "RETURNED" ? (
            <Badge variant="success" className="before:bg-amber-500">Waiting for resubmission</Badge>
          ) : item.status === "GRADED" ? (
            <Badge variant="success">Graded {item.score}/{item.maxScore}</Badge>
          ) : null}
        </div>
        <p className="mt-[2px] text-[12px] text-kv-muted-fg">
          <Link href={`/dashboard/courses/${item.courseId}/students`} className="hover:text-kv-fg hover:underline">
            {item.courseTitle}
          </Link>{" "}
          · {item.lessonTitle} · {item.assignmentTitle}
          {item.submittedAt ? ` · submitted ${formatDate(item.submittedAt)}` : ""}
        </p>
        <button
          type="button"
          onClick={() => setShowInstructions((value) => !value)}
          className="mt-[6px] text-[11px] font-medium text-kv-muted-fg underline-offset-2 hover:text-kv-fg hover:underline"
        >
          {showInstructions ? "Hide instructions" : "Show instructions"}
        </button>
        {showInstructions ? (
          <p className="mt-[4px] whitespace-pre-wrap rounded-[8px] bg-kv-secondary px-[10px] py-[8px] text-[12px] leading-[1.5] text-kv-secondary-fg">
            {item.instructions}
          </p>
        ) : null}
        <div className="mt-[10px] max-h-[280px] overflow-y-auto whitespace-pre-wrap rounded-[8px] border-[0.8px] border-kv-border bg-kv-card px-[12px] py-[10px] text-[13px] leading-[1.6] text-kv-fg">
          {item.submissionText || <span className="text-kv-muted-fg">No written answer; see the attached file.</span>}
        </div>
        {item.fileUrl ? (
          <a
            href={item.fileUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-[6px] inline-flex items-center gap-[4px] text-[12px] font-medium text-kv-fg underline-offset-2 hover:underline"
          >
            <ExternalLink className="h-[12px] w-[12px]" /> Open attached file
          </a>
        ) : null}
      </div>

      <div className="flex flex-col gap-[10px] rounded-[10px] bg-kv-secondary/60 p-[12px]">
        {!editing ? (
          <>
            {item.feedback ? (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-kv-muted-fg">Your feedback</p>
                <p className="mt-[4px] whitespace-pre-wrap text-[12px] text-kv-secondary-fg">{item.feedback}</p>
              </div>
            ) : null}
            {item.status === "GRADED" ? (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                Change grade
              </Button>
            ) : (
              <p className="text-[12px] text-kv-muted-fg">
                Returned {item.gradedAt ? formatDate(item.gradedAt) : ""}. It comes back to the queue when the learner resubmits.
              </p>
            )}
          </>
        ) : (
          <form
            className="flex flex-col gap-[10px]"
            onSubmit={(e) => {
              e.preventDefault();
              if (scoreValid) run("grade");
            }}
          >
            <div className="space-y-[6px]">
              <Label htmlFor={`score-${item.id}`}>Score</Label>
              <div className="flex items-center gap-[6px]">
                <Input
                  id={`score-${item.id}`}
                  inputMode="numeric"
                  value={score}
                  onChange={(e) => setScore(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
                  className="h-[30px] w-[90px]"
                  aria-invalid={score !== "" && !scoreValid}
                />
                <span className="text-[12px] text-kv-muted-fg">/ {item.maxScore}</span>
              </div>
            </div>
            <div className="space-y-[6px]">
              <Label htmlFor={`feedback-${item.id}`}>Feedback</Label>
              <Textarea
                id={`feedback-${item.id}`}
                rows={3}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="What went well, what to improve"
              />
            </div>
            <div className="flex flex-wrap gap-[6px]">
              <Button type="submit" size="sm" disabled={pending || !scoreValid}>
                {pending ? <Loader2 className="animate-spin" /> : <CircleCheck />} {item.status === "GRADED" ? "Update grade" : "Grade"}
              </Button>
              {item.status === "SUBMITTED" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending || !feedback.trim()}
                  title={feedback.trim() ? undefined : "Write feedback first"}
                  onClick={() => run("return")}
                >
                  <Undo2 /> Return for revision
                </Button>
              ) : (
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
                  Cancel
                </Button>
              )}
            </div>
            <p className="text-[11px] leading-[1.45] text-kv-muted-fg">
              Grading completes the lesson for the learner. Returning keeps it open so they can resubmit.
            </p>
          </form>
        )}
      </div>
    </article>
  );
}
