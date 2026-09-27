"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import type { FormFieldType } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitFormAction } from "@/lib/actions/form-submission";
import { trackMetaEvent } from "@/lib/meta-client";
import { cn } from "@/lib/utils";
import {
  evaluateVisible,
  type VisibleIfCondition,
} from "@/lib/forms-shared";

export type PublicField = {
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

type Props = {
  formId: string;
  fields: PublicField[];
  submitLabel: string;
  successMessage: string;
  multiStep: boolean;
};

type FormValue = string | string[] | File | null;

const HTML_TYPE: Partial<Record<FormFieldType, string>> = {
  TEXT: "text",
  EMAIL: "email",
  PHONE: "tel",
  NUMBER: "number",
  URL: "url",
  DATE: "date",
};

const MAX_FILE_BYTES = 8 * 1024 * 1024;

export function PublicForm({
  formId,
  fields,
  submitLabel,
  successMessage,
  multiStep,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, FormValue>>({});
  const renderedAtRef = useRef<number>(Date.now());
  // Steps already reported, so re-entering one by going back does not count
  // twice — the funnel measures how far people got, not how much they moved.
  const reportedStepsRef = useRef<Set<number>>(new Set());
  // One idempotency key per fill. A resent request carries the same value, so
  // the server collapses it instead of recording a second lead.
  const requestIdRef = useRef<string>(newRequestId());

  const pages = useMemo(() => {
    if (!multiStep) return [fields];
    const groups = new Map<number, PublicField[]>();
    for (const field of fields) {
      const step = field.pageStep || 0;
      const list = groups.get(step) ?? [];
      list.push(field);
      groups.set(step, list);
    }
    return Array.from(groups.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, list]) => list);
  }, [fields, multiStep]);

  const [pageIndex, setPageIndex] = useState(0);
  useEffect(() => {
    setPageIndex(0);
    reportedStepsRef.current = new Set();
  }, [formId]);

  /**
   * Funnel beacon. Step 0 fires on first render; a later step fires the
   * first time the visitor reaches it. The gap between consecutive steps is
   * where a multi-step form is losing people.
   *
   * Fire-and-forget on purpose — the form must stay usable whether or not
   * this lands.
   */
  useEffect(() => {
    if (reportedStepsRef.current.has(pageIndex)) return;
    reportedStepsRef.current.add(pageIndex);
    const controller = new AbortController();
    void fetch(`/api/forms/${formId}/view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: pageIndex }),
      signal: controller.signal,
      keepalive: true,
    }).catch(() => {});
    return () => controller.abort();
  }, [formId, pageIndex]);

  const visibleByName = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const f of fields) {
      map.set(f.name, evaluateVisible(f.visibleIf, values));
    }
    return map;
  }, [fields, values]);

  useEffect(() => {
    setErrors((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (visibleByName.get(key) === false) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [visibleByName]);

  const currentFields = pages[pageIndex] ?? [];

  function setField(name: string, value: FormValue) {
    setValues((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  }

  function clientValidatePage(): Record<string, string> {
    const pageErrors: Record<string, string> = {};
    for (const field of currentFields) {
      if (!visibleByName.get(field.name)) continue;
      const value = values[field.name];

      if (field.type === "CHECKBOX") {
        const checked = value === "on" || value === "true";
        if (field.required && !checked) {
          pageErrors[field.name] = "Please tick this box.";
        }
        continue;
      }
      if (field.type === "MULTISELECT" || field.type === "CHECKBOXES") {
        const list = Array.isArray(value) ? value : [];
        if (field.required && list.length === 0) {
          pageErrors[field.name] = "Choose at least one option.";
          continue;
        }
        if (list.some((item) => !field.options.includes(item))) {
          pageErrors[field.name] = "Choose only offered options.";
        }
        continue;
      }
      if (field.type === "FILE") {
        const file = value instanceof File ? value : null;
        if (!file || file.size === 0) {
          if (field.required) pageErrors[field.name] = "Please attach a file.";
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          pageErrors[field.name] = "File must be 8 MB or smaller.";
          continue;
        }
        if (
          field.acceptMime &&
          !field.acceptMime
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
            .some((pattern) => mimeMatches(pattern, file.type))
        ) {
          pageErrors[field.name] = `Allowed types: ${field.acceptMime}.`;
        }
        continue;
      }
      const text = typeof value === "string" ? value.trim() : "";
      if (!text) {
        if (field.required) pageErrors[field.name] = "This field is required.";
        continue;
      }
      if (field.minLength != null && text.length < field.minLength) {
        pageErrors[field.name] = `Use at least ${field.minLength} characters.`;
        continue;
      }
      if (field.maxLength != null && text.length > field.maxLength) {
        pageErrors[field.name] = `Use at most ${field.maxLength} characters.`;
        continue;
      }
      if (field.type === "NUMBER") {
        const num = Number(text);
        if (!Number.isFinite(num)) {
          pageErrors[field.name] = "Enter a valid number.";
          continue;
        }
        if (field.minValue != null && num < field.minValue) {
          pageErrors[field.name] = `Enter ${field.minValue} or more.`;
          continue;
        }
        if (field.maxValue != null && num > field.maxValue) {
          pageErrors[field.name] = `Enter ${field.maxValue} or less.`;
          continue;
        }
      }
      if (field.type === "EMAIL" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
        pageErrors[field.name] = "Enter a valid email.";
        continue;
      }
      if (field.type === "PHONE" && !/^[+()0-9\s-]{4,30}$/.test(text)) {
        pageErrors[field.name] = "Enter a valid phone number.";
        continue;
      }
      if (field.type === "URL" && !isHttpUrl(text)) {
        pageErrors[field.name] = "Enter a valid URL.";
        continue;
      }
      if (field.type === "DATE" && !isIsoDate(text)) {
        pageErrors[field.name] = "Enter a valid date.";
        continue;
      }
      if (
        (field.type === "SELECT" || field.type === "RADIO") &&
        field.options.length > 0 &&
        !field.options.includes(text)
      ) {
        pageErrors[field.name] = "Pick one of the offered options.";
        continue;
      }
      if (field.pattern) {
        try {
          const re = new RegExp(field.pattern);
          if (!re.test(text)) {
            pageErrors[field.name] =
              field.patternHint || "Doesn't match the required format.";
            continue;
          }
        } catch {
          // Server will reject invalid patterns silently — don't block here.
        }
      }
    }
    return pageErrors;
  }

  function next() {
    const e = clientValidatePage();
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }
    setErrors({});
    setPageIndex((i) => Math.min(i + 1, pages.length - 1));
  }

  function back() {
    setErrors({});
    setPageIndex((i) => Math.max(i - 1, 0));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setServerError(null);

    const pageErrors = clientValidatePage();
    if (Object.keys(pageErrors).length > 0) {
      setErrors(pageErrors);
      return;
    }

    const fd = new FormData(e.currentTarget);
    fd.set("_ml_t", String(renderedAtRef.current));
    fd.set("_ml_rid", requestIdRef.current);
    startTransition(async () => {
      const res = await submitFormAction(formId, fd);
      if (!res.ok) {
        setServerError(res.error);
        if (res.fieldErrors) {
          const flat: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.fieldErrors)) {
            if (v?.[0]) flat[k] = v[0];
          }
          setErrors(flat);
          if (multiStep) {
            const firstBadPage = pages.findIndex((page) =>
              page.some((f) => flat[f.name])
            );
            if (firstBadPage >= 0) setPageIndex(firstBadPage);
          }
        }
        return;
      }
      if (res.data?.metaEvent) {
        trackMetaEvent({
          workspaceId: res.data.metaEvent.workspaceId,
          eventName: res.data.metaEvent.eventName,
          eventId: res.data.metaEvent.eventId,
          customData: res.data.metaEvent.customData,
          sendServer: false,
        });
      }
      const redirectUrl = res.data?.redirectUrl;
      if (redirectUrl) {
        window.location.href = redirectUrl;
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
        <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-emerald-600" />
        <p className="text-sm font-medium text-emerald-900">
          {successMessage}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4 border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-100"
          onClick={() => {
            setDone(false);
            setValues({});
            setPageIndex(0);
            renderedAtRef.current = Date.now();
            // A genuinely new response needs a new key, or it would be
            // mistaken for a resend of the one just filed.
            requestIdRef.current = newRequestId();
            reportedStepsRef.current = new Set();
          }}
        >
          Submit another response
        </Button>
      </div>
    );
  }

  const onLastPage = pageIndex >= pages.length - 1;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="hidden" aria-hidden="true">
        <label htmlFor={`company-${formId}`}>Company</label>
        <input id={`company-${formId}`} name="_ml_company" tabIndex={-1} />
      </div>

      {multiStep && pages.length > 1 ? (
        <StepIndicator
          total={pages.length}
          current={pageIndex}
          onJump={(idx) => {
            if (idx < pageIndex) setPageIndex(idx);
          }}
        />
      ) : null}

      <div className="space-y-4">
        {(multiStep ? currentFields : fields).map((field) => {
          const visible = visibleByName.get(field.name);
          if (!visible) return null;
          return (
            <FieldGroup
              key={field.id}
              field={field}
              value={values[field.name]}
              error={errors[field.name]}
              onChange={(v) => setField(field.name, v)}
            />
          );
        })}
      </div>

      {serverError && Object.keys(errors).length === 0 ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {serverError}
        </div>
      ) : null}

      {multiStep && pages.length > 1 ? (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={pageIndex === 0 || pending}
            onClick={back}
          >
            Back
          </Button>
          {onLastPage ? (
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {pending ? "Submitting…" : submitLabel}
            </Button>
          ) : (
            <Button type="button" onClick={next} disabled={pending}>
              Next
            </Button>
          )}
        </div>
      ) : (
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {pending ? "Submitting…" : submitLabel}
        </Button>
      )}
    </form>
  );
}

function StepIndicator({
  total,
  current,
  onJump,
}: {
  total: number;
  current: number;
  onJump: (idx: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onJump(i)}
          aria-label={`Step ${i + 1}`}
          className={cn(
            "h-1.5 flex-1 rounded-full transition",
            i <= current ? "bg-zinc-900" : "bg-zinc-200"
          )}
        />
      ))}
    </div>
  );
}

function FieldGroup({
  field,
  value,
  error,
  onChange,
}: {
  field: PublicField;
  value: FormValue | undefined;
  error: string | undefined;
  onChange: (value: FormValue) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`f-${field.id}`}>
        {field.label}
        {field.required ? <span className="text-red-500"> *</span> : null}
      </Label>
      {field.helpText ? (
        <p className="text-xs text-zinc-500">{field.helpText}</p>
      ) : null}
      {renderInput(field, value, onChange, Boolean(error))}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

function renderInput(
  field: PublicField,
  value: FormValue | undefined,
  onChange: (value: FormValue) => void,
  hasError: boolean
) {
  const baseClass = cn(hasError && "border-red-300 focus-visible:ring-red-500");

  if (field.type === "TEXTAREA") {
    return (
      <Textarea
        id={`f-${field.id}`}
        name={field.name}
        rows={4}
        required={field.required}
        placeholder={field.placeholder ?? ""}
        className={baseClass}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.currentTarget.value)}
        minLength={field.minLength ?? undefined}
        maxLength={field.maxLength ?? undefined}
      />
    );
  }

  if (field.type === "SELECT") {
    return (
      <select
        id={`f-${field.id}`}
        name={field.name}
        required={field.required}
        className={cn(
          "flex h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900",
          baseClass
        )}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.currentTarget.value)}
      >
        <option value="" disabled>
          Select an option
        </option>
        {field.options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "MULTISELECT") {
    return (
      <select
        id={`f-${field.id}`}
        name={field.name}
        required={field.required}
        multiple
        className={cn(
          "flex min-h-28 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900",
          baseClass
        )}
        value={Array.isArray(value) ? value : []}
        onChange={(e) =>
          onChange(
            Array.from(e.currentTarget.selectedOptions).map((opt) => opt.value)
          )
        }
      >
        {field.options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "RADIO") {
    return (
      <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-3">
        {field.options.map((opt) => (
          <label
            key={opt}
            className="flex items-center gap-2 text-sm text-zinc-700"
          >
            <input
              name={field.name}
              type="radio"
              value={opt}
              required={field.required}
              checked={value === opt}
              onChange={() => onChange(opt)}
              className="h-4 w-4 border-zinc-300 text-zinc-900 focus:ring-zinc-900"
            />
            {opt}
          </label>
        ))}
      </div>
    );
  }

  if (field.type === "CHECKBOXES") {
    const list = Array.isArray(value) ? value : [];
    return (
      <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-3">
        {field.options.map((opt) => (
          <label
            key={opt}
            className="flex items-center gap-2 text-sm text-zinc-700"
          >
            <input
              name={field.name}
              type="checkbox"
              value={opt}
              checked={list.includes(opt)}
              onChange={(e) => {
                const next = e.currentTarget.checked
                  ? [...list, opt]
                  : list.filter((v) => v !== opt);
                onChange(next);
              }}
              className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
            />
            {opt}
          </label>
        ))}
      </div>
    );
  }

  if (field.type === "CHECKBOX") {
    return (
      <label
        htmlFor={`f-${field.id}`}
        className="flex items-center gap-2 text-sm text-zinc-700"
      >
        <input
          id={`f-${field.id}`}
          name={field.name}
          type="checkbox"
          required={field.required}
          checked={value === "on" || value === "true"}
          onChange={(e) => onChange(e.currentTarget.checked ? "on" : "")}
          className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
        />
        {field.placeholder ?? "I agree"}
      </label>
    );
  }

  if (field.type === "FILE") {
    return (
      <input
        id={`f-${field.id}`}
        name={field.name}
        type="file"
        required={field.required}
        accept={field.acceptMime ?? undefined}
        onChange={(e) => onChange(e.currentTarget.files?.[0] ?? null)}
        className={cn(
          "block w-full cursor-pointer rounded-lg border border-zinc-200 bg-white text-sm file:mr-3 file:rounded-l-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:text-zinc-700 hover:file:bg-zinc-200",
          baseClass
        )}
      />
    );
  }

  return (
    <Input
      id={`f-${field.id}`}
      name={field.name}
      type={HTML_TYPE[field.type] ?? "text"}
      required={field.required}
      placeholder={field.placeholder ?? ""}
      className={baseClass}
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.currentTarget.value)}
      minLength={field.minLength ?? undefined}
      maxLength={field.maxLength ?? undefined}
      min={
        field.type === "NUMBER" && field.minValue != null
          ? field.minValue
          : undefined
      }
      max={
        field.type === "NUMBER" && field.maxValue != null
          ? field.maxValue
          : undefined
      }
      pattern={field.pattern ?? undefined}
      title={field.patternHint ?? undefined}
    />
  );
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function mimeMatches(pattern: string, actual: string) {
  if (!pattern) return false;
  if (pattern === "*/*") return true;
  if (pattern.endsWith("/*")) return actual.startsWith(pattern.slice(0, -1));
  return pattern === actual;
}

/**
 * Matches what the server accepts: URL-safe, at most 64 characters.
 * `randomUUID` is missing on http:// origins and older browsers, so fall
 * back rather than throwing — a missing key only costs deduplication.
 */
function newRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
