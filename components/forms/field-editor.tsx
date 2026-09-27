"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FormFieldType } from "@prisma/client";
import {
  ArrowDown,
  ArrowUp,
  CheckSquare,
  ChevronDown,
  Copy,
  CalendarDays,
  CircleDot,
  EyeOff,
  FileUp,
  Code2,
  Rows3,
  FormInput,
  GripVertical,
  Hash,
  LinkIcon,
  ListChecks,
  Mail,
  PenSquare,
  Phone,
  Plus,
  Text,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  deleteFormFieldAction,
  duplicateFormFieldAction,
  moveFormFieldAction,
  reorderFormFieldsAction,
} from "@/lib/actions/form-field";
import { cn } from "@/lib/utils";
import type { VisibleIfCondition, VisibleIfRule } from "@/lib/forms-shared";

import {
  FieldDialog,
  type FieldDialogValues,
  type OtherFieldOption,
} from "./field-dialog";

export type FieldRow = {
  id: string;
  label: string;
  name: string;
  type: FormFieldType;
  required: boolean;
  placeholder: string | null;
  helpText: string | null;
  options: string[];
  pageStep: number;
  minLength: number | null;
  maxLength: number | null;
  minValue: number | null;
  maxValue: number | null;
  pattern: string | null;
  patternHint: string | null;
  acceptMime: string | null;
  visibleIf: VisibleIfCondition | null;
};

const ICON: Record<FormFieldType, React.ComponentType<{ className?: string }>> = {
  TEXT: FormInput,
  EMAIL: Mail,
  PHONE: Phone,
  NUMBER: Hash,
  URL: LinkIcon,
  DATE: CalendarDays,
  TEXTAREA: Text,
  SELECT: ChevronDown,
  RADIO: CircleDot,
  MULTISELECT: ListChecks,
  CHECKBOX: CheckSquare,
  CHECKBOXES: CheckSquare,
  FILE: FileUp,
  // Carried by the production database from the earlier lineage; the editor
  // has no authoring UI for them, but it must still render existing fields.
  CUSTOM: Code2,
  REPEATER: Rows3,
};

const TYPE_LABEL: Record<FormFieldType, string> = {
  TEXT: "Text",
  EMAIL: "Email",
  PHONE: "Phone",
  NUMBER: "Number",
  URL: "URL",
  DATE: "Date",
  TEXTAREA: "Long text",
  SELECT: "Select",
  RADIO: "Radio",
  MULTISELECT: "Multi-select",
  CHECKBOX: "Checkbox",
  CHECKBOXES: "Checkbox group",
  FILE: "File upload",
  CUSTOM: "Custom (legacy)",
  REPEATER: "Repeater (legacy)",
};

function emptyValues(): FieldDialogValues {
  return {
    label: "",
    name: "",
    type: "TEXT",
    required: "false",
    placeholder: "",
    helpText: "",
    options: "",
    pageStep: "0",
    minLength: "",
    maxLength: "",
    minValue: "",
    maxValue: "",
    pattern: "",
    patternHint: "",
    acceptMime: "",
    visibleIfField: "",
    visibleIfOp: "always",
    visibleIfValue: "",
    visibleIfLogic: "all",
    visibleIfRules: [],
  };
}

