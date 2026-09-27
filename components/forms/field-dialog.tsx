"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import {
  CalendarDays,
  CheckSquare,
  ChevronDown,
  CircleDot,
  FileText,
  FileUp,
  Hash,
  LinkIcon,
  ListChecks,
  Loader2,
  Mail,
  Phone,
  Plus,
  Trash2,
  Type,
} from "lucide-react";
import type { FormFieldType } from "@prisma/client";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createFormFieldAction,
  updateFormFieldAction,
} from "@/lib/actions/form-field";
import { slugify } from "@/lib/slug";
import { cn } from "@/lib/utils";

type VisibilityOp =
  | "eq"
  | "neq"
  | "in"
  | "nin"
  | "contains"
  | "not_contains"
  | "filled"
  | "empty"
  | "checked"
  | "unchecked";

type VisibilityRuleValue = {
  field: string;
  op: VisibilityOp;
  value: string;
};

export type FieldDialogValues = {
  label: string;
  name: string;
  type: FormFieldType;
  required: "true" | "false";
  placeholder: string;
  helpText: string;
  options: string;
  pageStep: string;
  minLength: string;
  maxLength: string;
  minValue: string;
  maxValue: string;
  pattern: string;
  patternHint: string;
  acceptMime: string;
  visibleIfField: string;
  visibleIfOp: "always" | VisibilityOp;
  visibleIfValue: string;
  visibleIfLogic: "all" | "any";
  visibleIfRules: VisibilityRuleValue[];
};

export type OtherFieldOption = {
  id: string;
  name: string;
  label: string;
  type: FormFieldType;
  options: string[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  formId?: string;
  fieldId?: string;
  defaultValues: FieldDialogValues;
  multiStep?: boolean;
  otherFields?: OtherFieldOption[];
};

const OPTION_FIELD_TYPES: FormFieldType[] = [
  "SELECT",
  "RADIO",
  "MULTISELECT",
  "CHECKBOXES",
];

const FIELD_TYPES: {
  value: FormFieldType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "TEXT", label: "Text", description: "Short answer, name, company.", icon: Type },
  { value: "EMAIL", label: "Email", description: "Validates email addresses.", icon: Mail },
  { value: "PHONE", label: "Phone", description: "Phone or WhatsApp number.", icon: Phone },
  { value: "NUMBER", label: "Number", description: "Budget, quantity, score.", icon: Hash },
  { value: "URL", label: "URL", description: "Website or portfolio link.", icon: LinkIcon },
  { value: "DATE", label: "Date", description: "Booking or preferred date.", icon: CalendarDays },
  { value: "TEXTAREA", label: "Long text", description: "Message or detailed answer.", icon: FileText },
  { value: "SELECT", label: "Select", description: "One answer from dropdown.", icon: ChevronDown },
  { value: "RADIO", label: "Radio", description: "One visible option choice.", icon: CircleDot },
  { value: "MULTISELECT", label: "Multi-select", description: "Multiple answers in a list.", icon: ListChecks },
  { value: "CHECKBOX", label: "Checkbox", description: "Consent or single agreement.", icon: CheckSquare },
  { value: "CHECKBOXES", label: "Checkbox group", description: "Multiple visible choices.", icon: CheckSquare },
  { value: "FILE", label: "File upload", description: "Image, PDF, or document.", icon: FileUp },
];

const OPTION_PRESETS = [
  { label: "Yes / No", value: "Yes\nNo" },
  { label: "Source", value: "Instagram\nGoogle\nFriend referral\nOther" },
  { label: "Interest", value: "Products\nCourses\nMembership\nConsultation" },
  { label: "Budget", value: "< Rp 5 juta\nRp 5-15 juta\nRp 15-50 juta\n> Rp 50 juta" },
];

const ACCEPT_PRESETS = [
  { label: "Images", value: "image/png,image/jpeg,image/webp,image/gif" },
  { label: "PDF", value: "application/pdf" },
  { label: "Images + PDF", value: "image/*,application/pdf" },
  { label: "Any", value: "*/*" },
];

const VISIBILITY_VALUE_OPS = [
  "eq",
  "neq",
  "in",
  "nin",
  "contains",
  "not_contains",
];

