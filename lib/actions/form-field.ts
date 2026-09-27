"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, type FormFieldType } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canInWorkspace } from "@/lib/permissions";
import { getCurrentWorkspace } from "@/lib/workspace";
import { optionsFromText } from "@/lib/forms";
import { formFieldSchema } from "@/lib/zod";

type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

async function callerWorkspaceId() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const current = await getCurrentWorkspace(session.user.id);
  if (!current || !canInWorkspace(current.role, "content.edit")) return null;
  return current.workspace.id;
}

function paths(formId: string) {
  return [`/dashboard/forms/${formId}/edit`];
}

function parseVisibleIf(raw: string | null) {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function parse(formData: FormData) {
  return formFieldSchema.safeParse({
    label: formData.get("label"),
    name: formData.get("name"),
    type: formData.get("type"),
    required: formData.get("required") === "true",
    placeholder: (formData.get("placeholder") as string | null) || undefined,
    helpText: (formData.get("helpText") as string | null) || undefined,
    options: (formData.get("options") as string | null) || undefined,
    pageStep: (formData.get("pageStep") as string | null) ?? "",
    minLength: (formData.get("minLength") as string | null) ?? "",
    maxLength: (formData.get("maxLength") as string | null) ?? "",
    minValue: (formData.get("minValue") as string | null) ?? "",
    maxValue: (formData.get("maxValue") as string | null) ?? "",
    pattern: (formData.get("pattern") as string | null) || undefined,
    patternHint: (formData.get("patternHint") as string | null) || undefined,
    acceptMime: (formData.get("acceptMime") as string | null) || undefined,
    visibleIf: parseVisibleIf(formData.get("visibleIf") as string | null),
  });
}

function flattenParseErrors(error: {
  flatten: () => { fieldErrors: Record<string, string[]> };
}) {
  const fieldErrors = error.flatten().fieldErrors as Record<string, string[]>;
  if (fieldErrors.visibleIf && !fieldErrors.visibleIfValue) {
    fieldErrors.visibleIfValue = fieldErrors.visibleIf;
  }
  return fieldErrors;
}

async function loadFieldForCaller(fieldId: string, workspaceId: string) {
  const field = await prisma.formField.findUnique({
    where: { id: fieldId },
    include: { form: { select: { id: true, workspaceId: true } } },
  });
  if (!field || field.form.workspaceId !== workspaceId) return null;
  return field;
}

function fieldDataFromParsed(
  parsed: ReturnType<typeof formFieldSchema.safeParse>
) {
  if (!parsed.success) throw new Error("invariant: call only on success");
  const v = parsed.data;
  return {
    label: v.label.trim(),
    name: v.name.trim(),
    type: v.type as FormFieldType,
    required: v.required,
    placeholder: v.placeholder?.trim() || null,
    helpText: v.helpText?.trim() || null,
    options: hasOptions(v.type) ? optionsFromText(v.options) : Prisma.DbNull,
    pageStep: v.pageStep ?? 0,
    minLength: v.minLength ?? null,
    maxLength: v.maxLength ?? null,
    minValue: v.minValue ?? null,
    maxValue: v.maxValue ?? null,
    pattern: v.pattern?.trim() || null,
    patternHint: v.patternHint?.trim() || null,
    acceptMime: v.acceptMime?.trim() || null,
    visibleIf: (v.visibleIf ?? Prisma.DbNull) as Prisma.InputJsonValue,
  };
}

async function validateVisibleIfTarget(
  formId: string,
  selfFieldId: string | null,
  data: {
    name: string;
    visibleIf?:
      | { field: string; op: string }
      | { logic: "all" | "any"; rules: Array<{ field: string; op: string }> }
      | null;
  }
): Promise<Record<string, string[]> | null> {
  const rules =
    data.visibleIf && "rules" in data.visibleIf
      ? data.visibleIf.rules
      : data.visibleIf
        ? [data.visibleIf]
        : [];
  if (rules.length === 0) return null;

  const fields = await prisma.formField.findMany({
    where: { formId },
    select: { id: true, name: true, type: true },
  });
  const byName = new Map(fields.map((field) => [field.name, field]));

  for (const rule of rules) {
    if (rule.field === data.name) {
      return { visibleIfField: ["Choose another field as the condition."] };
    }
    const target = byName.get(rule.field);
    if (!target || target.id === selfFieldId) {
      return { visibleIfField: ["Choose an existing field from this form."] };
    }
    if (
      ["checked", "unchecked"].includes(rule.op) &&
      target.type !== "CHECKBOX"
    ) {
      return {
        visibleIfOp: ["Checked conditions can only target a checkbox field."],
      };
    }
  }

  return null;
}

export async function createFormFieldAction(
  formId: string,
  formData: FormData
): Promise<ActionResult> {
  const workspaceId = await callerWorkspaceId();
  if (!workspaceId) return { ok: false, error: "Not allowed." };

  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: { workspaceId: true },
  });
  if (!form || form.workspaceId !== workspaceId)
    return { ok: false, error: "Form not found." };

  const parsed = parse(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the form for errors.",
      fieldErrors: flattenParseErrors(parsed.error),
    };
  }

  const nameClash = await prisma.formField.findFirst({
    where: { formId, name: parsed.data.name },
    select: { id: true },
  });
  if (nameClash) {
    return {
      ok: false,
      error: "Another field already uses that name.",
      fieldErrors: { name: ["Already used in this form."] },
    };
  }

  const visibilityErrors = await validateVisibleIfTarget(
    formId,
    null,
    parsed.data
  );
  if (visibilityErrors) {
    return {
      ok: false,
      error: "Please check the visibility condition.",
      fieldErrors: visibilityErrors,
    };
  }

  const last = await prisma.formField.findFirst({
    where: { formId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const data = fieldDataFromParsed(parsed);
  await prisma.formField.create({
    data: {
      formId,
      ...data,
      options: data.options as Prisma.InputJsonValue,
      order: (last?.order ?? -1) + 1,
    },
  });

  for (const p of paths(formId)) revalidatePath(p);
  return { ok: true };
}

export async function updateFormFieldAction(
  fieldId: string,
  formData: FormData
): Promise<ActionResult> {
  const workspaceId = await callerWorkspaceId();
  if (!workspaceId) return { ok: false, error: "Not allowed." };

  const field = await loadFieldForCaller(fieldId, workspaceId);
  if (!field) return { ok: false, error: "Field not found." };

  const parsed = parse(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the form for errors.",
      fieldErrors: flattenParseErrors(parsed.error),
    };
  }

  if (parsed.data.name !== field.name) {
    const clash = await prisma.formField.findFirst({
      where: {
        formId: field.formId,
        name: parsed.data.name,
        NOT: { id: fieldId },
      },
      select: { id: true },
    });
    if (clash) {
      return {
        ok: false,
        error: "Another field already uses that name.",
        fieldErrors: { name: ["Already used in this form."] },
      };
    }
  }

  const visibilityErrors = await validateVisibleIfTarget(
    field.formId,
    fieldId,
    parsed.data
  );
  if (visibilityErrors) {
    return {
      ok: false,
      error: "Please check the visibility condition.",
      fieldErrors: visibilityErrors,
    };
  }

  const data = fieldDataFromParsed(parsed);
  await prisma.formField.update({
    where: { id: fieldId },
    data: {
      ...data,
      options: data.options as Prisma.InputJsonValue,
    },
  });

  for (const p of paths(field.formId)) revalidatePath(p);
  return { ok: true };
}

function hasOptions(type: FormFieldType) {
  return ["SELECT", "RADIO", "MULTISELECT", "CHECKBOXES"].includes(type);
}

export async function moveFormFieldAction(
  fieldId: string,
  direction: "up" | "down"
): Promise<ActionResult> {
  const workspaceId = await callerWorkspaceId();
  if (!workspaceId) return { ok: false, error: "Not allowed." };

  const field = await loadFieldForCaller(fieldId, workspaceId);
  if (!field) return { ok: false, error: "Field not found." };

  const neighbour = await prisma.formField.findFirst({
    where: {
      formId: field.formId,
      order: direction === "up" ? { lt: field.order } : { gt: field.order },
    },
    orderBy: { order: direction === "up" ? "desc" : "asc" },
  });
  if (!neighbour) return { ok: true };

  await prisma.$transaction([
    prisma.formField.update({
      where: { id: field.id },
      data: { order: neighbour.order },
    }),
    prisma.formField.update({
      where: { id: neighbour.id },
      data: { order: field.order },
    }),
  ]);

  for (const p of paths(field.formId)) revalidatePath(p);
  return { ok: true };
}

/**
 * Replaces the entire order of fields in one transaction. The client
 * sends the new ordered list of field ids after a drag-and-drop.
 */
export async function reorderFormFieldsAction(
  formId: string,
  orderedFieldIds: string[]
): Promise<ActionResult> {
  const workspaceId = await callerWorkspaceId();
  if (!workspaceId) return { ok: false, error: "Not allowed." };

  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: { workspaceId: true, fields: { select: { id: true } } },
  });
  if (!form || form.workspaceId !== workspaceId) {
    return { ok: false, error: "Form not found." };
  }

  const existing = new Set(form.fields.map((f) => f.id));
  const incoming = new Set(orderedFieldIds);
  if (existing.size !== incoming.size) {
    return { ok: false, error: "Field list mismatch." };
  }
  for (const id of orderedFieldIds) {
    if (!existing.has(id)) {
      return { ok: false, error: "Unknown field in order list." };
    }
  }

  await prisma.$transaction(
    orderedFieldIds.map((id, index) =>
      prisma.formField.update({
        where: { id },
        data: { order: index },
      })
    )
  );

  for (const p of paths(formId)) revalidatePath(p);
  return { ok: true };
}