function presetValues(
  kind:
    | "name"
    | "email"
    | "phone"
    | "message"
    | "website"
    | "date"
    | "budget"
    | "source"
    | "interests"
    | "consent"
    | "file"
): FieldDialogValues {
  const base = emptyValues();
  if (kind === "email") {
    return {
      ...base,
      label: "Email",
      name: "email",
      type: "EMAIL",
      required: "true",
      placeholder: "name@example.com",
    };
  }
  if (kind === "phone") {
    return {
      ...base,
      label: "Phone",
      name: "phone",
      type: "PHONE",
      placeholder: "+62 812 0000 0000",
    };
  }
  if (kind === "website") {
    return {
      ...base,
      label: "Website",
      name: "website",
      type: "URL",
      placeholder: "https://example.com",
    };
  }
  if (kind === "date") {
    return {
      ...base,
      label: "Preferred date",
      name: "preferred_date",
      type: "DATE",
    };
  }
  if (kind === "budget") {
    return {
      ...base,
      label: "Budget",
      name: "budget",
      type: "NUMBER",
      placeholder: "5000000",
    };
  }
  if (kind === "source") {
    return {
      ...base,
      label: "How did you hear about us?",
      name: "source",
      type: "RADIO",
      options: "Instagram\nGoogle\nFriend referral\nOther",
    };
  }
  if (kind === "interests") {
    return {
      ...base,
      label: "What are you interested in?",
      name: "interests",
      type: "CHECKBOXES",
      options: "Products\nCourses\nMembership\nConsultation",
    };
  }
  if (kind === "consent") {
    return {
      ...base,
      label: "Consent",
      name: "consent",
      type: "CHECKBOX",
      required: "true",
      placeholder: "I agree to be contacted about this submission.",
    };
  }
  if (kind === "message") {
    return {
      ...base,
      label: "Message",
      name: "message",
      type: "TEXTAREA",
      required: "true",
      placeholder: "Tell us what you need.",
    };
  }
  if (kind === "file") {
    return {
      ...base,
      label: "Attachment",
      name: "attachment",
      type: "FILE",
      acceptMime: "image/*,application/pdf",
    };
  }
  return {
    ...base,
    label: "Full name",
    name: "full_name",
    type: "TEXT",
    required: "true",
    placeholder: "Jane Doe",
  };
}

function rowToValues(row: FieldRow): FieldDialogValues {
  const v = row.visibleIf;
  const rules = visibleIfRules(v);
  const firstRule = rules[0];
  return {
    label: row.label,
    name: row.name,
    type: row.type,
    required: row.required ? "true" : "false",
    placeholder: row.placeholder ?? "",
    helpText: row.helpText ?? "",
    options: row.options.join("\n"),
    pageStep: String(row.pageStep ?? 0),
    minLength: row.minLength != null ? String(row.minLength) : "",
    maxLength: row.maxLength != null ? String(row.maxLength) : "",
    minValue: row.minValue != null ? String(row.minValue) : "",
    maxValue: row.maxValue != null ? String(row.maxValue) : "",
    pattern: row.pattern ?? "",
    patternHint: row.patternHint ?? "",
    acceptMime: row.acceptMime ?? "",
    visibleIfField: firstRule?.field ?? "",
    visibleIfOp: firstRule?.op ?? "always",
    visibleIfValue: Array.isArray(firstRule?.value)
      ? firstRule.value.join(",")
      : (firstRule?.value as string | undefined) ?? "",
    visibleIfLogic: v && "rules" in v ? v.logic : "all",
    visibleIfRules: rules.map((rule) => ({
      field: rule.field,
      op: rule.op,
      value: Array.isArray(rule.value)
        ? rule.value.join(",")
        : (rule.value as string | undefined) ?? "",
    })),
  };
}

type Props = { formId: string; fields: FieldRow[]; multiStep: boolean };

