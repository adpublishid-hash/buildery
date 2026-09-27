import type { FormFieldType } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type PreviewField = {
  id: string;
  label: string;
  name: string;
  type: FormFieldType;
  required: boolean;
  placeholder: string | null;
  options: string[];
};

type Props = {
  title: string;
  description: string | null;
  submitLabel: string;
  fields: PreviewField[];
};

export function FormPreview({
  title,
  description,
  submitLabel,
  fields,
}: Props) {
  return (
    <div className="rounded-2xl border border-kv-border bg-white p-5 shadow-sm">
      <div>
        <p className="text-lg font-semibold text-kv-fg">{title}</p>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-kv-muted-fg">{description}</p>
        ) : null}
      </div>
      <div className="mt-5 space-y-4">
        {fields.length === 0 ? (
          <div className="rounded-xl border border-dashed border-kv-border px-4 py-8 text-center text-sm text-kv-subtle">
            Add fields to preview the public form.
          </div>
        ) : (
          fields.map((field) => (
            <div key={field.id} className="space-y-1.5">
              <Label>
                {field.label}
                {field.required ? (
                  <span className="text-red-500"> *</span>
                ) : null}
              </Label>
              <PreviewInput field={field} />
            </div>
          ))
        )}
        <Button className="w-full" disabled>
          {submitLabel || "Submit"}
        </Button>
      </div>
    </div>
  );
}

function PreviewInput({ field }: { field: PreviewField }) {
  const disabled = "pointer-events-none opacity-80";

  if (field.type === "TEXTAREA") {
    return (
      <Textarea
        rows={3}
        disabled
        placeholder={field.placeholder ?? ""}
        className={disabled}
      />
    );
  }

  if (field.type === "SELECT") {
    return (
      <select
        disabled
        className={cn(
          "flex h-9 w-full rounded-lg border border-kv-border bg-white px-3 text-sm text-kv-muted-fg",
          disabled
        )}
        defaultValue=""
      >
        <option value="">Select an option</option>
        {field.options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    );
  }

  if (field.type === "MULTISELECT") {
    return (
      <select
        disabled
        multiple
        className={cn(
          "min-h-24 w-full rounded-lg border border-kv-border bg-white px-3 py-2 text-sm text-kv-muted-fg",
          disabled
        )}
      >
        {field.options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    );
  }

  if (field.type === "RADIO" || field.type === "CHECKBOXES") {
    return (
      <div
        className={cn(
          "space-y-2 rounded-lg border border-kv-border bg-white p-3",
          disabled
        )}
      >
        {field.options.map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm text-kv-secondary-fg">
            <input
              type={field.type === "RADIO" ? "radio" : "checkbox"}
              disabled
              className="h-4 w-4 rounded border-kv-border"
            />
            {option}
          </label>
        ))}
      </div>
    );
  }

  if (field.type === "CHECKBOX") {
    return (
      <label className="flex items-center gap-2 text-sm text-kv-secondary-fg">
        <input
          type="checkbox"
          disabled
          className="h-4 w-4 rounded border-kv-border"
        />
        {field.placeholder || "I agree"}
      </label>
    );
  }

  if (field.type === "FILE") {
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed border-kv-border px-3 py-5 text-center text-sm text-kv-subtle",
          disabled
        )}
      >
        Drop a file here or click to browse
      </div>
    );
  }

  return (
    <Input
      disabled
      type={
        field.type === "EMAIL"
          ? "email"
          : field.type === "PHONE"
            ? "tel"
            : field.type === "NUMBER"
              ? "number"
              : field.type === "URL"
                ? "url"
                : field.type === "DATE"
                  ? "date"
                  : "text"
      }
      placeholder={field.placeholder ?? ""}
      className={disabled}
    />
  );
}
