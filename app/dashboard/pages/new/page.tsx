import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { canInWorkspace } from "@/lib/permissions";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { Card, CardContent } from "@/components/ui/card";
import { CreatePageForm } from "@/components/pages/create-page-form";

export const metadata = { title: "New page · My Landing" };

export default async function NewPagePage() {
  const { role } = await requireCurrentWorkspace();
  if (!canInWorkspace(role, "content.edit")) {
    redirect("/dashboard/pages");
  }

  return (
    <div className="w-full min-w-0">
      <Link
        href="/dashboard/pages"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to pages
      </Link>

      <div className="space-y-1.5 pb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Create a new page
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Give it a title and slug — you&apos;ll design it in the block builder
          next.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <CreatePageForm />
        </CardContent>
      </Card>
    </div>
  );
}
