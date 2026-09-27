import type React from "react";

import { Clock3, Mail, MapPin, Phone } from "lucide-react";

import type { ContactFormData } from "@/lib/blocks/schema";
import { cn } from "@/lib/utils";

const WIDTHS: Record<ContactFormData["width"], string> = {
  narrow: "max-w-3xl",
  wide: "max-w-5xl",
  full: "max-w-6xl",
};

export function ContactFormBlock({ data }: { data: ContactFormData }) {
  const layout = data.layout ?? "card";
  const align = data.align ?? "center";
  const showAside = data.showContactInfo && layout === "split";

  return (
    <section className="px-6 py-16 md:px-10">
      <div className={cn("mx-auto", WIDTHS[data.width ?? "wide"])}>
        <div
          className={cn(
            layout === "split" && "grid gap-8 lg:grid-cols-[0.82fr_1.18fr]",
            layout !== "minimal" && shellClass(data.tone, layout),
            layout === "card" && "mx-auto max-w-2xl",
            layout === "minimal" && "mx-auto max-w-2xl",
            data.compact ? "p-5 sm:p-6" : "p-6 sm:p-8"
          )}
        >
          <div
            className={cn(
              layout === "split" ? "" : align === "center" && "text-center",
              layout !== "split" && "mb-7"
            )}
          >
            {data.eyebrow ? (
              <p className={cn("mb-2 text-xs font-semibold uppercase tracking-widest", mutedClass(data.tone))}>
                {data.eyebrow}
              </p>
            ) : null}
            {data.heading ? (
              <h2 className={cn("text-3xl font-semibold tracking-tight md:text-4xl", headingClass(data.tone))}>
                {data.heading}
              </h2>
            ) : null}
            {data.description ? (
              <p className={cn("mt-3 text-base leading-relaxed", bodyClass(data.tone))}>
                {data.description}
              </p>
            ) : null}

            {showAside ? <ContactAside data={data} /> : null}
          </div>

          <div>
            <ContactFormPreview data={data} />
            {data.showContactInfo && layout !== "split" ? (
              <ContactInfoStrip data={data} />
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function ContactFormPreview({ data }: { data: ContactFormData }) {
  const action = formAction(data);
  const enabled = data.submitMode !== "disabled" && Boolean(action);

  return (
    <form
      action={enabled ? action : undefined}
      method={data.submitMode === "external" ? "post" : "get"}
      className="space-y-4 text-left"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          name="name"
          label={data.nameLabel}
          placeholder={data.namePlaceholder}
          tone={data.tone}
          style={data.fieldStyle}
          required
        />
        <FormField
          name="email"
          type="email"
          label={data.emailLabel}
          placeholder={data.emailPlaceholder}
          tone={data.tone}
          style={data.fieldStyle}
          required
        />
      </div>

      {(data.showPhone || data.showCompany) ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.showPhone ? (
            <FormField
              name="phone"
              type="tel"
              label={data.phoneLabel}
              placeholder={data.phonePlaceholder}
              tone={data.tone}
              style={data.fieldStyle}
            />
          ) : null}
          {data.showCompany ? (
            <FormField
              name="company"
              label={data.companyLabel}
              placeholder={data.companyPlaceholder}
              tone={data.tone}
              style={data.fieldStyle}
            />
          ) : null}
        </div>
      ) : null}

      {data.showSubject ? (
        <FormField
          name={data.submitMode === "mailto" ? "subject" : "subject"}
          label={data.subjectLabel}
          placeholder={data.subjectPlaceholder}
          tone={data.tone}
          style={data.fieldStyle}
        />
      ) : null}

      <div>
        <label className={cn("mb-1.5 block text-sm font-medium", labelClass(data.tone))}>
          {data.messageLabel}
        </label>
        <textarea
          name={data.submitMode === "mailto" ? "body" : "message"}
          required
          rows={data.compact ? 4 : 6}
          placeholder={data.messagePlaceholder}
          className={cn(
            "w-full resize-y px-4 py-3 text-sm outline-none transition",
            inputClass(data.tone, data.fieldStyle)
          )}
        />
      </div>

      {data.showConsent && data.consentLabel ? (
        <label className={cn("flex gap-2 text-sm leading-relaxed", bodyClass(data.tone))}>
          <input type="checkbox" required className="mt-1" />
          <span>{data.consentLabel}</span>
        </label>
      ) : null}

      <button
        type="submit"
        disabled={!enabled}
        className={cn(
          "inline-flex h-11 w-full items-center justify-center rounded-lg px-5 text-sm font-medium transition sm:w-auto",
          buttonClass(data.buttonStyle, data.tone),
          !enabled && "cursor-not-allowed opacity-70"
        )}
      >
        {data.buttonLabel}
      </button>

      {data.privacyText ? (
        <p className={cn("text-xs leading-relaxed", bodyClass(data.tone))}>
          {data.privacyText}
        </p>
      ) : null}
      {data.submitMode === "disabled" ? (
        <p className={cn("text-xs", mutedClass(data.tone))}>
          Connect a form action or recipient email to collect submissions.
        </p>
      ) : null}
    </form>
  );
}

function FormField({
  name,
  type = "text",
  label,
  placeholder,
  tone,
  style,
  required = false,
}: {
  name: string;
  type?: string;
  label: string;
  placeholder: string;
  tone: ContactFormData["tone"];
  style: ContactFormData["fieldStyle"];
  required?: boolean;
}) {
  return (
    <div>
      <label className={cn("mb-1.5 block text-sm font-medium", labelClass(tone))}>
        {label}
      </label>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className={cn(
          "h-11 w-full px-4 text-sm outline-none transition",
          inputClass(tone, style)
        )}
      />
    </div>
  );
}

function ContactAside({ data }: { data: ContactFormData }) {
  return (
    <div className="mt-8 space-y-3">
      <ContactLine icon={Mail} label={data.contactEmail} tone={data.tone} href={data.contactEmail ? `mailto:${data.contactEmail}` : ""} />
      <ContactLine icon={Phone} label={data.contactPhone} tone={data.tone} href={data.contactPhone ? `tel:${data.contactPhone}` : ""} />
      <ContactLine icon={MapPin} label={data.contactAddress} tone={data.tone} />
      <ContactLine icon={Clock3} label={data.responseTime} tone={data.tone} />
    </div>
  );
}

function ContactInfoStrip({ data }: { data: ContactFormData }) {
  const items = [
    { icon: Mail, label: data.contactEmail, href: data.contactEmail ? `mailto:${data.contactEmail}` : "" },
    { icon: Phone, label: data.contactPhone, href: data.contactPhone ? `tel:${data.contactPhone}` : "" },
    { icon: Clock3, label: data.responseTime, href: "" },
  ].filter((item) => item.label);

  if (items.length === 0) return null;

  return (
    <div className="mt-6 grid gap-2 sm:grid-cols-3">
      {items.map((item) => (
        <ContactLine key={item.label} icon={item.icon} label={item.label} href={item.href} tone={data.tone} compact />
      ))}
    </div>
  );
}

function ContactLine({
  icon: Icon,
  label,
  href = "",
  tone,
  compact = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href?: string;
  tone: ContactFormData["tone"];
  compact?: boolean;
}) {
  if (!label) return null;
  const content = (
    <span className={cn("flex items-center gap-2", compact ? "text-xs" : "text-sm", bodyClass(tone))}>
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </span>
  );
  return href ? (
    <a href={href} className="block rounded-lg transition hover:opacity-80">
      {content}
    </a>
  ) : (
    content
  );
}

function formAction(data: ContactFormData) {
  if (data.submitMode === "external") return data.formAction;
  if (data.submitMode === "mailto" && data.recipientEmail) {
    return `mailto:${data.recipientEmail}`;
  }
  return "";
}

function shellClass(tone: ContactFormData["tone"], layout: ContactFormData["layout"]) {
  if (layout === "minimal") return "";
  if (tone === "dark") return "rounded-2xl border border-zinc-900 bg-zinc-950";
  if (tone === "accent") return "rounded-2xl border border-zinc-200 bg-[color-mix(in_srgb,var(--bd-accent)_8%,white)]";
  if (tone === "soft") return "rounded-2xl border border-zinc-200 bg-zinc-50";
  return "rounded-2xl border border-zinc-200 bg-white shadow-sm";
}

function headingClass(tone: ContactFormData["tone"]) {
  return tone === "dark" ? "text-white" : "text-zinc-900";
}

function bodyClass(tone: ContactFormData["tone"]) {
  return tone === "dark" ? "text-zinc-300" : "text-zinc-500";
}

function mutedClass(tone: ContactFormData["tone"]) {
  return tone === "dark" ? "text-zinc-400" : "text-zinc-400";
}

function labelClass(tone: ContactFormData["tone"]) {
  return tone === "dark" ? "text-zinc-200" : "text-zinc-700";
}

function inputClass(
  tone: ContactFormData["tone"],
  style: ContactFormData["fieldStyle"]
) {
  if (style === "underline") {
    return cn(
      "rounded-none border-0 border-b bg-transparent px-0",
      tone === "dark"
        ? "border-zinc-700 text-white placeholder:text-zinc-500 focus:border-zinc-400"
        : "border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-700"
    );
  }
  if (style === "filled") {
    return cn(
      "rounded-lg border",
      tone === "dark"
        ? "border-zinc-800 bg-zinc-900 text-white placeholder:text-zinc-500 focus:border-zinc-600"
        : "border-zinc-100 bg-zinc-100 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300"
    );
  }
  return cn(
    "rounded-lg border bg-white",
    tone === "dark"
      ? "border-zinc-700 bg-zinc-900 text-white placeholder:text-zinc-500 focus:border-zinc-500"
      : "border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400"
  );
}

function buttonClass(
  style: ContactFormData["buttonStyle"],
  tone: ContactFormData["tone"]
) {
  if (style === "outline") {
    return tone === "dark"
      ? "border border-white/30 text-white hover:bg-white/10"
      : "border border-zinc-300 text-zinc-950 hover:bg-zinc-100";
  }
  if (style === "soft") {
    return tone === "dark"
      ? "bg-white/10 text-white hover:bg-white/15"
      : "bg-zinc-100 text-zinc-950 hover:bg-zinc-200";
  }
  return "bg-[var(--bd-accent,#18181b)] text-white hover:opacity-90";
}
