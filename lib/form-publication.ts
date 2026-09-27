import type { FormField, FormFieldType, Prisma } from "@prisma/client";

export type PublishedFormField = Pick<
  FormField,
  | "id"
  | "label"
  | "name"
  | "type"
  | "required"
  | "placeholder"
  | "helpText"
  | "order"
  | "pageStep"
  | "minLength"
  | "maxLength"
  | "minValue"
  | "maxValue"
  | "pattern"
  | "patternHint"
  | "acceptMime"
> & {
  options: Prisma.JsonValue | null;
  visibleIf: Prisma.JsonValue | null;
};

export type PublishedFormConfig = {
  id: string;
  version: number;
  title: string;
  slug: string;
  description: string | null;
  successMessage: string;
  submitLabel: string;
  multiStep: boolean;
  notifyEmail: string | null;
  webhookUrl: string | null;
  redirectUrl: string | null;
  opensAt: Date | null;
  closesAt: Date | null;
  maxSubmissions: number | null;
  closedMessage: string;
  fields: Prisma.JsonValue;
};

const FIELD_TYPES = new Set<FormFieldType>([
  "TEXT",
  "EMAIL",
  "PHONE",
  "NUMBER",
  "URL",
  "DATE",
  "TEXTAREA",
  "SELECT",
  "RADIO",
  "MULTISELECT",
  "CHECKBOX",
  "CHECKBOXES",
  "FILE",
  "CUSTOM",
  "REPEATER",
]);

export function snapshotFormFields(
  fields: PublishedFormField[]
): Prisma.InputJsonValue {
  return fields.map((field) => ({
    id: field.id,
    label: field.label,
    name: field.name,
    type: field.type,
    required: field.required,
    placeholder: field.placeholder,
    helpText: field.helpText,
    options: field.options ?? null,
    order: field.order,
    pageStep: field.pageStep,
    minLength: field.minLength,
    maxLength: field.maxLength,
    minValue: field.minValue,
    maxValue: field.maxValue,
    pattern: field.pattern,
    patternHint: field.patternHint,
    acceptMime: field.acceptMime,
    visibleIf: field.visibleIf ?? null,
  })) as Prisma.InputJsonValue;
}

export function parsePublishedFormFields(
  raw: Prisma.JsonValue | Prisma.InputJsonValue | null | undefined
): PublishedFormField[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value, index) => {
    if (!isRecord(value)) return [];
    const type = typeof value.type === "string" ? value.type : "";
    const name = typeof value.name === "string" ? value.name : "";
    const label = typeof value.label === "string" ? value.label : "";
    if (!FIELD_TYPES.has(type as FormFieldType) || !name || !label) return [];
    return [
      {
        id:
          typeof value.id === "string" && value.id
            ? value.id
            : `published-field-${index}`,
        label,
        name,
        type: type as FormFieldType,
        required: value.required === true,
        placeholder: nullableString(value.placeholder),
        helpText: nullableString(value.helpText),
        options: jsonValue(value.options),
        order: integer(value.order, index),
        pageStep: integer(value.pageStep, 0),
        minLength: nullableNumber(value.minLength),
        maxLength: nullableNumber(value.maxLength),
        minValue: nullableNumber(value.minValue),
        maxValue: nullableNumber(value.maxValue),
        pattern: nullableString(value.pattern),
        patternHint: nullableString(value.patternHint),
        acceptMime: nullableString(value.acceptMime),
        visibleIf: jsonValue(value.visibleIf),
      },
    ];
  });
}

export type FormAvailabilityReason =
  | "draft"
  | "closed"
  | "not_started"
  | "ended"
  | "full"
  | null;

export function getFormAvailability(
  input: {
    status: "DRAFT" | "PUBLISHED" | "CLOSED";
    isOpen: boolean;
    opensAt: Date | null;
    closesAt: Date | null;
    maxSubmissions: number | null;
    closedMessage: string;
    submissionCount: number;
  },
  now = new Date()
): { accepting: boolean; reason: FormAvailabilityReason; message: string | null } {
  const unavailable = (reason: Exclude<FormAvailabilityReason, null>, fallback: string) => ({
    accepting: false as const,
    reason,
    message: input.closedMessage.trim() || fallback,
  });

  if (input.status === "DRAFT") {
    return unavailable("draft", "This form has not been published yet.");
  }
  if (input.status === "CLOSED" || !input.isOpen) {
    return unavailable("closed", "This form is closed and no longer accepting submissions.");
  }
  if (input.opensAt && input.opensAt.getTime() > now.getTime()) {
    return unavailable("not_started", "This form is not open yet.");
  }
  if (input.closesAt && input.closesAt.getTime() <= now.getTime()) {
    return unavailable("ended", "This form is closed and no longer accepting submissions.");
  }
  if (
    input.maxSubmissions != null &&
    input.submissionCount >= input.maxSubmissions
  ) {
    return unavailable("full", "This form has reached its response limit.");
  }
  return { accepting: true, reason: null, message: null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function integer(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) ? value : fallback;
}

function jsonValue(value: unknown): Prisma.JsonValue | null {
  if (value == null) return null;
  return value as Prisma.JsonValue;
}
