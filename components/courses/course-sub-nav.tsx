"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type Props = { courseId: string };

const ITEMS = [
  { slug: "edit", label: "Details" },
  { slug: "modules", label: "Curriculum" },
  { slug: "lessons", label: "Lessons" },
  { slug: "tools", label: "Tools" },
  { slug: "students", label: "Students" },
  { slug: "insights", label: "Insights" },
];

export function CourseSubNav({ courseId }: Props) {
  const pathname = usePathname() ?? "";
  return (
    <nav className="flex border-b border-zinc-200">
      {ITEMS.map((item) => {
        const href = `/dashboard/courses/${courseId}/${item.slug}`;
        const active = pathname === href;
        return (
          <Link
            key={item.slug}
            href={href}
            className={cn(
              "border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-zinc-900 font-medium text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-900"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
