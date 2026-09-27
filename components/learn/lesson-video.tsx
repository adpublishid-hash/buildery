"use client";

import { useRef } from "react";

import { trackLessonActivityAction } from "@/lib/actions/lms-learning";

export function LessonVideo({ src, enrollmentId, lessonId }: { src: string; enrollmentId: string; lessonId: string }) {
  const lastReported = useRef(0);
  return <video
    src={src}
    controls
    controlsList="nodownload"
    className="aspect-video w-full rounded-xl bg-black"
    preload="metadata"
    onTimeUpdate={(event) => {
      const video = event.currentTarget;
      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      const percent = Math.round((video.currentTime / video.duration) * 100);
      if (percent < lastReported.current + 10 && percent < 95) return;
      lastReported.current = percent;
      void trackLessonActivityAction(enrollmentId, lessonId, 0, percent);
    }}
  />;
}
