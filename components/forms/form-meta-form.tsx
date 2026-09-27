"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
  createFormAction,
  updateFormAction,
} from "@/lib/actions/form";
import { slugify } from "@/lib/slug";

export type FormMetaValues = {
  title: string;
  slug: string;
  description: string;
  successMessage: string;
  submitLabel: string;
  isOpen: "true" | "false";
  multiStep: "true" | "false";
  notifyEmail: string;
  webhookUrl: string;
  redirectUrl: string;
  opensAt: string;
  closesAt: string;
  maxSubmissions: string;
  closedMessage: string;
};

type Props = {
  mode: "create" | "edit";
  formId?: string;
  defaultValues: FormMetaValues;
};

export function FormMetaForm({ mode, formId, defaultValues }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(mode === "edit");

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    setError,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormMetaValues>({ defaultValues });

  const title = watch("title");

  useEffect(() => {
    if (slugTouched) return;
    setValue("slug", slugify(title ?? ""));
  }, [title, slugTouched, setValue]);

  function onSubmit(values: FormMetaValues) {
    setServerError(null);
    const fd = new FormData();
    fd.set("title", values.title);
    fd.set("slug", values.slug);
    fd.set("description", values.description);
    fd.set("successMessage", values.successMessage);
    fd.set("submitLabel", values.submitLabel);
    fd.set("isOpen", values.isOpen);
    fd.set("multiStep", values.multiStep);
    fd.set("notifyEmail", values.notifyEmail);
    fd.set("webhookUrl", values.webhookUrl);
    fd.set("redirectUrl", values.redirectUrl);
    fd.set("opensAt", values.opensAt);
    fd.set("closesAt", values.closesAt);
    fd.set("maxSubmissions", values.maxSubmissions);
    fd.set("closedMessage", values.closedMessage);

    startTransition(async () => {
      const res =
        mode === "create"
          ? await createFormAction(fd)
          : await updateFormAction(formId!, fd);
      if (!res.ok) {
        setServerError(res.error);
        if (res.fieldErrors) {
          for (const [field, msgs] of Object.entries(res.fieldErrors)) {
            if (msgs?.[0]) {
              setError(field as keyof FormMetaValues, { message: msgs[0] });
            }
          }
        }
        return;
      }
      toast.success(mode === "create" ? "Form created" : "Form saved");
      reset(values);
      const created =
        mode === "create" && "data" in res
          ? (res.data as { formId: string } | undefined)
          : undefined;
      if (created?.formId) {
        router.push(`/dashboard/forms/${created.formId}/edit`);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            autoFocus={mode === "create"}
            {...register("title", { required: "Title is required" })}
          />
          {errors.title && (
            <p className="text-xs text-kv-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="slug">Slug</Label>
          <div className="flex h-9 items-stretch overflow-hidden rounded-lg border border-kv-border bg-white">
            <span className="flex items-center px-3 text-sm text-kv-subtle">
              /forms/
            </span>
            <input
              id="slug"
              className="flex-1 bg-transparent text-sm outline-none"
              {...register("slug", {
                required: "Slug is required",
                onChange: () => setSlugTouched(true),
              })}
            />
          </div>
          {errors.slug && (
            <p className="text-xs text-kv-destructive">{errors.slug.message}</p>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-kv-subtle">
              Public URL: /forms/{watch("slug") || "form-slug"}
            </p>
            <button
              type="button"
              onClick={() => {
                setSlugTouched(false);
                setValue("slug", slugify(title ?? ""), { shouldDirty: true });
              }}
              className="text-[11px] font-medium text-kv-muted-fg hover:text-kv-fg"
            >
              Regenerate
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          rows={2}
          placeholder="Short intro shown above the form fields."
          {...register("description")}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="submitLabel">Submit button label</Label>
        <Input id="submitLabel" {...register("submitLabel")} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="successMessage">Success message</Label>
        <Textarea
          id="successMessage"
          rows={2}
          {...register("successMessage")}
        />
      </div>

      <fieldset className="space-y-4 rounded-xl border border-kv-border bg-kv-secondary p-4">
        <legend className="-mt-1 -ml-1 bg-kv-secondary px-1 text-xs font-semibold uppercase text-kv-muted-fg">
          Notifications & integrations
        </legend>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="notifyEmail">Notification email</Label>
            <Input
              id="notifyEmail"
              type="email"
              placeholder="team@example.com"
              {...register("notifyEmail")}
            />
            {errors.notifyEmail && (
              <p className="text-xs text-kv-destructive">
                {errors.notifyEmail.message}
              </p>
            )}
            <p className="text-[11px] text-kv-subtle">
              We email this address every time the form is submitted. Leave
              blank to skip.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="webhookUrl">Webhook URL</Label>
            <Input
              id="webhookUrl"
              type="url"
              placeholder="https://hooks.example.com/forms"
              {...register("webhookUrl")}
            />
            {errors.webhookUrl && (
              <p className="text-xs text-kv-destructive">
                {errors.webhookUrl.message}
              </p>
            )}
            <p className="text-[11px] text-kv-subtle">
              We POST a JSON payload on each new submission, signed with{" "}
              <code>X-Buildery-Signature</code>. Failed deliveries retry
              automatically with backoff, and can also be retried by hand from
              the submissions list. Public addresses only — loopback and
              private-network URLs are refused.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="redirectUrl">Redirect on submit</Label>
            <Input
              id="redirectUrl"
              type="url"
              placeholder="https://example.com/thanks"
              {...register("redirectUrl")}
            />
            {errors.redirectUrl && (
              <p className="text-xs text-kv-destructive">
                {errors.redirectUrl.message}
              </p>
            )}
            <p className="text-[11px] text-kv-subtle">
              If set, visitors are taken to this URL after a successful
              submission instead of seeing the success message.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="multiStep">Multi-step form</Label>
            <Controller
              control={control}
              name="multiStep"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="multiStep">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">Single page</SelectItem>
                    <SelectItem value="true">Split fields by step</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-[11px] text-kv-subtle">
              Assign each field a page number when enabled. Visitors move
              between pages with Next / Back.
            </p>
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-xl border border-kv-border bg-kv-secondary p-4">
        <legend className="-mt-1 -ml-1 bg-kv-secondary px-1 text-xs font-semibold uppercase text-kv-muted-fg">
          Response controls
        </legend>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="opensAt">Opens at</Label>
            <Input
              id="opensAt"
              type="datetime-local"
              {...register("opensAt")}
            />
            {errors.opensAt ? (
              <p className="text-xs text-kv-destructive">{errors.opensAt.message}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="closesAt">Closes at</Label>
            <Input
              id="closesAt"
              type="datetime-local"
              {...register("closesAt")}
            />
            {errors.closesAt ? (
              <p className="text-xs text-kv-destructive">{errors.closesAt.message}</p>
            ) : null}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="maxSubmissions">Maximum submissions</Label>
          <Input
            id="maxSubmissions"
            type="number"
            min={1}
            max={1_000_000}
            placeholder="Unlimited"
            {...register("maxSubmissions")}
          />
          {errors.maxSubmissions ? (
            <p className="text-xs text-kv-destructive">
              {errors.maxSubmissions.message}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="closedMessage">Unavailable message</Label>
          <Textarea
            id="closedMessage"
            rows={2}
            {...register("closedMessage")}
          />
          <p className="text-[11px] text-kv-subtle">
            Shown when the form is closed, outside its schedule, or has reached
            its response limit.
          </p>
        </div>
      </fieldset>

      {serverError && (
        <div role="alert" className="rounded-[8px] border-[0.8px] border-red-200 bg-red-50/70 px-[12px] py-[8px] text-[12px] text-red-700">
          {serverError}
        </div>
      )}

      <div className="flex justify-end border-t-[0.8px] border-kv-border pt-[14px]">
        <Button
          type="submit"
          disabled={pending || (mode === "edit" && !isDirty)}
        >
          {pending ? <Loader2 className="animate-spin" /> : null}
          {mode === "create"
            ? pending
              ? "Creating…"
              : "Create form"
            : pending
              ? "Saving…"
              : "Save"}
        </Button>
      </div>
    </form>
  );
}
