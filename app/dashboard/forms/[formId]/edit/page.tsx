import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  CheckCircle2,
  ExternalLink,
  FileDown,
  Inbox,
  ListChecks,
  Settings2,
  Share2,
} from "lucide-react";

import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { publicSiteHref } from "@/lib/public-url";
import { requireCurrentWorkspace } from "@/lib/workspace";
import { parseFieldOptions, parseVisibleIf } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { EditorHeader, EditorLayout, EditorSection, EditorStatus } from "@/components/dashboard/editor-shell";
import { FormMetaForm } from "@/components/forms/form-meta-form";
import {
  FieldEditor,
  type FieldRow,
} from "@/components/forms/field-editor";
import { CopyLinkButton } from "@/components/forms/copy-link-button";
import { FormPreview } from "@/components/forms/form-preview";
import { FormPublicationActions } from "@/components/forms/form-publication-actions";

export const metadata = { title: "Edit form · My Landing" };

export default async function EditFormPage({
  params,
}: {
  params: { formId: string };
}) {
  const { workspace, role } = await requireCurrentWorkspace();
  if (!canInWorkspace(role, "content.edit")) redirect("/dashboard/forms");

  const form = await prisma.form.findUnique({
    where: { id: params.formId },
    include: {
      fields: { orderBy: { order: "asc" } },
      _count: { select: { submissions: true } },
      versions: {
        orderBy: { version: "desc" },
        take: 5,
        select: { version: true, createdAt: true },
      },
    },
  });
  if (!form || form.workspaceId !== workspace.id) notFound();

  const fields: FieldRow[] = form.fields.map((f) => ({
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
  const publicUrl = publicSiteHref(
    workspace.slug,
    `forms/${form.publishedSlug ?? form.slug}`
  );
  const latestDraftChange = form.fields.reduce(
    (latest, field) =>
      field.updatedAt.getTime() > latest.getTime() ? field.updatedAt : latest,
    form.updatedAt
  );
  const hasDraftChanges =
    !form.publishedAt || latestDraftChange.getTime() > form.publishedAt.getTime();

  const steps = [
    { icon: Settings2, title: "Setup", done: Boolean(form.title && form.slug) },
    { icon: ListChecks, title: "Fields", done: fields.length > 0 },
    { icon: Share2, title: "Share", done: form.status === "PUBLISHED" && fields.length > 0 },
  ];

  return (
    <div className="w-full min-w-0">
      <EditorHeader
        backHref="/dashboard/forms"
        backLabel="Kembali ke form"
        eyebrow="Edit form"
        title={form.title}
        status={
          <EditorStatus tone={form.status === "PUBLISHED" ? "live" : form.status === "CLOSED" ? "archived" : "draft"}>
            {form.status === "PUBLISHED" ? "Terbit" : form.status === "CLOSED" ? "Ditutup" : "Draft"}
          </EditorStatus>
        }
        meta={
          <>
            {hasDraftChanges && form.publishedVersion ? "Ada perubahan belum dipublikasikan · " : ""}
            {fields.length} field · {form._count.submissions.toLocaleString("id-ID")} submission
          </>
        }
        actions={
          <>
            <CopyLinkButton href={publicUrl} />
            <Button asChild variant="outline" size="sm">
              <Link href={`/dashboard/forms/${form.id}/submissions`}>
                <Inbox /> Submissions
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={publicUrl} target="_blank">
                <ExternalLink /> Lihat live
              </Link>
            </Button>
          </>
        }
      />

      <ol className="mb-[12px] flex flex-wrap items-center gap-[6px]" aria-label="Langkah">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="inline-flex h-[28px] items-center gap-[6px] rounded-[8px] border-[0.8px] border-kv-border bg-kv-card px-[10px] text-[12px] font-medium text-kv-secondary-fg"
          >
            {step.done ? (
              <CheckCircle2 className="h-[14px] w-[14px] text-kv-success" />
            ) : (
              <step.icon className="h-[14px] w-[14px] text-kv-subtle" />
            )}
            {index + 1}. {step.title}
          </li>
        ))}
      </ol>

      <EditorLayout
        asideWidth="380px"
        aside={
          <>
            <EditorSection title="Publikasi" description={`Versi ${form.publishedVersion ?? "belum dipublikasikan"}`}>
              <FormPublicationActions
                formId={form.id}
                status={form.status}
                publishedVersion={form.publishedVersion}
                hasDraftChanges={hasDraftChanges}
                versions={form.versions.map((version) => ({
                  version: version.version,
                  createdAt: version.createdAt.toISOString(),
                }))}
              />
            </EditorSection>

          <FormPreview
            title={form.title}
            description={form.description}
            submitLabel={form.submitLabel}
            fields={fields}
          />

            <EditorSection title="Aktivitas & ekspor">
              <div className="space-y-[12px]">
                <div className="grid grid-cols-2 gap-[8px]">
                  <Stat label="Fields" value={fields.length.toLocaleString("id-ID")} />
                  <Stat label="Submissions" value={form._count.submissions.toLocaleString("id-ID")} />
                </div>
                <div className="rounded-[8px] border-[0.8px] border-kv-border bg-kv-secondary px-[10px] py-[8px]">
                  <p className="text-[11px] uppercase tracking-[0.04em] text-kv-muted-fg">URL publik</p>
                  <p className="mt-[2px] truncate font-mono text-[12px] text-kv-fg">/forms/{form.slug}</p>
                </div>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <a href={`/api/forms/${form.id}/export`}>
                    <FileDown /> Export CSV
                  </a>
                </Button>
              </div>
            </EditorSection>
          </>
        }
      >
        <EditorSection
          title="Fields"
          description="Tambah dan urutkan isian yang akan diisi pengunjung."
          action={
            <span className="text-[12px] text-kv-muted-fg">
              {fields.length === 0 ? "Mulai dari nama, email, atau pesan" : `${fields.length} field aktif`}
            </span>
          }
        >
              <FieldEditor
                formId={form.id}
                fields={fields}
                multiStep={form.multiStep}
              />
        </EditorSection>

        <EditorSection title="Pengaturan" description="Teks publik, slug, dan status penerimaan.">
              <FormMetaForm
                mode="edit"
                formId={form.id}
                defaultValues={{
                  title: form.title,
                  slug: form.slug,
                  description: form.description ?? "",
                  successMessage: form.successMessage,
                  submitLabel: form.submitLabel,
                  isOpen: form.isOpen ? "true" : "false",
                  multiStep: form.multiStep ? "true" : "false",
                  notifyEmail: form.notifyEmail ?? "",
                  webhookUrl: form.webhookUrl ?? "",
                  redirectUrl: form.redirectUrl ?? "",
                  opensAt: toDateTimeLocal(form.opensAt),
                  closesAt: toDateTimeLocal(form.closesAt),
                  maxSubmissions:
                    form.maxSubmissions != null
                      ? String(form.maxSubmissions)
                      : "",
                  closedMessage: form.closedMessage,
                }}
              />
        </EditorSection>
      </EditorLayout>
    </div>
  );
}

function toDateTimeLocal(value: Date | null) {
  if (!value) return "";
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border-[0.8px] border-kv-border bg-kv-card px-[10px] py-[8px]">
      <p className="text-[11px] uppercase tracking-[0.04em] text-kv-muted-fg">{label}</p>
      <p className="kv-tabular mt-[2px] text-[17px] font-semibold text-kv-fg">{value}</p>
    </div>
  );
}
