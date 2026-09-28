"use client";

import { usePathname } from "next/navigation";
import { ClipboardCheck, GraduationCap, PanelsTopLeft, Users } from "lucide-react";

import { TabBar } from "@/components/ui/tab-bar";

const items = [
  { key: "courses", href: "/dashboard/courses", label: "Courses", icon: GraduationCap },
  { key: "students", href: "/dashboard/courses/students", label: "Students", icon: Users },
  { key: "grading", href: "/dashboard/courses/grading", label: "Grading", icon: ClipboardCheck },
  { key: "settings", href: "/dashboard/courses/settings", label: "Catalog page", icon: PanelsTopLeft },
];

/** Section tabs for the workspace-wide LMS pages (not the per-course editor). */
export function LmsNav({ toGrade = 0 }: { toGrade?: number }) {
  const pathname = usePathname() ?? "";
  const active =
    items.find((item) => item.key !== "courses" && pathname.startsWith(item.href))?.key ?? "courses";
  return (
    <TabBar
      ariaLabel="Course sections"
      active={active}
      className="mb-[16px]"
      items={items.map((item) => ({ ...item, count: item.key === "grading" ? toGrade : undefined }))}
    />
  );
}
