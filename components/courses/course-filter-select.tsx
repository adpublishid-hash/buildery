"use client";

import { useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Course picker that navigates by adding `course=<id>` to `hrefBase`. */
export function CourseFilterSelect({
  courses,
  value,
  hrefBase,
}: {
  courses: { id: string; title: string }[];
  value: string;
  /** Current URL without a course filter. */
  hrefBase: string;
}) {
  const router = useRouter();
  return (
    <Select
      value={value || "ALL"}
      onValueChange={(next) => {
        if (next === "ALL") return router.push(hrefBase);
        const separator = hrefBase.includes("?") ? "&" : "?";
        router.push(`${hrefBase}${separator}course=${encodeURIComponent(next)}`);
      }}
    >
      <SelectTrigger className="w-full sm:w-[240px]" aria-label="Filter by course">
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
  );
}
