"use server";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormFieldType, FormSubmissionStatus } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseFieldOptions, parseVisibleIf, isFieldVisible } from "@/lib/forms";
import { rateLimitByIp } from "@/lib/rate-limit";
import { canInWorkspace } from "@/lib/permissions";
import { getCurrentWorkspace } from "@/lib/workspace";
import { dispatchSubmissionDeliveries, retrySubmissionDeliveries } from "@/lib/form-delivery";
import type { MetaCustomData, MetaStandardEventName } from "@/lib/meta-capi";
import { sendWorkspaceAdEvent, validHttpUrl } from "@/lib/ad-events";
import { splitName, validClickId, validFacebookCookie } from "@/lib/ad-match";
import {
  CONSENT_COOKIE,
  FBC_COOKIE,
  TTCLID_COOKIE,
  VISITOR_COOKIE,
  readConsent,
} from "@/lib/analytics-visitor";
import { publicSiteHref } from "@/lib/public-url";
import {
  detectFormUploadType,
  deleteFormSubmissionUploads,
  deleteManyFormSubmissionUploads,
  PRIVATE_FORM_UPLOAD_ROOT,
} from "@/lib/form-upload";
import { reportError } from "@/lib/error-reporting";
import {
  getFormAvailability,
  parsePublishedFormFields,
} from "@/lib/form-publication";

type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

type MetaActionEvent = {
  workspaceId: string;
  eventName: MetaStandardEventName;
  eventId: string;
  customData: MetaCustomData;
};

type StoredValue = string | string[] | boolean | StoredFile;
type StoredFile = {
  url: string;
  storageKey: string;
  name: string;
  size: number;
  mimeType: string;
};

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB
const DEFAULT_ACCEPT = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
];

type FieldValidationContext = {
  type: FormFieldType;
  required: boolean;
  options: string[];
  minLength?: number | null;
  maxLength?: number | null;
  minValue?: number | null;
  maxValue?: number | null;
  pattern?: string | null;
  patternHint?: string | null;
  acceptMime?: string | null;
};

function lengthError(
  value: string,
  min?: number | null,
  max?: number | null
): string | undefined {
  if (min != null && value.length < min) {
    return `Use at least ${min} characters.`;
  }
  if (max != null && value.length > max) {
    return `Use at most ${max} characters.`;
  }
  return undefined;
}

function rangeError(
  num: number,
  min?: number | null,
  max?: number | null
): string | undefined {
  if (min != null && num < min) return `Enter ${min} or more.`;
  if (max != null && num > max) return `Enter ${max} or less.`;
  return undefined;
}

function regexError(value: string, pattern?: string | null, hint?: string | null) {
  if (!pattern) return undefined;
  try {
    const re = new RegExp(pattern);
    if (!re.test(value)) return hint || "Doesn't match the required format.";
  } catch {
    // Bad pattern saved by author — don't block the visitor.
  }
  return undefined;
}

