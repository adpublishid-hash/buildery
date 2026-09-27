import { ClipboardList } from "lucide-react";

import { PublicForm, type PublicField } from "@/components/forms/public-form";
import type { FormEmbedData } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";

const WIDTHS: Record<FormEmbedData["width"], string> = {
  narrow: "max-w-3xl",
  wide: "max-w-5xl",
  full: "max-w-6xl",
};

export function FormEmbedBlock({ data }: { data: FormEmbedData }) {
  const layout = data.layout ?? "card";
  const tone = data.tone ?? "light";
  const align = data.align ?? "center";
  const heading = data.useFormCopy && data.formTitle ? data.formTitle : data.heading;
  const description =
    data.useFormCopy && data.formDescription
      ? data.formDescription
      : data.description;
  const fields: PublicField[] = data.fields.map((f) => ({
    id: f.id,
    label: f.label,
    name: f.name,
    type: f.type,
    required: f.required,
    placeholder: f.placeholder ?? null,
    helpText: null,
    options: f.options ?? [],
    pageStep: 0,
    minLength: null,
    maxLength: null,
    minValue: null,
    maxValue: null,
    pattern: null,
    patternHint: null,
    acceptMime: null,
    visibleIf: null,
  }));
  const canSubmit = Boolean(data.formId) && data.isOpen && fields.length > 0;

  return (
    <section className="px-6 py-16 md:px-10">
      <div className={cn("mx-auto", WIDTHS[data.width ?? "wide"])}>
        <div
          className={cn(
            layout === "split" && "grid items-start gap-8 lg:grid-cols-[0.8fr_1.2fr]",
            layout !== "minimal" && shellClass(tone),
            layout === "card" && "mx-auto max-w-3xl",
            layout === "minimal" && "mx-auto max-w-3xl",
            "p-6 sm:p-8"
          )}
        >
          {data.showHeader ? (
            <div
              className={cn(
                layout === "split" ? "" : align === "center" && "text-center",
                layout !== "split" && "mb-7"
              )}
            >
              {data.eyebrow ? (
                <p className={cn("mb-2 text-xs font-semibold uppercase", mutedClass(tone))}>
                  {data.eyebrow}
                </p>
              ) : null}
              {heading ? (
                <h2 className={cn("text-3xl font-semibold tracking-tight md:text-4xl", headingClass(tone))}>
                  {heading}
                </h2>
              ) : null}
              {description ? (
                <p className={cn("mt-3 text-base leading-relaxed", bodyClass(tone))}>
                  {description}
                </p>
              ) : null}
            </div>
          ) : null}

          <div>
            {canSubmit ? (
              <PublicForm
                formId={data.formId}
                fields={fields}
                submitLabel={data.submitLabel}
                successMessage={data.successMessage}
                multiStep={false}
              />
            ) : (
              <EmptyFormState data={data} tone={tone} />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function EmptyFormState({
  data,
  tone,
}: {
  data: FormEmbedData;
  tone: FormEmbedData["tone"];
}) {
  const message = data.formId && !data.isOpen ? data.closedText : data.emptyText;

  return (
    <div
      className={cn(
        "rounded-xl border border-dashed px-5 py-8 text-center",
        tone === "dark"
          ? "border-white/15 bg-white/5 text-zinc-300"
          : "border-zinc-200 bg-zinc-50 text-zinc-500"
      )}
    >
      <ClipboardList className="mx-auto mb-3 h-6 w-6 opacity-60" />
      <p className="text-sm">{message}</p>
      {!data.formId && data.formSlug ? (
        <p className="mt-1 text-xs opacity-70">Slug: {data.formSlug}</p>
      ) : null}
    </div>
  );
}

function shellClass(tone: FormEmbedData["tone"]) {
  if (tone === "dark") return "rounded-2xl border border-zinc-900 bg-zinc-950";
  if (tone === "accent") {
    return "rounded-2xl border border-zinc-200 bg-[color-mix(in_srgb,var(--bd-accent)_8%,white)]";
  }
  if (tone === "soft") return "rounded-2xl border border-zinc-200 bg-zinc-50";
  return "rounded-2xl border border-zinc-200 bg-white shadow-sm";
}

function headingClass(tone: FormEmbedData["tone"]) {
  return tone === "dark" ? "text-white" : "text-zinc-900";
}

function bodyClass(tone: FormEmbedData["tone"]) {
  return tone === "dark" ? "text-zinc-300" : "text-zinc-500";
}

function mutedClass(tone: FormEmbedData["tone"]) {
  return tone === "dark" ? "text-zinc-400" : "text-zinc-400";
}