export async function duplicateFormFieldAction(
  fieldId: string
): Promise<ActionResult> {
  const workspaceId = await callerWorkspaceId();
  if (!workspaceId) return { ok: false, error: "Not allowed." };

  const field = await loadFieldForCaller(fieldId, workspaceId);
  if (!field) return { ok: false, error: "Field not found." };

  const last = await prisma.formField.findFirst({
    where: { formId: field.formId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const baseName = `${field.name}_copy`;
  let nextName = baseName;
  let suffix = 2;
  while (
    await prisma.formField.findFirst({
      where: { formId: field.formId, name: nextName },
      select: { id: true },
    })
  ) {
    nextName = `${baseName}_${suffix}`;
    suffix += 1;
  }

  await prisma.formField.create({
    data: {
      formId: field.formId,
      label: `${field.label} copy`,
      name: nextName,
      type: field.type,
      required: field.required,
      placeholder: field.placeholder,
      helpText: field.helpText,
      options: (field.options ?? Prisma.DbNull) as Prisma.InputJsonValue,
      order: (last?.order ?? -1) + 1,
      pageStep: field.pageStep,
      minLength: field.minLength,
      maxLength: field.maxLength,
      minValue: field.minValue,
      maxValue: field.maxValue,
      pattern: field.pattern,
      patternHint: field.patternHint,
      acceptMime: field.acceptMime,
      visibleIf: (field.visibleIf ?? Prisma.DbNull) as Prisma.InputJsonValue,
    },
  });

  for (const p of paths(field.formId)) revalidatePath(p);
  return { ok: true };
}

export async function deleteFormFieldAction(
  fieldId: string
): Promise<ActionResult> {
  const workspaceId = await callerWorkspaceId();
  if (!workspaceId) return { ok: false, error: "Not allowed." };

  const field = await loadFieldForCaller(fieldId, workspaceId);
  if (!field) return { ok: false, error: "Field not found." };

  await prisma.formField.delete({ where: { id: fieldId } });
  for (const p of paths(field.formId)) revalidatePath(p);
  return { ok: true };
}
