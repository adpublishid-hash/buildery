"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Globe2, Loader2 } from "lucide-react";
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
import { updateWorkspaceGeneralAction } from "@/lib/actions/workspace";
import { PUBLIC_SITE_DOMAIN, publicSiteDisplayUrl } from "@/lib/public-url";
import {
  updateWorkspaceGeneralSchema,
  type UpdateWorkspaceGeneralInput,
} from "@/lib/zod";

type Props = {
  workspaceId: string;
  defaultValues: UpdateWorkspaceGeneralInput;
  canEdit: boolean;
};

export function GeneralSettingsForm({
  workspaceId,
  defaultValues,
  canEdit,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateWorkspaceGeneralInput>({
    resolver: zodResolver(updateWorkspaceGeneralSchema),
    defaultValues,
  });
  const slugValue = watch("slug");
  const languageValue = watch("language");
  const localeValue = watch("locale");
  const timezoneValue = watch("timezone");
  const currencyValue = watch("currencyCode");
  const dateFormatValue = watch("dateFormat");

  function onSubmit(values: UpdateWorkspaceGeneralInput) {
    setServerError(null);
    const fd = new FormData();
    fd.set("name", values.name);
    fd.set("slug", values.slug);
    fd.set("language", values.language);
    fd.set("locale", values.locale);
    fd.set("timezone", values.timezone);
    fd.set("currencyCode", values.currencyCode);
    fd.set("dateFormat", values.dateFormat);

    startTransition(async () => {
      const res = await updateWorkspaceGeneralAction(workspaceId, fd);
      if (!res.ok) {
        setServerError(res.error);
        if (res.fieldErrors) {
          for (const [field, msgs] of Object.entries(res.fieldErrors)) {
            if (msgs?.[0]) {
              setError(field as keyof UpdateWorkspaceGeneralInput, {
                message: msgs[0],
              });
            }
          }
        }
        return;
      }
      toast.success("Pengaturan workspace disimpan");
      reset(values);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="name">Nama workspace</Label>
        <Input id="name" disabled={!canEdit} {...register("name")} />
        {errors.name && (
          <p className="text-xs text-red-600">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="slug">Slug</Label>
        <div className="kv-field flex h-[32px] items-stretch overflow-hidden rounded-[8px] border-[0.8px] border-kv-border bg-kv-card transition-[border-color,box-shadow] duration-150 hover:border-[#d1d5db] focus-within:border-[#9ca3af] focus-within:shadow-[0_0_0_3px_rgba(156,163,175,0.18)]">
          <input
            id="slug"
            disabled={!canEdit}
            className="min-w-0 flex-1 bg-transparent px-[10px] text-[13px] text-kv-fg outline-none placeholder:text-kv-muted-fg disabled:opacity-60"
            {...register("slug")}
          />
          <span className="flex items-center border-l-[0.8px] border-kv-border bg-kv-secondary px-[10px] text-[12px] text-kv-muted-fg">
            .{PUBLIC_SITE_DOMAIN}
          </span>
        </div>
        {errors.slug && (
          <p className="text-xs text-red-600">{errors.slug.message}</p>
        )}
        {!errors.slug && (
          <p className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            <Globe2 className="h-3.5 w-3.5" />
            URL publik: {publicSiteDisplayUrl(slugValue || "workspace")}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="language">Bahasa</Label>
        <Select
          disabled={!canEdit}
          value={languageValue}
          onValueChange={(value) =>
            setValue(
              "language",
              value as UpdateWorkspaceGeneralInput["language"],
              { shouldDirty: true, shouldValidate: true }
            )
          }
        >
          <SelectTrigger id="language">
            <SelectValue placeholder="Pilih bahasa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ID">Bahasa Indonesia</SelectItem>
            <SelectItem value="EN">English</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Default aplikasi menggunakan Bahasa Indonesia. Pilih English untuk
          workspace yang ingin memakai tampilan bahasa Inggris.
        </p>
        <input type="hidden" {...register("language")} />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="locale">Locale</Label>
          <Select disabled={!canEdit} value={localeValue} onValueChange={(value) => setValue("locale", value as UpdateWorkspaceGeneralInput["locale"], { shouldDirty: true })}>
            <SelectTrigger id="locale"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="id-ID">Indonesia</SelectItem>
              <SelectItem value="en-US">English (US)</SelectItem>
              <SelectItem value="en-GB">English (UK)</SelectItem>
            </SelectContent>
          </Select>
          <input type="hidden" {...register("locale")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="timezone">Zona waktu</Label>
          <Select disabled={!canEdit} value={timezoneValue} onValueChange={(value) => setValue("timezone", value as UpdateWorkspaceGeneralInput["timezone"], { shouldDirty: true })}>
            <SelectTrigger id="timezone"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Asia/Jakarta">WIB (Asia/Jakarta)</SelectItem>
              <SelectItem value="Asia/Makassar">WITA (Asia/Makassar)</SelectItem>
              <SelectItem value="Asia/Jayapura">WIT (Asia/Jayapura)</SelectItem>
              <SelectItem value="UTC">UTC</SelectItem>
            </SelectContent>
          </Select>
          <input type="hidden" {...register("timezone")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="currencyCode">Mata uang</Label>
          <Select disabled={!canEdit} value={currencyValue} onValueChange={(value) => setValue("currencyCode", value, { shouldDirty: true })}>
            <SelectTrigger id="currencyCode"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="IDR">IDR</SelectItem><SelectItem value="USD">USD</SelectItem><SelectItem value="SGD">SGD</SelectItem><SelectItem value="MYR">MYR</SelectItem></SelectContent>
          </Select>
          <input type="hidden" {...register("currencyCode")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dateFormat">Format tanggal</Label>
          <Select disabled={!canEdit} value={dateFormatValue} onValueChange={(value) => setValue("dateFormat", value as UpdateWorkspaceGeneralInput["dateFormat"], { shouldDirty: true })}>
            <SelectTrigger id="dateFormat"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem><SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem><SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem></SelectContent>
          </Select>
          <input type="hidden" {...register("dateFormat")} />
        </div>
      </div>

      {serverError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {serverError}
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={!canEdit || pending || !isDirty}>
          {pending ? (
            <>
              <Loader2 className="animate-spin" /> Menyimpan...
            </>
          ) : (
            "Simpan perubahan"
          )}
        </Button>
      </div>
    </form>
  );
}