function validateValue(
  field: FieldValidationContext,
  raw: string | string[] | File | null
): { value: StoredValue | null; error?: string } {
  const { type, required, options } = field;
  if (type === "CHECKBOX") {
    const text = Array.isArray(raw) ? raw[0] : typeof raw === "string" ? raw : null;
    const v = text === "on" || text === "true";
    if (required && !v) return { value: null, error: "Please tick this box." };
    return { value: v };
  }

  if (type === "FILE") {
    if (!(raw instanceof File) || raw.size === 0) {
      if (required) return { value: null, error: "Please attach a file." };
      return { value: null };
    }
    if (raw.size > MAX_FILE_BYTES) {
      return { value: null, error: "File must be 8 MB or smaller." };
    }
    return {
      value: {
        url: "",
        storageKey: "",
        name: raw.name,
        size: raw.size,
        mimeType: raw.type,
      },
    };
  }

  if (type === "MULTISELECT" || type === "CHECKBOXES") {
    const values = (Array.isArray(raw) ? raw : raw && typeof raw === "string" ? [raw] : [])
      .map((value) => String(value).trim())
      .filter(Boolean);
    if (required && values.length === 0) {
      return { value: null, error: "Choose at least one option." };
    }
    if (values.some((value) => !options.includes(value))) {
      return { value: null, error: "Choose only offered options." };
    }
    return { value: values.length > 0 ? values : null };
  }

  const text = Array.isArray(raw)
    ? raw[0] ?? ""
    : typeof raw === "string"
      ? raw.trim()
      : "";

  if (!text) {
    if (required) return { value: null, error: "This field is required." };
    return { value: null };
  }

  switch (type) {
    case "EMAIL":
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
        return { value: null, error: "Enter a valid email." };
      }
      break;
    case "PHONE":
      if (!/^[+()0-9\s-]{4,30}$/.test(text)) {
        return { value: null, error: "Enter a valid phone number." };
      }
      break;
    case "URL":
      try {
        const url = new URL(text);
        if (!["http:", "https:"].includes(url.protocol)) {
          return { value: null, error: "Enter a valid URL." };
        }
      } catch {
        return { value: null, error: "Enter a valid URL." };
      }
      break;
    case "NUMBER": {
      const num = Number(text);
      if (!Number.isFinite(num)) {
        return { value: null, error: "Enter a valid number." };
      }
      const rangeMsg = rangeError(num, field.minValue, field.maxValue);
      if (rangeMsg) return { value: null, error: rangeMsg };
      break;
    }
    case "DATE": {
      const timestamp = Date.parse(text);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(timestamp)) {
        return { value: null, error: "Enter a valid date." };
      }
      break;
    }
    case "SELECT":
    case "RADIO":
      if (options.length > 0 && !options.includes(text)) {
        return { value: null, error: "Pick one of the offered options." };
      }
      break;
    case "TEXTAREA":
    case "TEXT": {
      const max = field.maxLength ?? (type === "TEXTAREA" ? 10_000 : 500);
      const lenMsg = lengthError(text, field.minLength, max);
      if (lenMsg) return { value: null, error: lenMsg };
      break;
    }
  }

  if (["TEXT", "TEXTAREA", "EMAIL", "PHONE", "URL"].includes(type)) {
    const reMsg = regexError(text, field.pattern, field.patternHint);
    if (reMsg) return { value: null, error: reMsg };
  }

  return { value: text };
}

function mimeMatches(pattern: string, actual: string): boolean {
  if (!pattern) return false;
  if (pattern === "*/*") return true;
  if (pattern.endsWith("/*")) {
    return actual.startsWith(pattern.slice(0, -1));
  }
  return pattern === actual;
}

async function storeFormUpload(
  submissionId: string,
  fieldName: string,
  file: File,
  acceptMime: string | null
): Promise<StoredFile | { error: string }> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const detected = detectFormUploadType(bytes);
  if (!detected) {
    return { error: "File content is not a supported image or PDF." };
  }
  const configured = (acceptMime ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const accepted = configured.length > 0 ? configured : DEFAULT_ACCEPT;
  if (!accepted.some((pattern) => mimeMatches(pattern, detected.mimeType))) {
    return { error: `Allowed types: ${accepted.join(", ")}.` };
  }

  const fileName = `${randomUUID()}.${detected.extension}`;
  const storageKey = `${submissionId}/${fileName}`;
  const absDir = path.join(PRIVATE_FORM_UPLOAD_ROOT, submissionId);
  try {
    await mkdir(absDir, { recursive: true });
    await writeFile(path.join(absDir, fileName), bytes);
  } catch (error) {
    reportError("form-upload write failed", error);
    return { error: "Could not store file." };
  }
  return {
    url: `/api/forms/submissions/${submissionId}/files/${encodeURIComponent(
      fieldName
    )}`,
    storageKey,
    name: file.name.slice(0, 255),
    size: bytes.length,
    mimeType: detected.mimeType,
  };
}

