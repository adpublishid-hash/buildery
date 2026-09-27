"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { parsePublicHttpUrl } from "@/lib/outbound-url";
import { getCurrentWorkspace } from "@/lib/workspace";
import { slugify } from "@/lib/slug";
import { formSchema } from "@/lib/zod";
import {
  parsePublishedFormFields,
  snapshotFormFields,
} from "@/lib/form-publication";
import { deleteManyFormSubmissionUploads } from "@/lib/form-upload";
import { reportError } from "@/lib/error-reporting";
import { assertCanCreate } from "@/lib/saas-limits";

type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

async function requireEditableWorkspace() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) return null;
  return current.workspace;
}

function parseForm(formData: FormData) {
  return formSchema.safeParse({
    title: formData.get("title"),
    slug: formData.get("slug"),
    description: (formData.get("description") as string | null) || undefined,
    successMessage:
      (formData.get("successMessage") as string | null) || undefined,
    submitLabel: (formData.get("submitLabel") as string | null) || undefined,
    isOpen: formData.get("isOpen") === "true",
    multiStep: formData.get("multiStep") === "true",
    notifyEmail: (formData.get("notifyEmail") as string | null) || undefined,
    webhookUrl: (formData.get("webhookUrl") as string | null) || undefined,
    redirectUrl: (formData.get("redirectUrl") as string | null) || undefined,
    opensAt: (formData.get("opensAt") as string | null) || undefined,
    closesAt: (formData.get("closesAt") as string | null) || undefined,
    maxSubmissions:
      (formData.get("maxSubmissions") as string | null) || undefined,
    closedMessage:
      (formData.get("closedMessage") as string | null) || undefined,
  });
}

/**
 * The webhook URL is fetched by the server, so it gets the same host check
 * the delivery applies. Doing it here too means the author sees the problem
 * while editing instead of discovering it in a failed delivery.
 */
function webhookUrlError(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const checked = parsePublicHttpUrl(value);
  return checked.ok ? null : checked.error;
}

export async function createFormAction(
  formData: FormData
): Promise<ActionResult<{ formId: string }>> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  const overLimit = await assertCanCreate(workspace.createdById, "form");
  if (overLimit) return { ok: false, error: overLimit };

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the form for errors.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const slug = slugify(parsed.data.slug);
  const conflict = await prisma.form.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
    select: { id: true },
  });
  if (conflict) {
    return {
      ok: false,
      error: "That slug is already taken.",
      fieldErrors: { slug: ["That slug is already taken."] },
    };
  }

  const webhookError = webhookUrlError(parsed.data.webhookUrl);
  if (webhookError) {
    return {
      ok: false,
      error: webhookError,
      fieldErrors: { webhookUrl: [webhookError] },
    };
  }

  const form = await prisma.form.create({
    data: {
      workspaceId: workspace.id,
      title: parsed.data.title.trim(),
      slug,
      description: parsed.data.description?.trim() || null,
      successMessage:
        parsed.data.successMessage?.trim() ||
        "Thanks! We received your submission.",
      submitLabel: parsed.data.submitLabel?.trim() || "Submit",
      isOpen: false,
      status: "DRAFT",
      multiStep: parsed.data.multiStep ?? false,
      notifyEmail: parsed.data.notifyEmail?.trim() || null,
      webhookUrl: parsed.data.webhookUrl?.trim() || null,
      redirectUrl: parsed.data.redirectUrl?.trim() || null,
      opensAt: parsed.data.opensAt ?? null,
      closesAt: parsed.data.closesAt ?? null,
      maxSubmissions: parsed.data.maxSubmissions ?? null,
      closedMessage:
        parsed.data.closedMessage?.trim() ||
        "This form is closed and no longer accepting submissions.",
    },
  });

  revalidatePath("/dashboard/forms");
  return { ok: true, data: { formId: form.id } };
}

export async function updateFormAction(
  formId: string,
  formData: FormData
): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: { workspaceId: true },
  });
  if (!form || form.workspaceId !== workspace.id)
    return { ok: false, error: "Form not found." };

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the form for errors.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const slug = slugify(parsed.data.slug);
  const slugConflict = await prisma.form.findFirst({
    where: { workspaceId: workspace.id, slug, NOT: { id: formId } },
    select: { id: true },
  });
  if (slugConflict) {
    return {
      ok: false,
      error: "That slug is already taken.",
      fieldErrors: { slug: ["That slug is already taken."] },
    };
  }

  const webhookError = webhookUrlError(parsed.data.webhookUrl);
  if (webhookError) {
    return {
      ok: false,
      error: webhookError,
      fieldErrors: { webhookUrl: [webhookError] },
    };
  }

  await prisma.form.update({
    where: { id: formId },
    data: {
      title: parsed.data.title.trim(),
      slug,
      description: parsed.data.description?.trim() || null,
      successMessage:
        parsed.data.successMessage?.trim() ||
        "Thanks! We received your submission.",
      submitLabel: parsed.data.submitLabel?.trim() || "Submit",
      isOpen: parsed.data.isOpen,
      multiStep: parsed.data.multiStep ?? false,
      notifyEmail: parsed.data.notifyEmail?.trim() || null,
      webhookUrl: parsed.data.webhookUrl?.trim() || null,
      redirectUrl: parsed.data.redirectUrl?.trim() || null,
      opensAt: parsed.data.opensAt ?? null,
      closesAt: parsed.data.closesAt ?? null,
      maxSubmissions: parsed.data.maxSubmissions ?? null,
      closedMessage:
        parsed.data.closedMessage?.trim() ||
        "This form is closed and no longer accepting submissions.",
    },
  });

  revalidatePath("/dashboard/forms");
  revalidatePath(`/dashboard/forms/${formId}/edit`);
  return { ok: true };
}

