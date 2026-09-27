import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { prisma } from "@/lib/prisma";
import { getStoreWorkspace } from "@/lib/store";
import { parseFieldOptions, parseVisibleIf } from "@/lib/forms";
import { Card, CardContent } from "@/components/ui/card";
import { StoreHeader } from "@/components/store/store-header";
import {
  PublicForm,
  type PublicField,
} from "@/components/forms/public-form";
import {
  getFormAvailability,
  parsePublishedFormFields,
} from "@/lib/form-publication";

export const dynamic = "force-dynamic";

type Params = { workspaceSlug: string; formSlug: string };

async function load(params: Params) {
  const workspace = await getStoreWorkspace(params.workspaceSlug);
  if (!workspace) return null;
  const form = await prisma.form.findFirst({
    where: {
      workspaceId: workspace.id,
      publishedSlug: params.formSlug,
    },
    include: {
      fields: { orderBy: { order: "asc" } },
      _count: { select: { submissions: true } },
    },
  });
  if (!form) return null;
  const version = form.publishedVersion
    ? await prisma.formVersion.findUnique({
        where: {
          formId_version: {
            formId: form.id,
            version: form.publishedVersion,
          },
        },
      })
    : null;
  return { workspace, form, version };
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const r = await load(params);
  if (!r) return { title: "Form not found" };
  return {
    title: {
      absolute: `${r.version?.title ?? r.form.title} · ${r.workspace.name}`,
    },
    description: r.version?.description ?? r.form.description ?? undefined,
    robots: { index: false },
  };
}

export default async function PublicFormPage({
  params,
}: {
  params: Params;
}) {
  const result = await load(params);
  if (!result) notFound();
  const { workspace, form, version } = result;

  const publishedFields = version
    ? parsePublishedFormFields(version.fields)
    : form.fields;
  const fields: PublicField[] = publishedFields.map((f) => ({
    id: f.id,
    label: f.label,
    name: f.name,
    type: f.type,
    required: f.required,
    placeholder: f.placeholder,
    helpText: f.helpText,
    options: parseFieldOptions(f.options),
    pageStep: f.pageStep,
    minLength: f.minLength,
    maxLength: f.maxLength,
    minValue: f.minValue,
    maxValue: f.maxValue,
    pattern: f.pattern,
    patternHint: f.patternHint,
    acceptMime: f.acceptMime,
    visibleIf: parseVisibleIf(f.visibleIf),
  }));
  const publicConfig = version ?? form;
  const availability = getFormAvailability({
    status: form.status,
    isOpen: form.isOpen,
    opensAt: publicConfig.opensAt,
    closesAt: publicConfig.closesAt,
    maxSubmissions: publicConfig.maxSubmissions,
    closedMessage: publicConfig.closedMessage,
    submissionCount: form._count.submissions,
  });

  return (
    <div className="min-h-screen bg-white">
      <StoreHeader
        workspaceSlug={workspace.slug}
        workspaceName={workspace.name}
        workspaceId={workspace.id}
        logoUrl={workspace.logoUrl}
      />

      <main className="mx-auto max-w-xl px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          {publicConfig.title}
        </h1>
        {publicConfig.description ? (
          <p className="mt-2 text-sm text-zinc-500">{publicConfig.description}</p>
        ) : null}

        <Card className="mt-6">
          <CardContent className="pt-6">
            {!availability.accepting ? (
              <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-4 text-center text-sm text-zinc-500">
                {availability.message}
              </p>
            ) : fields.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-6 text-center text-sm text-zinc-400">
                The owner hasn&apos;t added any fields yet.
              </p>
            ) : (
              <PublicForm
                formId={form.id}
                fields={fields}
                submitLabel={publicConfig.submitLabel}
                successMessage={publicConfig.successMessage}
                multiStep={publicConfig.multiStep}
              />
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