export function FieldDialog({
  open,
  onOpenChange,
  mode,
  formId,
  fieldId,
  defaultValues,
  multiStep,
  otherFields,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [nameTouched, setNameTouched] = useState(mode === "edit");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FieldDialogValues>({ defaultValues });

  const typeValue = watch("type");
  const labelValue = watch("label");
  const nameValue = watch("name");
  const placeholderValue = watch("placeholder");
  const requiredValue = watch("required");
  const optionsValue = watch("options");
  const visibleIfRules = watch("visibleIfRules") ?? [];
  const visibleIfLogic = watch("visibleIfLogic") ?? "all";
  const hasOptions = OPTION_FIELD_TYPES.includes(typeValue);

  useEffect(() => {
    if (open) {
      reset(defaultValues);
      setServerError(null);
      setNameTouched(mode === "edit");
      setAdvancedOpen(
        Boolean(
          defaultValues.minLength ||
            defaultValues.maxLength ||
            defaultValues.minValue ||
            defaultValues.maxValue ||
            defaultValues.pattern ||
            defaultValues.acceptMime ||
            defaultValues.helpText ||
            defaultValues.visibleIfField ||
            defaultValues.visibleIfRules.length > 0
        )
      );
    }
  }, [open, defaultValues, mode, reset]);

  useEffect(() => {
    if (!open || nameTouched || mode === "edit") return;
    setValue("name", toFieldName(labelValue ?? ""), { shouldDirty: true });
  }, [labelValue, mode, nameTouched, open, setValue]);

  function handleTypeChange(nextType: FormFieldType) {
    setValue("type", nextType, { shouldDirty: true });

    if (OPTION_FIELD_TYPES.includes(nextType) && !optionsValue.trim()) {
      setValue("options", defaultOptions(nextType), { shouldDirty: true });
    }

    if (nextType === "CHECKBOX" && !placeholderValue.trim()) {
      setValue("placeholder", "I agree to the terms.", { shouldDirty: true });
    }
  }

  function onSubmit(values: FieldDialogValues) {
    setServerError(null);
    const fd = new FormData();
    fd.set("label", values.label);
    fd.set("name", values.name);
    fd.set("type", values.type);
    fd.set("required", values.required);
    fd.set("placeholder", values.placeholder);
    fd.set("helpText", values.helpText);
    fd.set("options", values.options);
    fd.set("pageStep", values.pageStep || "0");
    fd.set("minLength", values.minLength);
    fd.set("maxLength", values.maxLength);
    fd.set("minValue", values.minValue);
    fd.set("maxValue", values.maxValue);
    fd.set("pattern", values.pattern);
    fd.set("patternHint", values.patternHint);
    fd.set("acceptMime", values.acceptMime);

    const normalizedRules = values.visibleIfRules
      .map((rule) => ({
        field: rule.field.trim(),
        op: rule.op,
        value: rule.value.trim(),
      }))
      .filter((rule) => rule.field);

    for (let index = 0; index < normalizedRules.length; index += 1) {
      const rule = normalizedRules[index];
      if (VISIBILITY_VALUE_OPS.includes(rule.op) && !rule.value) {
        setError("visibleIfValue", {
          message: `Add a value for condition ${index + 1}.`,
        });
        return;
      }
    }

    if (normalizedRules.length === 0) {
      fd.set("visibleIf", "");
    } else {
      const rules = normalizedRules.map((rule) => visibilityRulePayload(rule));
      const visibleIf =
        rules.length === 1
          ? rules[0]
          : { logic: values.visibleIfLogic || "all", rules };
      fd.set("visibleIf", JSON.stringify(visibleIf));
    }

    startTransition(async () => {
      const res =
        mode === "create"
          ? await createFormFieldAction(formId!, fd)
          : await updateFormFieldAction(fieldId!, fd);
      if (!res.ok) {
        setServerError(res.error);
        if (res.fieldErrors) {
          for (const [field, msgs] of Object.entries(res.fieldErrors)) {
            if (msgs?.[0]) {
              setError(field as keyof FieldDialogValues, {
                message: msgs[0],
              });
            }
          }
        }
        return;
      }
      toast.success(mode === "create" ? "Field added" : "Field saved");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Add field" : "Edit field"}
          </DialogTitle>
          <DialogDescription>
            Fields appear on the public form in the order shown.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="field-label">Label</Label>
                  <Input
                    id="field-label"
                    autoFocus
                    placeholder="e.g. Email address"
                    {...register("label", { required: "Label is required" })}
                  />
                  {errors.label && (
                    <p className="text-xs text-red-600">{errors.label.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="field-name">Field name</Label>
                  <Input
                    id="field-name"
                    placeholder="email_address"
                    {...register("name", {
                      required: "Name is required",
                      onChange: () => setNameTouched(true),
                    })}
                  />
                  {errors.name && (
                    <p className="text-xs text-red-600">{errors.name.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Field type</Label>
                <TypePicker value={typeValue} onChange={handleTypeChange} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="field-help">Help text</Label>
                <Input
                  id="field-help"
                  placeholder="Shown below the field label."
                  {...register("helpText")}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="field-required">Required</Label>
                  <Controller
                    control={control}
                    name="required"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="field-required">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="false">Optional</SelectItem>
                          <SelectItem value="true">Required</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                {typeValue !== "CHECKBOX" && !hasOptions && typeValue !== "FILE" ? (
                  <div className="space-y-2">
                    <Label htmlFor="field-placeholder">Placeholder</Label>
                    <Input
                      id="field-placeholder"
                      placeholder={placeholderHint(typeValue)}
                      {...register("placeholder")}
                    />
                  </div>
                ) : null}
              </div>

              {multiStep ? (
                <div className="space-y-2">
                  <Label htmlFor="field-page">Page (step)</Label>
                  <Input
                    id="field-page"
                    type="number"
                    min={0}
                    {...register("pageStep")}
                  />
                  <p className="text-[11px] text-zinc-400">
                    0 = first page. Increase to push this field to the next
                    step.
                  </p>
                </div>
              ) : null}

              {hasOptions ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label htmlFor="field-options">Options</Label>
                    <div className="flex flex-wrap gap-1">
                      {OPTION_PRESETS.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() =>
                            setValue("options", preset.value, {
                              shouldDirty: true,
                            })
                          }
                          className="rounded-md border border-zinc-200 px-2 py-1 text-[11px] font-medium text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-900"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Textarea
                    id="field-options"
                    rows={5}
                    placeholder="One option per line"
                    {...register("options")}
                  />
                  <p className="text-[11px] text-zinc-400">
                    One option per line. Used by select, radio, multi-select,
                    and checkbox groups.
                  </p>
                  {errors.options && (
                    <p className="text-xs text-red-600">
                      {errors.options.message}
                    </p>
                  )}
                </div>
              ) : null}

              {typeValue === "FILE" ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label htmlFor="field-accept">Allowed file types</Label>
                    <div className="flex flex-wrap gap-1">
                      {ACCEPT_PRESETS.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() =>
                            setValue("acceptMime", preset.value, {
                              shouldDirty: true,
                            })
                          }
                          className="rounded-md border border-zinc-200 px-2 py-1 text-[11px] font-medium text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-900"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Input
                    id="field-accept"
                    placeholder="image/*,application/pdf"
                    {...register("acceptMime")}
                  />
                  <p className="text-[11px] text-zinc-400">
                    Comma-separated MIME types. Max upload size: 8 MB.
                  </p>
                </div>
              ) : null}

              <details
                open={advancedOpen}
                onToggle={(e) =>
                  setAdvancedOpen((e.currentTarget as HTMLDetailsElement).open)
                }
                className="rounded-xl border border-zinc-200 bg-white"
              >
                <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-zinc-700">
                  Advanced validation & visibility
                </summary>
                <div className="space-y-4 border-t border-zinc-100 px-4 py-4">
                  {["TEXT", "TEXTAREA", "EMAIL", "PHONE", "URL"].includes(
                    typeValue
                  ) ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="field-min-len">Min length</Label>
                        <Input
                          id="field-min-len"
                          type="number"
                          min={0}
                          {...register("minLength")}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="field-max-len">Max length</Label>
                        <Input
                          id="field-max-len"
                          type="number"
                          min={1}
                          {...register("maxLength")}
                        />
                        {errors.maxLength && (
                          <p className="text-xs text-red-600">
                            {errors.maxLength.message}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {typeValue === "NUMBER" ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="field-min-val">Min value</Label>
                        <Input
                          id="field-min-val"
                          type="number"
                          {...register("minValue")}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="field-max-val">Max value</Label>
                        <Input
                          id="field-max-val"
                          type="number"
                          {...register("maxValue")}
                        />
                        {errors.maxValue && (
                          <p className="text-xs text-red-600">
                            {errors.maxValue.message}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {["TEXT", "TEXTAREA", "EMAIL", "PHONE", "URL"].includes(
                    typeValue
                  ) ? (
                    <div className="space-y-2">
                      <Label htmlFor="field-pattern">
                        Regex pattern (optional)
                      </Label>
                      <Input
                        id="field-pattern"
                        placeholder="^[A-Z]{2,3}-\d{4}$"
                        {...register("pattern")}
                      />
                      {errors.pattern && (
                        <p className="text-xs text-red-600">
                          {errors.pattern.message}
                        </p>
                      )}
                      <Input
                        placeholder="Hint shown on invalid input"
                        {...register("patternHint")}
                      />
                    </div>
                  ) : null}

                  {otherFields && otherFields.length > 0 ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label>Show only when…</Label>
                        <div className="flex items-center gap-2">
                          {visibleIfRules.length > 1 ? (
                            <Controller
                              control={control}
                              name="visibleIfLogic"
                              render={({ field }) => (
                                <select
                                  {...field}
                                  className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-xs"
                                >
                                  <option value="all">All match</option>
                                  <option value="any">Any match</option>
                                </select>
                              )}
                            />
                          ) : null}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setValue(
                                "visibleIfRules",
                                [
                                  ...visibleIfRules,
                                  defaultVisibilityRule(otherFields),
                                ],
                                { shouldDirty: true }
                              )
                            }
                            disabled={visibleIfRules.length >= 8}
                          >
                            <Plus className="h-3.5 w-3.5" /> Add condition
                          </Button>
                        </div>
                      </div>
                      {visibleIfRules.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-3 py-4 text-xs text-zinc-500">
                          This field is always visible.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {visibleIfRules.map((rule, index) => {
                            const conditionTarget =
                              otherFields.find((f) => f.name === rule.field) ??
                              null;
                            return (
                              <div
                                key={index}
                                className="grid gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-2 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1fr)_32px]"
                              >
                                <select
                                  {...register(`visibleIfRules.${index}.field`)}
                                  className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                                >
                                  <option value="">Choose field</option>
                                  {otherFields.map((other) => (
                                    <option key={other.id} value={other.name}>
                                      {other.label} ({other.name})
                                    </option>
                                  ))}
                                </select>
                                <select
                                  {...register(`visibleIfRules.${index}.op`)}
                                  className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                                >
                                  <option value="eq">equals</option>
                                  <option value="neq">does not equal</option>
                                  <option value="in">is one of</option>
                                  <option value="nin">is not one of</option>
                                  <option value="contains">contains</option>
                                  <option value="not_contains">
                                    does not contain
                                  </option>
                                  <option value="filled">is filled</option>
                                  <option value="empty">is empty</option>
                                  <option value="checked">is checked</option>
                                  <option value="unchecked">is unchecked</option>
                                </select>
                                {VISIBILITY_VALUE_OPS.includes(rule.op) ? (
                                  conditionTarget &&
                                  conditionTarget.options.length > 0 &&
                                  ["eq", "neq"].includes(rule.op) ? (
                                    <select
                                      {...register(
                                        `visibleIfRules.${index}.value`
                                      )}
                                      className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                                    >
                                      <option value="">Choose value</option>
                                      {conditionTarget.options.map((opt) => (
                                        <option key={opt} value={opt}>
                                          {opt}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <Input
                                      placeholder={conditionValuePlaceholder(
                                        rule.op
                                      )}
                                      {...register(
                                        `visibleIfRules.${index}.value`
                                      )}
                                    />
                                  )
                                ) : (
                                  <div className="hidden md:block" />
                                )}
                                <button
                                  type="button"
                                  aria-label="Remove condition"
                                  onClick={() =>
                                    setValue(
                                      "visibleIfRules",
                                      visibleIfRules.filter(
                                        (_, i) => i !== index
                                      ),
                                      { shouldDirty: true }
                                    )
                                  }
                                  className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white hover:text-red-600"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {(errors.visibleIfField ||
                        errors.visibleIfOp ||
                        errors.visibleIfValue) && (
                        <p className="text-xs text-red-600">
                          {errors.visibleIfField?.message ||
                            errors.visibleIfOp?.message ||
                            errors.visibleIfValue?.message}
                        </p>
                      )}
                      <p className="text-[11px] text-zinc-400">
                        {visibleIfRules.length > 1
                          ? `${visibleIfLogic === "any" ? "Any" : "All"} conditions must match. `
                          : ""}
                        Use checked/unchecked only with checkbox fields. Hidden
                        fields are not validated or stored.
                      </p>
                    </div>
                  ) : null}
                </div>
              </details>
            </div>

            <aside className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div>
                <p className="text-xs font-semibold uppercase text-zinc-400">
                  Preview
                </p>
                <FieldMiniPreview
                  label={labelValue || "Field label"}
                  name={nameValue || "field_name"}
                  type={typeValue}
                  required={requiredValue === "true"}
                  placeholder={placeholderValue}
                  options={optionsValue}
                />
              </div>
              <div className="rounded-lg border border-zinc-200 bg-white p-3">
                <p className="text-[11px] font-medium uppercase text-zinc-400">
                  Export key
                </p>
                <p className="mt-1 font-mono text-xs text-zinc-700">
                  {nameValue || "field_name"}
                </p>
              </div>
              <p className="text-xs leading-5 text-zinc-500">
                This is how the field appears publicly and how its value is
                stored in submissions.
              </p>
            </aside>
          </div>

          {serverError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {serverError}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {mode === "create" ? "Add field" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function toFieldName(value: string) {
  return slugify(value).replace(/-/g, "_").replace(/^[^a-z_]+/, "");
}

function defaultVisibilityRule(
  fields: OtherFieldOption[] | undefined
): VisibilityRuleValue {
  return { field: fields?.[0]?.name ?? "", op: "eq", value: "" };
}

function visibilityRulePayload(rule: VisibilityRuleValue) {
  const payload: Record<string, unknown> = {
    field: rule.field,
    op: rule.op,
  };
  if (["eq", "neq", "contains", "not_contains"].includes(rule.op)) {
    payload.value = rule.value;
  }
  if (["in", "nin"].includes(rule.op)) {
    payload.value = rule.value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return payload;
}

function conditionValuePlaceholder(op: VisibilityOp) {
  if (op === "in" || op === "nin") return "comma,separated,values";
  if (op === "contains" || op === "not_contains") return "text to match";
  return "value";
}

function TypePicker({
  value,
  onChange,
}: {
  value: FormFieldType;
  onChange: (value: FormFieldType) => void;
}) {
  return (
    <div className="grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
      {FIELD_TYPES.map((item) => {
        const Icon = item.icon;
        const active = value === item.value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={cn(
              "flex items-start gap-2 rounded-xl border p-3 text-left transition",
              active
                ? "border-zinc-900 bg-zinc-950 text-white shadow-sm"
                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0",
                active ? "text-white" : "text-zinc-400"
              )}
            />
            <span>
              <span className="block text-xs font-semibold">{item.label}</span>
              <span
                className={cn(
                  "mt-0.5 block text-[11px] leading-4",
                  active ? "text-zinc-300" : "text-zinc-500"
                )}
              >
                {item.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function FieldMiniPreview({
  label,
  type,
  required,
  placeholder,
  options,
}: {
  label: string;
  name: string;
  type: FormFieldType;
  required: boolean;
  placeholder: string;
  options: string;
}) {
  const opts = options
    .split(/\r?\n/)
    .map((option) => option.trim())
    .filter(Boolean);

  return (
    <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-4">
      <label className="text-xs font-medium text-zinc-700">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </label>
      <div className="mt-2">
        {type === "TEXTAREA" ? (
          <div className="h-24 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-400">
            {placeholder || "Long answer"}
          </div>
        ) : OPTION_FIELD_TYPES.includes(type) ? (
          <div className="space-y-2">
            {(opts.length ? opts : ["Option A", "Option B"]).slice(0, 4).map((opt) => (
              <div key={opt} className="flex items-center gap-2 text-xs text-zinc-600">
                <span
                  className={cn(
                    "h-3.5 w-3.5 border border-zinc-300 bg-white",
                    type === "RADIO" ? "rounded-full" : "rounded"
                  )}
                />
                {opt}
              </div>
            ))}
          </div>
        ) : type === "CHECKBOX" ? (
          <div className="flex items-center gap-2 text-xs text-zinc-600">
            <span className="h-3.5 w-3.5 rounded border border-zinc-300 bg-white" />
            {placeholder || "I agree"}
          </div>
        ) : type === "FILE" ? (
          <div className="rounded-lg border border-dashed border-zinc-300 px-3 py-4 text-center text-xs text-zinc-400">
            Drop a file here or click to browse
          </div>
        ) : (
          <div className="h-9 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-400">
            {placeholder || placeholderHint(type)}
          </div>
        )}
      </div>
    </div>
  );
}

function defaultOptions(type: FormFieldType) {
  if (type === "RADIO") return "Yes\nNo\nMaybe";
  if (type === "MULTISELECT" || type === "CHECKBOXES") {
    return "Products\nCourses\nMembership\nConsultation";
  }
  return "Option A\nOption B\nOption C";
}

function placeholderHint(type: FormFieldType) {
  if (type === "EMAIL") return "name@example.com";
  if (type === "PHONE") return "+62 812 0000 0000";
  if (type === "NUMBER") return "1000000";
  if (type === "URL") return "https://example.com";
  if (type === "DATE") return "YYYY-MM-DD";
  if (type === "TEXTAREA") return "Tell us more...";
  return "Short answer";
}