export async function deleteFormAction(
  formId: string
): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: {
      workspaceId: true,
      submissions: { select: { id: true } },
    },
  });
  if (!form || form.workspaceId !== workspace.id)
    return { ok: false, error: "Form not found." };

  await prisma.form.delete({ where: { id: formId } });
  const cleanup = await deleteManyFormSubmissionUploads(
    form.submissions.map((submission) => submission.id)
  );
  if (cleanup.failed > 0) {
    reportError(
      "form upload cleanup failed",
      new Error(`${cleanup.failed} submission directories could not be removed`)
    );
  }
  revalidatePath("/dashboard/forms");
  return { ok: true };
}

export async function duplicateFormAction(
  formId: string
): Promise<ActionResult<{ formId: string }>> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  const source = await prisma.form.findUnique({
    where: { id: formId },
    include: { fields: { orderBy: { order: "asc" } } },
  });
  if (!source || source.workspaceId !== workspace.id) {
    return { ok: false, error: "Form not found." };
  }

  const baseSlug = source.slug;
  let nextSlug = `${baseSlug}-copy`;
  let suffix = 2;
  while (
    await prisma.form.findUnique({
      where: { workspaceId_slug: { workspaceId: workspace.id, slug: nextSlug } },
      select: { id: true },
    })
  ) {
    nextSlug = `${baseSlug}-copy-${suffix}`;
    suffix += 1;
  }

  const created = await prisma.form.create({
    data: {
      workspaceId: workspace.id,
      title: `${source.title} (copy)`,
      slug: nextSlug,
      description: source.description,
      successMessage: source.successMessage,
      submitLabel: source.submitLabel,
      isOpen: false,
      multiStep: source.multiStep,
      notifyEmail: source.notifyEmail,
      webhookUrl: source.webhookUrl,
      redirectUrl: source.redirectUrl,
      opensAt: source.opensAt,
      closesAt: source.closesAt,
      maxSubmissions: source.maxSubmissions,
      closedMessage: source.closedMessage,
      fields: {
        create: source.fields.map((f) => ({
          label: f.label,
          name: f.name,
          type: f.type,
          required: f.required,
          placeholder: f.placeholder,
          helpText: f.helpText,
          options: (f.options ?? Prisma.DbNull) as Prisma.InputJsonValue,
          order: f.order,
          pageStep: f.pageStep,
          minLength: f.minLength,
          maxLength: f.maxLength,
          minValue: f.minValue,
          maxValue: f.maxValue,
          pattern: f.pattern,
          patternHint: f.patternHint,
          acceptMime: f.acceptMime,
          visibleIf: (f.visibleIf ?? Prisma.DbNull) as Prisma.InputJsonValue,
        })),
      },
    },
  });

  revalidatePath("/dashboard/forms");
  return { ok: true, data: { formId: created.id } };
}

export async function publishFormAction(
  formId: string
): Promise<ActionResult<{ version: number }>> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };

  const form = await prisma.form.findUnique({
    where: { id: formId },
    include: {
      fields: { orderBy: { order: "asc" } },
      versions: {
        orderBy: { version: "desc" },
        take: 1,
        select: { version: true },
      },
    },
  });
  if (!form || form.workspaceId !== workspace.id) {
    return { ok: false, error: "Form not found." };
  }
  if (form.fields.length === 0) {
    return { ok: false, error: "Add at least one field before publishing." };
  }

  const steps = Array.from(new Set(form.fields.map((field) => field.pageStep))).sort(
    (a, b) => a - b
  );
  if (
    form.multiStep &&
    steps.some((step, index) => step !== index)
  ) {
    return {
      ok: false,
      error: "Multi-step forms must use consecutive steps starting at step 1.",
    };
  }

  const nextVersion = (form.versions[0]?.version ?? 0) + 1;
  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.formVersion.create({
        data: {
          formId: form.id,
          version: nextVersion,
          title: form.title,
          slug: form.slug,
          description: form.description,
          successMessage: form.successMessage,
          submitLabel: form.submitLabel,
          multiStep: form.multiStep,
          notifyEmail: form.notifyEmail,
          webhookUrl: form.webhookUrl,
          redirectUrl: form.redirectUrl,
          opensAt: form.opensAt,
          closesAt: form.closesAt,
          maxSubmissions: form.maxSubmissions,
          closedMessage: form.closedMessage,
          fields: snapshotFormFields(form.fields),
          createdAt: now,
        },
      });
      await tx.form.update({
        where: { id: form.id },
        data: {
          status: "PUBLISHED",
          isOpen: true,
          publishedSlug: form.slug,
          publishedVersion: nextVersion,
          publishedAt: now,
        },
      });
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === "P2002"
    ) {
      return {
        ok: false,
        error: "The public URL is already used by another published form.",
      };
    }
    throw error;
  }

  revalidateFormPaths(formId);
  return { ok: true, data: { version: nextVersion } };
}

