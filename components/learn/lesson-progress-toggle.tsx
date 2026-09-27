"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { toggleLessonProgressAction } from "@/lib/actions/enrollment";

type Props = {
  enrollmentId: string;
  lessonId: string;
  completed: boolean;
};

export function LessonProgressToggle({
  enrollmentId,
  lessonId,
  completed,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const res = await toggleLessonProgressAction(
        enrollmentId,
        lessonId,
        !completed
      );
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(completed ? "Lesson marked incomplete" : "Lesson completed");
      router.refresh();
    });
  }

  return (
    <Button
      variant={completed ? "outline" : "default"}
      onClick={toggle}
      disabled={pending}
    >
      {pending ? (
        <Loader2 className="animate-spin" />
      ) : (
        <Check className={completed ? "" : "opacity-60"} />
      )}
      {completed ? "Completed" : "Mark as complete"}
    </Button>
  );
}
