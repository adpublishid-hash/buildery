import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { CreateWorkspaceForm } from "@/components/workspaces/create-workspace-form";

export const metadata = { title: "New workspace · My Landing" };

export default async function NewWorkspacePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="w-full min-w-0">
      <Link
        href="/dashboard/workspaces"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to workspaces
      </Link>

      <div className="space-y-1.5 pb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Create a new workspace
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Each workspace is its own business — separate sites, products,
          members, and data.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <CreateWorkspaceForm />
        </CardContent>
      </Card>
    </div>
  );
}