export function FieldEditor({ formId, fields, multiStep }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [order, setOrder] = useState(fields.map((f) => f.id));
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  useEffect(() => {
    setOrder(fields.map((f) => f.id));
  }, [fields]);

  const byId = new Map(fields.map((f) => [f.id, f]));
  const orderedFields = order
    .map((id) => byId.get(id))
    .filter((f): f is FieldRow => Boolean(f));

  const [dialog, setDialog] = useState<{
    open: boolean;
    mode: "create" | "edit";
    fieldId?: string;
    defaultValues: FieldDialogValues;
    otherFields?: OtherFieldOption[];
  }>({ open: false, mode: "create", defaultValues: emptyValues() });

  const [confirmDelete, setConfirmDelete] = useState<FieldRow | null>(null);

  function move(fieldId: string, direction: "up" | "down") {
    startTransition(async () => {
      const res = await moveFormFieldAction(fieldId, direction);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  function remove() {
    if (!confirmDelete) return;
    startTransition(async () => {
      const res = await deleteFormFieldAction(confirmDelete.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Field deleted");
      setConfirmDelete(null);
      router.refresh();
    });
  }

  function duplicate(fieldId: string) {
    startTransition(async () => {
      const res = await duplicateFormFieldAction(fieldId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Field duplicated");
      router.refresh();
    });
  }

  function persistOrder(next: string[]) {
    startTransition(async () => {
      const res = await reorderFormFieldsAction(formId, next);
      if (!res.ok) {
        toast.error(res.error);
        setOrder(fields.map((f) => f.id));
        return;
      }
      router.refresh();
    });
  }

  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setOverId(null);
      return;
    }
    const next = [...order];
    const from = next.indexOf(dragId);
    const to = next.indexOf(targetId);
    if (from === -1 || to === -1) return;
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    setOrder(next);
    setDragId(null);
    setOverId(null);
    persistOrder(next);
  }

  function openEdit(field: FieldRow) {
    setDialog({
      open: true,
      mode: "edit",
      fieldId: field.id,
      defaultValues: rowToValues(field),
      otherFields: buildOtherFields(orderedFields, field.id),
    });
  }

  function addPreset(kind: Parameters<typeof presetValues>[0]) {
    setDialog({
      open: true,
      mode: "create",
      defaultValues: presetValues(kind),
      otherFields: buildOtherFields(orderedFields, null),
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-kv-muted-fg">
          {fields.length === 0
            ? "Add your first field to start collecting submissions."
            : `${fields.length} field${fields.length === 1 ? "" : "s"}`}
        </p>
        <Button
          onClick={() =>
            setDialog({
              open: true,
              mode: "create",
              defaultValues: emptyValues(),
              otherFields: buildOtherFields(orderedFields, null),
            })
          }
        >
          <Plus /> Add field
        </Button>
      </div>

      {fields.length === 0 ? (
        <div className="rounded-xl border border-dashed border-kv-border px-6 py-10 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-kv-accent">
            <ListChecks className="h-5 w-5 text-kv-subtle" />
          </div>
          <p className="text-sm font-medium text-kv-fg">No fields yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-kv-muted-fg">
            Start from a common field, then adjust the label and validation.
          </p>
          <div className="mt-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <PresetButton label="Name" onClick={() => addPreset("name")} />
            <PresetButton label="Email" onClick={() => addPreset("email")} />
            <PresetButton label="Phone" onClick={() => addPreset("phone")} />
            <PresetButton
              label="Message"
              onClick={() => addPreset("message")}
            />
            <PresetButton label="Website" onClick={() => addPreset("website")} />
            <PresetButton label="Date" onClick={() => addPreset("date")} />
            <PresetButton label="Budget" onClick={() => addPreset("budget")} />
            <PresetButton label="Source" onClick={() => addPreset("source")} />
            <PresetButton
              label="Interests"
              onClick={() => addPreset("interests")}
            />
            <PresetButton label="Consent" onClick={() => addPreset("consent")} />
            <PresetButton label="File" onClick={() => addPreset("file")} />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 rounded-xl border border-kv-border bg-kv-secondary p-2">
            <PresetButton label="+ Name" onClick={() => addPreset("name")} />
            <PresetButton label="+ Email" onClick={() => addPreset("email")} />
            <PresetButton label="+ Phone" onClick={() => addPreset("phone")} />
            <PresetButton
              label="+ Message"
              onClick={() => addPreset("message")}
            />
            <PresetButton
              label="+ Website"
              onClick={() => addPreset("website")}
            />
            <PresetButton label="+ Date" onClick={() => addPreset("date")} />
            <PresetButton label="+ Budget" onClick={() => addPreset("budget")} />
            <PresetButton label="+ Source" onClick={() => addPreset("source")} />
            <PresetButton
              label="+ Interests"
              onClick={() => addPreset("interests")}
            />
            <PresetButton label="+ Consent" onClick={() => addPreset("consent")} />
            <PresetButton label="+ File" onClick={() => addPreset("file")} />
          </div>
          <ol className="divide-y divide-kv-border overflow-hidden rounded-xl border border-kv-border">
            {orderedFields.map((field, idx) => {
              const Icon = ICON[field.type];
              const isDragging = dragId === field.id;
              const isOver = overId === field.id && dragId !== field.id;
              return (
                <li
                  key={field.id}
                  draggable
                  onDragStart={(e) => {
                    setDragId(field.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (overId !== field.id) setOverId(field.id);
                  }}
                  onDragLeave={() => {
                    if (overId === field.id) setOverId(null);
                  }}
                  onDrop={() => onDrop(field.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverId(null);
                  }}
                  className={cn(
                    "flex items-center gap-3 bg-white px-3 py-2.5 transition",
                    isDragging && "opacity-40",
                    isOver && "bg-kv-secondary ring-2 ring-inset ring-zinc-300"
                  )}
                >
                  <GripVertical
                    className="h-4 w-4 shrink-0 cursor-grab text-zinc-300"
                    aria-hidden
                  />
                  <Icon className="h-4 w-4 shrink-0 text-kv-subtle" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-kv-fg">
                      {field.label}
                      {field.required ? (
                        <span className="ml-1 text-red-500">*</span>
                      ) : null}
                      {field.visibleIf ? (
                        <span
                          className="ml-2 inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-700"
                          title={visibilitySummary(field.visibleIf)}
                        >
                          <EyeOff className="h-3 w-3" /> conditional
                        </span>
                      ) : null}
                      {multiStep ? (
                        <span className="ml-2 rounded-md bg-kv-accent px-1.5 py-0.5 text-[10px] font-medium uppercase text-kv-muted-fg">
                          Page {field.pageStep + 1}
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-kv-muted-fg">
                      <span className="font-mono">{field.name}</span> ·{" "}
                      {TYPE_LABEL[field.type]}
                      {["SELECT", "RADIO", "MULTISELECT", "CHECKBOXES"].includes(field.type) && field.options.length > 0
                        ? ` · ${field.options.length} options`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <IconBtn
                      aria="Move up"
                      disabled={pending || idx === 0}
                      onClick={() => move(field.id, "up")}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn
                      aria="Move down"
                      disabled={pending || idx === orderedFields.length - 1}
                      onClick={() => move(field.id, "down")}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn
                      aria="Edit field"
                      onClick={() => openEdit(field)}
                    >
                      <PenSquare className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn
                      aria="Duplicate field"
                      disabled={pending}
                      onClick={() => duplicate(field.id)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn
                      aria="Delete field"
                      danger
                      onClick={() => setConfirmDelete(field)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconBtn>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="text-[11px] text-kv-subtle">
            Drag the handle to reorder fields, or use the arrows on each row.
          </p>
        </div>
      )}

      <FieldDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        mode={dialog.mode}
        formId={formId}
        fieldId={dialog.fieldId}
        defaultValues={dialog.defaultValues}
        multiStep={multiStep}
        otherFields={dialog.otherFields}
      />

      <AlertDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete field &ldquo;{confirmDelete?.label}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The field will be removed. Past submissions still keep their data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                remove();
              }}
              disabled={pending}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {pending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function buildOtherFields(
  fields: FieldRow[],
  excludeId: string | null
): OtherFieldOption[] {
  return fields
    .filter((f) => f.id !== excludeId)
    .map((f) => ({
      id: f.id,
      name: f.name,
      label: f.label,
      type: f.type,
      options: f.options,
    }));
}

function visibleIfRules(condition: VisibleIfCondition | null): VisibleIfRule[] {
  if (!condition) return [];
  return "rules" in condition ? condition.rules : [condition];
}

function visibilitySummary(condition: VisibleIfCondition) {
  if ("rules" in condition) {
    return `Visible when ${condition.logic === "any" ? "any" : "all"} of ${condition.rules.length} conditions match`;
  }
  return `Visible when ${condition.field} ${condition.op}`;
}

function PresetButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-kv-border bg-white px-3 py-2 text-xs font-medium text-kv-cell transition hover:border-zinc-300 hover:bg-kv-hover hover:text-kv-fg"
    >
      {label}
    </button>
  );
}

function IconBtn({
  children,
  onClick,
  disabled,
  aria,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  aria: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={aria}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md text-kv-muted-fg transition-colors hover:bg-kv-hover hover:text-kv-fg disabled:cursor-not-allowed disabled:opacity-30",
        danger && "hover:bg-red-50 hover:text-red-600"
      )}
    >
      {children}
    </button>
  );
}