/**
 * Public form submission. Validates against the form's fields and stores
 * the result. Returns field-level errors so the public form can highlight
 * the offending inputs.
 */
export async function submitFormAction(
  formId: string,
  formData: FormData
): Promise<ActionResult<{ redirectUrl: string | null; metaEvent?: MetaActionEvent }>> {
  // Honeypot: real visitors never fill this hidden field.
  if (String(formData.get("_ml_company") || "").trim()) {
    return { ok: true, data: { redirectUrl: null } };
  }

  // Time-trap: submissions filed under 1.5s are almost always bots.
  const renderedAt = Number(formData.get("_ml_t") || 0);
  if (renderedAt > 0 && Date.now() - renderedAt < 1500) {
    return { ok: true, data: { redirectUrl: null } };
  }

  // Idempotency key minted by the browser for this fill. A reload of the POST
  // result, a mobile network retry, or a double submit all carry the same one.
  const requestId = readRequestId(formData.get("_ml_rid"));
  if (requestId) {
    const existing = await prisma.formSubmission.findUnique({
      where: { requestId },
      select: {
        id: true,
        form: { select: { id: true, redirectUrl: true } },
        formVersion: { select: { redirectUrl: true } },
      },
    });
    // Answer the repeat exactly as the original was answered. No new row, no
    // second set of deliveries, and no error shown to someone who did
    // nothing wrong.
    if (existing && existing.form.id === formId) {
      return {
        ok: true,
        data: {
          redirectUrl:
            existing.formVersion?.redirectUrl ?? existing.form.redirectUrl,
        },
      };
    }
  }

  const limit = await rateLimitByIp(`form-submit:${formId}`, 6, 60 * 1000);
  if (!limit.ok) {
    return {
      ok: false,
      error: `Too many submissions. Try again in ${limit.retryAfter}s.`,
    };
  }

  const form = await prisma.form.findUnique({
    where: { id: formId },
    include: {
      fields: { orderBy: { order: "asc" } },
      workspace: { select: { name: true, slug: true } },
      versions: { orderBy: { version: "desc" }, take: 1 },
      _count: { select: { submissions: true } },
    },
  });
  if (!form) return { ok: false, error: "Form not found." };
  const publishedVersion =
    form.publishedVersion && form.versions[0]?.version === form.publishedVersion
      ? form.versions[0]
      : null;
  const publicConfig = publishedVersion ?? form;
  const publishedFields = publishedVersion
    ? parsePublishedFormFields(publishedVersion.fields)
    : form.fields;
  const availability = getFormAvailability({
    status:
      form.status ?? (form.isOpen ? "PUBLISHED" : "CLOSED"),
    isOpen: form.isOpen,
    opensAt: publicConfig.opensAt ?? null,
    closesAt: publicConfig.closesAt ?? null,
    maxSubmissions: publicConfig.maxSubmissions ?? null,
    closedMessage:
      publicConfig.closedMessage ??
      "This form is closed and no longer accepting submissions.",
    submissionCount: form._count?.submissions ?? 0,
  });
  if (!availability.accepting) {
    return {
      ok: false,
      error: availability.message || "This form is no longer accepting submissions.",
    };
  }

  const rawValues: Record<string, unknown> = {};
  for (const field of publishedFields) {
    if (field.type === "MULTISELECT" || field.type === "CHECKBOXES") {
      rawValues[field.name] = formData.getAll(field.name).map(String);
    } else if (field.type === "FILE") {
      const f = formData.get(field.name);
      rawValues[field.name] = f instanceof File ? f : null;
    } else {
      rawValues[field.name] = formData.get(field.name);
    }
  }

  const payload: Record<string, StoredValue> = {};
  const fieldErrors: Record<string, string[]> = {};
  const filesToStore: Array<{
    name: string;
    file: File;
    field: string;
    acceptMime: string | null;
  }> = [];

  for (const field of publishedFields) {
    const visible = isFieldVisible(parseVisibleIf(field.visibleIf), rawValues);
    if (!visible) continue;

    const opts = parseFieldOptions(field.options);
    const raw = rawValues[field.name];
    const result = validateValue(
      {
        type: field.type,
        required: field.required,
        options: opts,
        minLength: field.minLength,
        maxLength: field.maxLength,
        minValue: field.minValue,
        maxValue: field.maxValue,
        pattern: field.pattern,
        patternHint: field.patternHint,
        acceptMime: field.acceptMime,
      },
      Array.isArray(raw)
        ? (raw as string[])
        : raw instanceof File
          ? raw
          : raw == null
            ? null
            : String(raw)
    );
    if (result.error) {
      fieldErrors[field.name] = [result.error];
      continue;
    }
    if (result.value != null) {
      if (field.type === "FILE" && raw instanceof File) {
        filesToStore.push({
          name: field.name,
          file: raw,
          field: field.name,
          acceptMime: field.acceptMime,
        });
      } else {
        payload[field.name] = result.value;
      }
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      error: "Please check the form for errors.",
      fieldErrors,
    };
  }

  const submissionId = randomUUID();

  // Persist uploads only after validation passes.
  for (const item of filesToStore) {
    const stored = await storeFormUpload(
      submissionId,
      item.name,
      item.file,
      item.acceptMime
    );
    if ("error" in stored) {
      await deleteFormSubmissionUploads(submissionId).catch((error) =>
        reportError("form-upload rollback failed", error)
      );
      return {
        ok: false,
        error: stored.error,
        fieldErrors: { [item.field]: [stored.error] },
      };
    }
    payload[item.field] = stored;
  }

  const h = headers();
  let submission;
  try {
    const data = {
      id: submissionId,
      formId: form.id,
      formVersionId: publishedVersion?.id ?? null,
      workspaceId: form.workspaceId,
      requestId,
      data: payload,
      referrer: h.get("referer")?.slice(0, 500) ?? null,
      ipAddress: (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || null,
      userAgent: h.get("user-agent")?.slice(0, 500) ?? null,
    };
    submission = publicConfig.maxSubmissions
      ? await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${form.id}, 0))`;
          const count = await tx.formSubmission.count({
            where: { formId: form.id },
          });
          if (count >= publicConfig.maxSubmissions!) {
            throw new FormResponseLimitError(publicConfig.closedMessage);
          }
          return tx.formSubmission.create({
            data,
            include: {
              form: { include: { fields: { orderBy: { order: "asc" } } } },
            },
          });
        })
      : await prisma.formSubmission.create({
          data,
          include: {
            form: { include: { fields: { orderBy: { order: "asc" } } } },
          },
        });
  } catch (error) {
    await deleteFormSubmissionUploads(submissionId).catch((cleanupError) =>
      reportError("form-upload rollback failed", cleanupError)
    );
    if (error instanceof FormResponseLimitError) {
      return { ok: false, error: error.message };
    }
    // Two copies of the same request raced past the check above; the unique
    // index settled it. The winner's deliveries are already on their way.
    if (isUniqueRequestIdViolation(error)) {
      return { ok: true, data: { redirectUrl: publicConfig.redirectUrl } };
    }
    throw error;
  }

  // Fire deliveries in the background. Failures are recorded on
  // FormDelivery rows; we never block the visitor on them.
  const deliverySubmission = {
    ...submission,
    form: {
      ...submission.form,
      title: publicConfig.title,
      slug: publicConfig.slug,
      notifyEmail: publicConfig.notifyEmail,
      webhookUrl: publicConfig.webhookUrl,
      fields: publishedFields,
    },
  };
  void dispatchSubmissionDeliveries(deliverySubmission, form.workspace.name).catch(
    (error) => reportError("form delivery dispatch failed", error)
  );

  const leadMetaEvent = {
    workspaceId: form.workspaceId,
    eventName: "Lead" as const,
    eventId: `lead:form:${submission.id}`,
    customData: {
      content_ids: [form.id],
      content_name: publicConfig.title,
      content_type: "form",
      status: "submitted",
    },
  };
  const jar = cookies();
  sendWorkspaceAdEvent(form.workspaceId, {
    eventName: leadMetaEvent.eventName,
    eventId: leadMetaEvent.eventId,
    sourceUrl:
      validHttpUrl(submission.referrer) ??
      publicSiteHref(form.workspace.slug, `forms/${publicConfig.slug}`),
    // The submission row already holds the IP and user agent the rate limiter
    // trusted, so the event reuses them rather than re-reading headers.
    clientIp: submission.ipAddress,
    userAgent: submission.userAgent,
    fbp: validFacebookCookie(jar.get("_fbp")?.value),
    fbc:
      validFacebookCookie(jar.get("_fbc")?.value) ??
      validFacebookCookie(jar.get(FBC_COOKIE)?.value),
    ttp: validClickId(jar.get("_ttp")?.value),
    ttclid: validClickId(jar.get(TTCLID_COOKIE)?.value),
    visitorId: jar.get(VISITOR_COOKIE)?.value ?? null,
    adConsent: readConsent(jar.get(CONSENT_COOKIE)?.value),
    customData: leadMetaEvent.customData,
    customerData: extractLeadCustomerData(publishedFields, payload),
  }).catch((error) => {
    console.warn("Ad event Lead failed", error);
  });

  return {
    ok: true,
    data: { redirectUrl: publicConfig.redirectUrl, metaEvent: leadMetaEvent },
  };
}

class FormResponseLimitError extends Error {
  constructor(message: string) {
    super(message || "This form has reached its response limit.");
    this.name = "FormResponseLimitError";
  }
}

/** Accepts only the shape the client mints, so the column stays predictable. */
function readRequestId(raw: FormDataEntryValue | null): string | null {
  const value = String(raw ?? "").trim();
  if (!value || value.length > 64) return null;
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : null;
}

function isUniqueRequestIdViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

function extractLeadCustomerData(
  fields: { name: string; label: string; type: FormFieldType }[],
  payload: Record<string, StoredValue>
) {
  const email =
    readFirstField(fields, payload, (field) => field.type === "EMAIL") ??
    readFirstField(fields, payload, (field) => keyFor(field).includes("email"));
  const phone =
    readFirstField(fields, payload, (field) => field.type === "PHONE") ??
    readFirstField(fields, payload, (field) =>
      /(phone|telp|telepon|whatsapp|wa\b)/i.test(keyFor(field))
    );
  const name = readFirstField(fields, payload, (field) =>
    /(name|nama|full name|contact)/i.test(keyFor(field))
  );

  return {
    email,
    phone,
    ...splitName(name),
  };
}

function readFirstField(
  fields: { name: string; label: string; type: FormFieldType }[],
  payload: Record<string, StoredValue>,
  predicate: (field: { name: string; label: string; type: FormFieldType }) => boolean
) {
  const field = fields.find(predicate);
  if (!field) return null;
  const value = payload[field.name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function keyFor(field: { name: string; label: string }) {
  return `${field.name} ${field.label}`.toLowerCase();
}

async function callerWorkspaceId() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) return null;
  return current.workspace.id;
}

export async function deleteFormSubmissionAction(
  submissionId: string
): Promise<ActionResult> {
  const workspaceId = await callerWorkspaceId();
  if (!workspaceId) return { ok: false, error: "Not allowed." };

  const submission = await prisma.formSubmission.findUnique({
    where: { id: submissionId },
    select: { formId: true, workspaceId: true },
  });
  if (!submission || submission.workspaceId !== workspaceId) {
    return { ok: false, error: "Submission not found." };
  }

  await prisma.formSubmission.delete({ where: { id: submissionId } });
  await deleteFormSubmissionUploads(submissionId).catch((error) =>
    reportError("form upload cleanup failed", error)
  );
  revalidatePath(`/dashboard/forms/${submission.formId}/submissions`);
  revalidatePath("/dashboard/forms");
  return { ok: true };
}

export async function updateSubmissionStatusAction(
  submissionId: string,
  status: FormSubmissionStatus
): Promise<ActionResult> {
  const workspaceId = await callerWorkspaceId();
  if (!workspaceId) return { ok: false, error: "Not allowed." };

  const submission = await prisma.formSubmission.findUnique({
    where: { id: submissionId },
    select: { formId: true, workspaceId: true },
  });
  if (!submission || submission.workspaceId !== workspaceId) {
    return { ok: false, error: "Submission not found." };
  }

  await prisma.formSubmission.update({
    where: { id: submissionId },
    data: { status },
  });
  revalidatePath(`/dashboard/forms/${submission.formId}/submissions`);
  return { ok: true };
}

export async function updateSubmissionNotesAction(
  submissionId: string,
  notes: string
): Promise<ActionResult> {
  const workspaceId = await callerWorkspaceId();
  if (!workspaceId) return { ok: false, error: "Not allowed." };

  const submission = await prisma.formSubmission.findUnique({
    where: { id: submissionId },
    select: { formId: true, workspaceId: true },
  });
  if (!submission || submission.workspaceId !== workspaceId) {
    return { ok: false, error: "Submission not found." };
  }

  await prisma.formSubmission.update({
    where: { id: submissionId },
    data: { notes: notes.slice(0, 5_000) || null },
  });
  revalidatePath(`/dashboard/forms/${submission.formId}/submissions`);
  return { ok: true };
}

export async function bulkUpdateSubmissionStatusAction(
  formId: string,
  submissionIds: string[],
  status: FormSubmissionStatus
): Promise<ActionResult<{ updated: number }>> {
  const workspaceId = await callerWorkspaceId();
  if (!workspaceId) return { ok: false, error: "Not allowed." };
  if (submissionIds.length === 0) return { ok: true, data: { updated: 0 } };

  const result = await prisma.formSubmission.updateMany({
    where: {
      id: { in: submissionIds },
      formId,
      workspaceId,
    },
    data: { status },
  });
  revalidatePath(`/dashboard/forms/${formId}/submissions`);
  return { ok: true, data: { updated: result.count } };
}

export async function bulkDeleteSubmissionsAction(
  formId: string,
  submissionIds: string[]
): Promise<ActionResult<{ deleted: number }>> {
  const workspaceId = await callerWorkspaceId();
  if (!workspaceId) return { ok: false, error: "Not allowed." };
  if (submissionIds.length === 0) return { ok: true, data: { deleted: 0 } };

  const removable = await prisma.formSubmission.findMany({
    where: {
      id: { in: submissionIds },
      formId,
      workspaceId,
    },
    select: { id: true },
  });
  const result = await prisma.formSubmission.deleteMany({
    where: {
      id: { in: submissionIds },
      formId,
      workspaceId,
    },
  });
  const cleanup = await deleteManyFormSubmissionUploads(
    removable.map((submission) => submission.id)
  );
  if (cleanup.failed > 0) {
    reportError(
      "form upload cleanup failed",
      new Error(`${cleanup.failed} submission directories could not be removed`)
    );
  }
  revalidatePath(`/dashboard/forms/${formId}/submissions`);
  revalidatePath("/dashboard/forms");
  return { ok: true, data: { deleted: result.count } };
}

export async function retrySubmissionDeliveryAction(
  submissionId: string
): Promise<ActionResult<{ retried: number }>> {
  const workspaceId = await callerWorkspaceId();
  if (!workspaceId) return { ok: false, error: "Not allowed." };
  const result = await retrySubmissionDeliveries(submissionId, workspaceId);
  return { ok: true, data: result };
}
