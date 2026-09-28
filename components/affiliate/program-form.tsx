"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, type Control, type UseFormRegisterReturn } from "react-hook-form";
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
import { Switch } from "@/components/ui/switch";
import { updateAffiliateProgramAction } from "@/lib/actions/affiliate";

export type ProgramFormValues = {
  name: string;
  description: string;
  commissionPercent: string;
  isOpen: "true" | "false";
  approvalMode: "AUTO" | "MANUAL";
  attributionModel: "FIRST_CLICK" | "LAST_CLICK";
  attributionDays: string;
  holdDays: string;
  minimumPayout: string;
  allowSelfReferral: boolean;
  includeShipping: boolean;
  includeTax: boolean;
  includeFees: boolean;
  recurringCommissions: boolean;
  terms: string;
};

export function ProgramForm({
  defaultValues,
}: {
  defaultValues: ProgramFormValues;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<ProgramFormValues>({ defaultValues });

  function onSubmit(values: ProgramFormValues) {
    setServerError(null);
    const fd = new FormData();
    fd.set("name", values.name);
    fd.set("description", values.description);
    fd.set("commissionPercent", values.commissionPercent);
    fd.set("isOpen", values.isOpen);
    fd.set("approvalMode", values.approvalMode);
    fd.set("attributionModel", values.attributionModel);
    fd.set("attributionDays", values.attributionDays);
    fd.set("holdDays", values.holdDays);
    fd.set("minimumPayout", values.minimumPayout);
    fd.set("allowSelfReferral", String(values.allowSelfReferral));
    fd.set("includeShipping", String(values.includeShipping));
    fd.set("includeTax", String(values.includeTax));
    fd.set("includeFees", String(values.includeFees));
    fd.set("recurringCommissions", String(values.recurringCommissions));
    fd.set("terms", values.terms);

    startTransition(async () => {
      const res = await updateAffiliateProgramAction(fd);
      if (!res.ok) {
        setServerError(res.error);
        if (res.fieldErrors) {
          for (const [field, msgs] of Object.entries(res.fieldErrors)) {
            if (msgs?.[0]) {
              setError(field as keyof ProgramFormValues, { message: msgs[0] });
            }
          }
        }
        return;
      }
      toast.success("Program saved");
      reset(values);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-[22px]">
      <fieldset className="space-y-[14px] border-t-[0.8px] border-kv-border pt-[18px] first:border-t-0 first:pt-0">
        <div>
          <legend className="text-[13px] font-semibold text-kv-fg">Dasar</legend>
          <p className="mt-[2px] text-[12px] text-kv-muted-fg">Nama, besar komisi, dan apakah program menerima klik baru.</p>
        </div>
      <div className="space-y-2">
        <Label htmlFor="program-name">Program name</Label>
        <Input
          id="program-name"
          {...register("name", { required: "Name is required" })}
        />
        {errors.name && (
          <p className="text-xs text-kv-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="program-percent">Commission (%)</Label>
          <Input
            id="program-percent"
            type="number"
            min={0}
            max={100}
            {...register("commissionPercent", {
              required: "Commission is required",
            })}
          />
          {errors.commissionPercent && (
            <p className="text-xs text-kv-destructive">
              {errors.commissionPercent.message}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="program-open">Status</Label>
          <Controller
            control={control}
            name="isOpen"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="program-open">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Open (accepting clicks)</SelectItem>
                  <SelectItem value="false">Paused</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="program-description">Description</Label>
        <Textarea
          id="program-description"
          rows={3}
          {...register("description")}
        />
      </div>

      </fieldset>
      <fieldset className="space-y-[14px] border-t-[0.8px] border-kv-border pt-[18px] first:border-t-0 first:pt-0">
        <div>
          <legend className="text-[13px] font-semibold text-kv-fg">Persetujuan & atribusi</legend>
          <p className="mt-[2px] text-[12px] text-kv-muted-fg">Siapa yang boleh bergabung dan klik mana yang mendapat komisi.</p>
        </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="approval-mode">Application approval</Label>
          <Controller control={control} name="approvalMode" render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="approval-mode"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MANUAL">Manual review</SelectItem>
                <SelectItem value="AUTO">Automatic approval</SelectItem>
              </SelectContent>
            </Select>
          )} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="attribution-model">Attribution model</Label>
          <Controller control={control} name="attributionModel" render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="attribution-model"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="LAST_CLICK">Last click</SelectItem>
                <SelectItem value="FIRST_CLICK">First click</SelectItem>
              </SelectContent>
            </Select>
          )} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <NumberField id="attribution-days" label="Attribution window (days)" min={1} max={365} registration={register("attributionDays")} />
        <NumberField id="hold-days" label="Refund hold (days)" min={0} max={365} registration={register("holdDays")} />
        <NumberField id="minimum-payout" label="Minimum payout (IDR)" min={0} registration={register("minimumPayout")} />
      </div>

      </fieldset>
      <fieldset className="space-y-[14px] border-t-[0.8px] border-kv-border pt-[18px] first:border-t-0 first:pt-0">
        <div>
          <legend className="text-[13px] font-semibold text-kv-fg">Dasar perhitungan komisi</legend>
          <p className="mt-[2px] text-[12px] text-kv-muted-fg">Subtotal produk setelah diskon selalu dihitung. Pilih tambahan lainnya.</p>
        </div>
      <div className="space-y-3">
        <Toggle control={control} name="includeShipping" label="Include shipping" />
        <Toggle control={control} name="includeTax" label="Include added tax" />
        <Toggle control={control} name="includeFees" label="Include payment/COD fees" />
        <Toggle control={control} name="allowSelfReferral" label="Allow self-referrals" />
        <Toggle
          control={control}
          name="recurringCommissions"
          label="Recurring commission on membership renewals"
          hint="Off: a renewal pays only if it came through a referral link. On: the partner who referred the member is paid again on every renewal."
        />
      </div>

      </fieldset>
      <fieldset className="space-y-[14px] border-t-[0.8px] border-kv-border pt-[18px] first:border-t-0 first:pt-0">
        <div>
          <legend className="text-[13px] font-semibold text-kv-fg">Syarat program</legend>
          <p className="mt-[2px] text-[12px] text-kv-muted-fg">Tampil di portal afiliasi.</p>
        </div>
      <div className="space-y-2">
        <Label htmlFor="program-terms">Program terms</Label>
        <Textarea id="program-terms" rows={6} {...register("terms")} />
      </div>

      </fieldset>
      {serverError && (
        <div role="alert" className="rounded-[8px] border-[0.8px] border-red-200 bg-red-50/70 px-[12px] py-[8px] text-[12px] text-red-700">
          {serverError}
        </div>
      )}

      <div className="flex justify-end border-t-[0.8px] border-kv-border pt-[14px]">
        <Button type="submit" disabled={pending || !isDirty}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

function NumberField({ id, label, min, max, registration }: {
  id: string;
  label: string;
  min: number;
  max?: number;
  registration: UseFormRegisterReturn;
}) {
  return <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <Input id={id} type="number" min={min} max={max} {...registration} />
  </div>;
}

function Toggle({ control, name, label, hint }: {
  control: Control<ProgramFormValues>;
  name: "includeShipping" | "includeTax" | "includeFees" | "allowSelfReferral" | "recurringCommissions";
  label: string;
  hint?: string;
}) {
  return <Controller control={control} name={name} render={({ field }) => (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor={`toggle-${name}`} className="font-normal">{label}</Label>
        {hint ? <p className="mt-[2px] text-[11px] leading-[1.45] text-kv-muted-fg">{hint}</p> : null}
      </div>
      <Switch id={`toggle-${name}`} checked={field.value} onCheckedChange={field.onChange} />
    </div>
  )} />;
}
