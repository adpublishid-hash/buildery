import Link from "next/link";
import { Eye, PenSquare } from "lucide-react";

type Props = {
  status: string;
  pageId: string;
};

/**
 * Shown to workspace members viewing a non-published page on its public URL.
 * Fixed to the top so it doesn't shift the page layout.
 */
export function PreviewBanner({ status, pageId }: Props) {
  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-xs font-medium text-amber-950">
      <span className="flex items-center gap-1.5">
        <Eye className="h-3.5 w-3.5" />
        Preview — this page is{" "}
        <span className="uppercase tracking-wide">{status.toLowerCase()}</span>{" "}
        and not visible to the public.
      </span>
      <Link
        href={`/dashboard/pages/${pageId}/builder`}
        className="inline-flex items-center gap-1.5 rounded-md bg-amber-950/10 px-2 py-1 transition-colors hover:bg-amber-950/20"
      >
        <PenSquare className="h-3.5 w-3.5" />
        Edit
      </Link>
    </div>
  );
}
