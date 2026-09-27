"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ImagePlus, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomDomainField } from "@/components/workspaces/custom-domain-field";
import { updateBrandingAction } from "@/lib/actions/workspace";
import {
  updateBrandingSchema,
  type UpdateBrandingInput,
} from "@/lib/zod";
import { getInitials } from "@/lib/utils";

type Props = {
  workspaceId: string;
  workspaceName: string;
  defaultValues: {
    logoUrl: string;
    faviconUrl: string;
    primaryColor: string;
    customDomain: string;
  };
  canEdit: boolean;
  serverIp: string;
  platformDomain: string;
  domainState: {
    verificationToken: string | null;
    status: string;
    sslStatus: string;
  };
};

export function BrandingForm({
  workspaceId,
  workspaceName,
  defaultValues,
  canEdit,
  serverIp,
  platformDomain,
  domainState,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [uploadingField, setUploadingField] = useState<
    "logoUrl" | "faviconUrl" | null
  >(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const faviconInputRef = useRef<HTMLInputElement | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateBrandingInput>({
    resolver: zodResolver(updateBrandingSchema),
    defaultValues,
  });

  const previewLogo = watch("logoUrl");
  const previewColor = watch("primaryColor") || "#18181b";
  const uploadDisabled = !canEdit || pending || Boolean(uploadingField);

  async function uploadImage(
    field: "logoUrl" | "faviconUrl",
    file: File | undefined
  ) {
    if (!file) return;
    setUploadingField(field);
    setServerError(null);

    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        toast.error(data?.error ?? "Upload gagal. Coba lagi.");
        return;
      }
      setValue(field, data.url, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      toast.success(
        field === "logoUrl" ? "Logo berhasil diupload" : "Favicon berhasil diupload"
      );
    } catch {
      toast.error("Upload gagal. Periksa koneksi lalu coba lagi.");
    } finally {
      setUploadingField(null);
    }
  }

  function onSubmit(values: UpdateBrandingInput) {
    setServerError(null);
    const fd = new FormData();
    fd.set("logoUrl", values.logoUrl ?? "");
    fd.set("faviconUrl", values.faviconUrl ?? "");
    fd.set("primaryColor", values.primaryColor);
    fd.set("customDomain", values.customDomain ?? "");

    startTransition(async () => {
      const res = await updateBrandingAction(workspaceId, fd);
      if (!res.ok) {
        setServerError(res.error);
        if (res.fieldErrors) {
          for (const [field, msgs] of Object.entries(res.fieldErrors)) {
            if (msgs?.[0]) {
              setError(field as keyof UpdateBrandingInput, {
                message: msgs[0],
              });
            }
          }
        }
        return;
      }
      toast.success("Branding saved");
      reset(values);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="flex items-center gap-4 rounded-xl border border-zinc-200/70 bg-zinc-50/40 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <span
          className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl text-sm font-semibold text-white shadow-sm"
          style={{ backgroundColor: previewColor }}
        >
          {previewLogo ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img loading="lazy" decoding="async"
              src={previewLogo}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            getInitials(workspaceName)
          )}
        </span>
        <div className="text-sm">
          <p className="font-medium text-zinc-900 dark:text-zinc-50">
            Preview
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            How your workspace badge appears in the sidebar.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="logoUrl">Logo</Label>
          <div className="flex gap-2">
            <Input
              id="logoUrl"
              placeholder="https://.../logo.png atau upload file"
              disabled={!canEdit}
              {...register("logoUrl")}
            />
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                void uploadImage("logoUrl", e.target.files?.[0]);
                e.currentTarget.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={uploadDisabled}
              onClick={() => logoInputRef.current?.click()}
            >
              {uploadingField === "logoUrl" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Upload />
              )}
              Upload
            </Button>
          </div>
          {errors.logoUrl && (
            <p className="text-xs text-red-600">{errors.logoUrl.message}</p>
          )}
          <p className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            <ImagePlus className="h-3.5 w-3.5" />
            PNG, JPG, WEBP, atau GIF maksimal 5 MB.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="faviconUrl">Favicon</Label>
          <div className="flex gap-2">
            <Input
              id="faviconUrl"
              placeholder="https://.../favicon.png atau upload file"
              disabled={!canEdit}
              {...register("faviconUrl")}
            />
            <input
              ref={faviconInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                void uploadImage("faviconUrl", e.target.files?.[0]);
                e.currentTarget.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={uploadDisabled}
              onClick={() => faviconInputRef.current?.click()}
            >
              {uploadingField === "faviconUrl" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Upload />
              )}
              Upload
            </Button>
          </div>
          {errors.faviconUrl && (
            <p className="text-xs text-red-600">{errors.faviconUrl.message}</p>
          )}
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Gunakan gambar persegi agar tampil rapi di browser.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="primaryColor">Primary color</Label>
          <div className="flex h-9 items-stretch overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <span
              className="block h-full w-9 border-r border-zinc-200 dark:border-zinc-800"
              style={{ backgroundColor: previewColor }}
            />
            <input
              id="primaryColor"
              disabled={!canEdit}
              className="flex-1 bg-transparent px-3 text-sm outline-none"
              placeholder="#18181b"
              {...register("primaryColor")}
            />
          </div>
          {errors.primaryColor && (
            <p className="text-xs text-red-600">
              {errors.primaryColor.message}
            </p>
          )}
        </div>

        <CustomDomainField
          workspaceId={workspaceId}
          value={watch("customDomain") ?? ""}
          onChange={(v) =>
            setValue("customDomain", v, { shouldDirty: true })
          }
          savedDomain={defaultValues.customDomain}
          error={errors.customDomain?.message}
          disabled={!canEdit}
          serverIp={serverIp}
          platformDomain={platformDomain}
          verificationToken={domainState.verificationToken}
          domainStatus={domainState.status}
          sslStatus={domainState.sslStatus}
        />
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
              <Loader2 className="animate-spin" /> Saving…
            </>
          ) : (
            "Save branding"
          )}
        </Button>
      </div>
    </form>
  );
}