export async function closeFormAction(formId: string): Promise<ActionResult> {
  return setPublishedState(formId, "CLOSED");
}

export async function reopenFormAction(formId: string): Promise<ActionResult> {
  return setPublishedState(formId, "PUBLISHED");
}

export async function restoreFormVersionAction(
  formId: string,
  version: number
): Promise<ActionResult<{ version: number }>> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };
  const form = await prisma.form.findUnique({
    where: { id: formId },
    include: {
      versions: {
        where: { version },
        take: 1,
      },
    },
  });
  if (!form || form.workspaceId !== workspace.id) {
    return { ok: false, error: "Form not found." };
  }
  const source = form.versions[0];
  if (!source) return { ok: false, error: "Version not found." };
  const fields = parsePublishedFormFields(source.fields);
  if (fields.length === 0) {
    return { ok: false, error: "That version has no valid fields." };
  }

  const nextVersion = (form.publishedVersion ?? 0) + 1;
  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.formField.deleteMany({ where: { formId } });
      await tx.formField.createMany({
        data: fields.map((field, order) => ({
          formId,
          label: field.label,
          name: field.name,
          type: field.type,
          required: field.required,
          placeholder: field.placeholder,
          helpText: field.helpText,
          options: (field.options ?? Prisma.DbNull) as Prisma.InputJsonValue,
          order,
          pageStep: field.pageStep,
          minLength: field.minLength,
          maxLength: field.maxLength,
          minValue: field.minValue,
          maxValue: field.maxValue,
          pattern: field.pattern,
          patternHint: field.patternHint,
          acceptMime: field.acceptMime,
          visibleIf: (field.visibleIf ?? Prisma.DbNull) as Prisma.InputJsonValue,
        })),
      });
      await tx.formVersion.create({
        data: {
          formId,
          version: nextVersion,
          title: source.title,
          slug: source.slug,
          description: source.description,
          successMessage: source.successMessage,
          submitLabel: source.submitLabel,
          multiStep: source.multiStep,
          notifyEmail: source.notifyEmail,
          webhookUrl: source.webhookUrl,
          redirectUrl: source.redirectUrl,
          opensAt: source.opensAt,
          closesAt: source.closesAt,
          maxSubmissions: source.maxSubmissions,
          closedMessage: source.closedMessage,
          fields: source.fields as Prisma.InputJsonValue,
          createdAt: now,
        },
      });
      await tx.form.update({
        where: { id: formId },
        data: {
          title: source.title,
          slug: source.slug,
          description: source.description,
          successMessage: source.successMessage,
          submitLabel: source.submitLabel,
          multiStep: source.multiStep,
          notifyEmail: source.notifyEmail,
          webhookUrl: source.webhookUrl,
          redirectUrl: source.redirectUrl,
          opensAt: source.opensAt,
          closesAt: source.closesAt,
          maxSubmissions: source.maxSubmissions,
          closedMessage: source.closedMessage,
          status: "PUBLISHED",
          isOpen: true,
          publishedSlug: source.slug,
          publishedVersion: nextVersion,
          publishedAt: now,
        },
      });
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === "P2002"
    ) {
      return {
        ok: false,
        error: "The restored URL or a field name conflicts with current data.",
      };
    }
    throw error;
  }
  revalidateFormPaths(formId);
  return { ok: true, data: { version: nextVersion } };
}

async function setPublishedState(
  formId: string,
  status: "PUBLISHED" | "CLOSED"
): Promise<ActionResult> {
  const workspace = await requireEditableWorkspace();
  if (!workspace) return { ok: false, error: "Not allowed." };
  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: { workspaceId: true, publishedVersion: true },
  });
  if (!form || form.workspaceId !== workspace.id) {
    return { ok: false, error: "Form not found." };
  }
  if (status === "PUBLISHED" && !form.publishedVersion) {
    return { ok: false, error: "Publish the form before reopening it." };
  }
  await prisma.form.update({
    where: { id: formId },
    data: { status, isOpen: status === "PUBLISHED" },
  });
  revalidateFormPaths(formId);
  return { ok: true };
}

function revalidateFormPaths(formId: string) {
  revalidatePath("/dashboard/forms");
  revalidatePath(`/dashboard/forms/${formId}/edit`);
  revalidatePath(`/dashboard/forms/${formId}/submissions`);
}
