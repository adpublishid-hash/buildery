"use client";

import { useEffect, useRef } from "react";

import { trackLessonActivityAction } from "@/lib/actions/lms-learning";

export function LessonActivityTracker({ enrollmentId, lessonId }: { enrollmentId: string; lessonId: string }) {
  const lastSent = useRef(Date.now());
  useEffect(() => {
    lastSent.current = Date.now();
    void trackLessonActivityAction(enrollmentId, lessonId, 0, 1);
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      const seconds = Math.round((now - lastSent.current) / 1000);
      lastSent.current = now;
      void trackLessonActivityAction(enrollmentId, lessonId, seconds, 1);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [enrollmentId, lessonId]);
  return null;
}
