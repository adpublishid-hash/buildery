"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import {
  ChevronDown,
  Download,
  ExternalLink,
  ImagePlus,
  Layers3,
  Plus,
  LockKeyhole,
  Loader2,
  Package,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EditorAlert, EditorHeader, EditorSection, EditorStatus } from "@/components/dashboard/editor-shell";
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
  createProductAction,
  updateProductAction,
} from "@/lib/actions/product";
import { slugify } from "@/lib/slug";
import { MEMBERSHIP_LEVEL_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { AiCopyButton } from "@/components/products/ai-copy-button";
import {
  DraftVariantOptionsPanel,
  VariantOptionsPanel,
  reconcileDraftVariantRows,
  type DraftVariantRow,
} from "@/components/products/variant-options-panel";
import type { VariantAxis } from "@/lib/product-variants";
import { ImageUpload } from "./image-upload";

type ProductType = "PHYSICAL" | "DIGITAL";

export type ProductFormValues = {
  name: string;
  slug: string;
  description: string;
  details: string;
  type: ProductType;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  pricingMode: "ONE_TIME" | "SUBSCRIPTION";
  price: string;
  costPrice: string;
  discountPrice: string;
  stock: string;
  sku: string;
  lowStockThreshold: string;
  category: string;
  imageId: string;
  galleryImageIds: string[];
  metaTitle: string;
  metaDescription: string;
  downloadUrl: string;
  downloadLabel: string;
  digitalAccessItems: { label?: string; url?: string }[];
  serviceLocation: string;
  serviceDurationMinutes: string;
  eventStartsAt: string;
  eventEndsAt: string;
  eventLocation: string;
  weightGrams: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
};

type GalleryImage = { id: string; url: string };
type LinkedMembershipPlan = {
  id: string;
  name: string;
  level: "FREE" | "BASIC" | "PREMIUM";
  accessDays: number;
  isActive: boolean;
};

type ProductVariantEditorRow = {
  id: string;
  name: string;
  sku: string | null;
  price: number | null;
  discountPrice: number | null;
  costPrice: number | null;
  stock: number;
  weightGrams: number | null;
  imageUrl: string | null;
  imageId: string | null;
  image?: { url: string } | null;
  lowStockThreshold: number | null;
  isActive: boolean;
  options: unknown;
};

type Props = {
  mode: "create" | "edit";
  productId?: string;
  defaultValues: ProductFormValues;
  defaultImageUrl: string | null;
  defaultGalleryImages?: GalleryImage[];
  linkedMembershipPlans?: LinkedMembershipPlan[];
  storefrontUrl?: string;
  showVariantManager?: boolean;
  variantAxes?: VariantAxis[];
  variants?: ProductVariantEditorRow[];
  /** False when the plan lacks the AI add-on or no API key is configured. */
  aiEnabled?: boolean;
};

const TYPE_OPTIONS: {
  value: ProductType;
  label: string;
  description: string;
  icon: typeof Package;
}[] = [
  {
    value: "PHYSICAL",
    label: "Physical",
    description: "Shipped item with inventory",
    icon: Package,
  },
  {
    value: "DIGITAL",
    label: "Digital",
    description: "Download or access link",
    icon: Download,
  },
];

export function ProductForm({
  mode,
  productId,
  defaultValues,
  defaultImageUrl,
  defaultGalleryImages = [],
  linkedMembershipPlans = [],
  storefrontUrl,
  showVariantManager = false,
  variantAxes = [],
  variants = [],
  aiEnabled = false,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [previewUrl, setPreviewUrl] = useState<string | null>(defaultImageUrl);
  const [galleryImages, setGalleryImages] =
    useState<GalleryImage[]>(defaultGalleryImages);
  const [draftVariantAxes, setDraftVariantAxes] = useState<VariantAxis[]>([]);
  const [draftVariants, setDraftVariants] = useState<DraftVariantRow[]>([]);

  const {
    register,
    handleSubmit,
    control,
    watch,
    getValues,
    setValue,
    setError,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProductFormValues>({ defaultValues });

  const {
    fields: digitalAccessFields,
    append: appendDigitalAccess,
    remove: removeDigitalAccess,
  } = useFieldArray({ control, name: "digitalAccessItems" });

  const nameValue = watch("name");
  const typeValue = watch("type");
  const statusValue = watch("status");
  const pricingModeValue = watch("pricingMode");
  const metaTitle = watch("metaTitle");
  const metaDescription = watch("metaDescription");

  const seoScore = useMemo(() => {
    let score = 0;
    if (metaTitle?.trim()) score += 50;
    if (metaDescription?.trim()) score += 50;
    return score;
  }, [metaTitle, metaDescription]);

  useEffect(() => {
    if (slugTouched) return;
    setValue("slug", slugify(nameValue ?? ""));
  }, [nameValue, slugTouched, setValue]);

  function setGallery(next: GalleryImage[]) {
    setGalleryImages(next);
    setValue(
      "galleryImageIds",
      next.map((image) => image.id),
      { shouldDirty: true }
    );
  }

  function onSubmit(values: ProductFormValues) {
    setServerError(null);
    const fd = new FormData();
    for (const [key, value] of Object.entries(values)) {
      if (key === "galleryImageIds" || key === "digitalAccessItems") {
        fd.set(key, JSON.stringify(value));
      } else {
        fd.set(key, String(value ?? ""));
      }
    }
    if (mode === "create") {
      fd.set("variantOptions", JSON.stringify(draftVariantAxes));
      fd.set("variantDetails", JSON.stringify(draftVariants));
    }

    startTransition(async () => {
      const res = mode === "create"
        ? await createProductAction(fd)
        : await updateProductAction(productId!, fd);

      if (!res.ok) {
        setServerError(res.error);
        if (res.fieldErrors) {
          for (const [field, msgs] of Object.entries(res.fieldErrors)) {
            if (msgs?.[0]) {
              setError(field as keyof ProductFormValues, {
                message: msgs[0],
              });
            }
          }
        }
        return;
      }

      toast.success(mode === "create" ? "Product created" : "Product saved");
      reset(values);
      if (
        mode === "create" &&
        res.data &&
        typeof res.data === "object" &&
        "productId" in res.data
      ) {
        router.push(`/dashboard/products/${res.data.productId}/edit#variants`);
      }
      router.refresh();
    });
  }

  const statusTone = statusValue === "ACTIVE" ? "live" : statusValue === "ARCHIVED" ? "archived" : "draft";

  return (
    <div className="flex flex-col gap-[12px]">
      <EditorHeader
        backHref="/dashboard/products"
        backLabel="Kembali ke produk"
        eyebrow={mode === "create" ? "Produk baru" : "Edit produk"}
        title={nameValue?.trim() || "Produk tanpa nama"}
        status={
          <EditorStatus tone={statusTone}>
            {statusValue === "ACTIVE" ? "Aktif" : statusValue === "ARCHIVED" ? "Arsip" : "Draft"}
          </EditorStatus>
        }
        meta={isDirty ? "Ada perubahan belum disimpan" : mode === "edit" ? "Semua perubahan tersimpan" : "Isi detail, harga, dan stok produk"}
        actions={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => router.push("/dashboard/products")} disabled={pending}>
              Batal
            </Button>
            <Button type="submit" size="sm" form="product-details-form" disabled={pending || (mode === "edit" && !isDirty)}>
              {pending ? (
                <>
                  <Loader2 className="animate-spin" />
                  {mode === "create" ? "Membuat…" : "Menyimpan…"}
                </>
              ) : mode === "create" ? (
                "Buat produk"
              ) : (
                "Simpan perubahan"
              )}
            </Button>
          </>
        }
      />
      {serverError ? <EditorAlert>{serverError}</EditorAlert> : null}
      <form
        id="product-details-form"
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-[12px]"
      >
      <div className="kv-editor grid min-w-0 grid-cols-1 gap-[12px] xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-[12px]">
          <EditorSection title="Product information" description="Name, permalink, and short checkout description.">
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="name">Product name</Label>
                <Input
                  id="name"
                  placeholder="Paket 1 Bulan"
                  {...register("name", { required: "Name is required" })}
                />
                {errors.name && (
                  <p className="text-xs text-kv-destructive">{errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">Product URL</Label>
                <div className="kv-field flex h-[32px] items-stretch overflow-hidden rounded-[8px] border-[0.8px] border-kv-border bg-kv-card transition-[border-color,box-shadow] duration-150 hover:border-[#d1d5db] focus-within:border-[#9ca3af] focus-within:shadow-[0_0_0_3px_rgba(156,163,175,0.18)]">
                  <span className="flex items-center border-r-[0.8px] border-kv-border bg-kv-secondary px-[10px] text-[12px] text-kv-muted-fg">
                    /products/
                  </span>
                  <input
                    id="slug"
                    className="min-w-0 flex-1 bg-transparent px-[10px] text-[13px] text-kv-fg outline-none placeholder:text-kv-muted-fg"
                    {...register("slug", {
                      required: "Slug is required",
                      onChange: () => setSlugTouched(true),
                    })}
                  />
                </div>
                {errors.slug && (
                  <p className="text-xs text-kv-destructive">{errors.slug.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="description">Description</Label>
                  {aiEnabled ? (
                    <AiCopyButton
                      getContext={() => ({
                        name: getValues("name"),
                        // Whatever is already written becomes the brief.
                        hint: [getValues("description"), getValues("details")]
                          .filter(Boolean)
                          .join("\n\n"),
                        type: getValues("type"),
                        price: getValues("price"),
                      })}
                      onCopy={(copy) => {
                        setValue("description", copy.description, {
                          shouldDirty: true,
                        });
                        setValue("details", copy.details, { shouldDirty: true });
                        setValue("metaTitle", copy.metaTitle, {
                          shouldDirty: true,
                        });
                        setValue("metaDescription", copy.metaDescription, {
                          shouldDirty: true,
                        });
                      }}
                    />
                  ) : null}
                </div>
                <Textarea
                  id="description"
                  rows={5}
                  placeholder="Short description shown on the product page."
                  {...register("description")}
                />
              </div>
            </div>
          </EditorSection>

          <CollapsibleCard
            icon={Search}
            title="SEO settings"
            description={`${seoScore}% complete`}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="SEO title" error={errors.metaTitle?.message}>
                <Input
                  placeholder={nameValue || "Search result title"}
                  {...register("metaTitle")}
                />
              </Field>
              <Field
                label="Meta description"
                error={errors.metaDescription?.message}
              >
                <Input
                  placeholder="Short search result summary"
                  {...register("metaDescription")}
                />
              </Field>
            </div>
          </CollapsibleCard>

          <EditorSection title="Detailed product information" description="Longer copy, specifications, or delivery notes.">
            <Textarea
              rows={9}
              placeholder="Add detailed product information here."
              {...register("details")}
            />
          </EditorSection>

          <EditorSection title="Product type" description="Controls inventory, delivery, and extra settings below.">
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {TYPE_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      const active = field.value === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => field.onChange(option.value)}
                          className={cn(
                            "flex min-h-24 flex-col items-center justify-center rounded-lg border px-3 py-4 text-center transition",
                            active
                              ? "border-zinc-950 bg-kv-secondary text-kv-fg ring-1 ring-zinc-950 dark:border-zinc-50 dark:bg-zinc-900 dark:text-zinc-50 dark:ring-zinc-50"
                              : "border-kv-border text-kv-secondary-fg hover:border-zinc-300 hover:bg-kv-hover dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
                          )}
                        >
                          <Icon className="mb-2 h-5 w-5" />
                          <span className="text-sm font-medium">
                            {option.label}
                          </span>
                          <span className="mt-1 text-xs text-kv-muted-fg">
                            {option.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              />
            
          </EditorSection>

          <EditorSection title="Pricing" description="Configure one-time or recurring pricing.">
            <div className="space-y-5">
              <Controller
                control={control}
                name="pricingMode"
                render={({ field }) => (
                  <div className="grid grid-cols-2 rounded-lg border border-kv-border p-1 dark:border-zinc-800">
                    {[
                      ["ONE_TIME", "One time"],
                      ["SUBSCRIPTION", "Subscription"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => field.onChange(value)}
                        className={cn(
                          "rounded-md px-3 py-2 text-sm font-medium transition",
                          field.value === value
                            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                            : "text-kv-muted-fg hover:text-kv-fg dark:hover:text-zinc-100"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              />

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                <Field label="Price" error={errors.price?.message}>
                  <Input
                    type="number"
                    min={0}
                    placeholder="150000"
                    {...register("price", { required: "Price is required" })}
                  />
                </Field>
                <Field
                  label={
                    pricingModeValue === "SUBSCRIPTION"
                      ? "Intro price"
                      : "Discount price"
                  }
                  error={errors.discountPrice?.message}
                >
                  <Input
                    type="number"
                    min={0}
                    placeholder="Optional"
                    {...register("discountPrice")}
                  />
                </Field>
                <Field label="Cost / HPP" error={errors.costPrice?.message}>
                  <Input type="number" min={0} placeholder="Optional" {...register("costPrice")} />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Field label="SKU">
                  <Input placeholder="SKU-001" {...register("sku")} />
                </Field>
                <Field label="Stock">
                  <Input
                    type="number"
                    min={0}
                    disabled={typeValue !== "PHYSICAL"}
                    placeholder={typeValue === "PHYSICAL" ? "0" : "Unlimited"}
                    {...register("stock", { required: "Stock is required" })}
                  />
                </Field>
              </div>
            </div>
          </EditorSection>

          {typeValue === "DIGITAL" ? (
            <EditorSection
              title="Digital access settings"
              description="Add files, private links, communities, or course access customers receive after purchase."
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    appendDigitalAccess({
                      label: digitalAccessFields.length
                        ? `Access ${digitalAccessFields.length + 1}`
                        : "Download file",
                      url: "",
                    })
                  }
                >
                  <Plus className="h-4 w-4" />
                  Add access
                </Button>
              }
            >
              <div className="space-y-4">
                {digitalAccessFields.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-kv-border p-4 text-sm text-kv-muted-fg dark:border-zinc-700">
                    Belum ada akses digital. Tambahkan link download, invite
                    community, file, atau halaman akses pelanggan.
                  </div>
                ) : null}
                {digitalAccessFields.map((field, index) => (
                  <div
                    key={field.id}
                    className="rounded-xl border border-kv-border p-3 dark:border-zinc-800"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-kv-fg dark:text-zinc-50">
                        Digital access {index + 1}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeDigitalAccess(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Remove
                      </Button>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
                      <Field label="Button label">
                        <Input
                          placeholder="Download file"
                          {...register(`digitalAccessItems.${index}.label`)}
                        />
                      </Field>
                      <Field
                        label="Access URL"
                        error={errors.digitalAccessItems?.[index]?.url?.message}
                      >
                        <Input
                          placeholder="https://example.com/file.zip"
                          {...register(`digitalAccessItems.${index}.url`)}
                        />
                      </Field>
                    </div>
                  </div>
                ))}
                <p className="text-[12px] leading-[1.5] text-kv-muted-fg">
                  Field lama download URL tetap diisi otomatis dari akses
                  pertama supaya checkout lama tetap kompatibel.
                </p>
              </div>
            </EditorSection>
          ) : null}

          {typeValue === "PHYSICAL" ? (
            <EditorSection title="Shipping" description="Optional shipping dimensions for fulfillment.">
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-4">
                  <Field label="Weight (g)">
                    <Input type="number" min={0} {...register("weightGrams")} />
                  </Field>
                  <Field label="Length (cm)">
                    <Input type="number" min={0} {...register("lengthCm")} />
                  </Field>
                  <Field label="Width (cm)">
                    <Input type="number" min={0} {...register("widthCm")} />
                  </Field>
                  <Field label="Height (cm)">
                    <Input type="number" min={0} {...register("heightCm")} />
                  </Field>
                </div>
                <Field label="Low stock alert">
                  <Input
                    type="number"
                    min={0}
                    placeholder="Optional"
                    {...register("lowStockThreshold")}
                  />
                </Field>
              </div>
            </EditorSection>
          ) : null}

        </div>

        <aside className="flex min-w-0 flex-col gap-[12px] xl:sticky xl:top-[84px] xl:max-h-[calc(100dvh-100px)] xl:self-start xl:overflow-y-auto">
          <EditorSection title="Publishing" description="Status and storefront visibility.">
            <div className="space-y-5">
              <Field label="Status">
                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DRAFT">Draft</SelectItem>
                        <SelectItem value="ACTIVE">Public</SelectItem>
                        <SelectItem value="ARCHIVED">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>

              <div className="rounded-lg border border-kv-border p-3 text-xs text-kv-muted-fg dark:border-zinc-800">
                <div className="mb-2 flex items-center justify-between">
                  <span>Availability</span>
                  <Badge variant={statusValue === "ACTIVE" ? "success" : "secondary"}>
                    {statusValue === "ACTIVE" ? "Visible" : "Hidden"}
                  </Badge>
                </div>
                <p>
                  Public products can be added to cart. Draft and archived products stay hidden.
                </p>
              </div>

              {storefrontUrl ? (
                <Button asChild variant="outline" className="w-full">
                  <Link href={storefrontUrl} target="_blank">
                    View on storefront
                  </Link>
                </Button>
              ) : null}
              {showVariantManager ? (
                <Button asChild variant="outline" className="w-full">
                  <a href="#variants">
                    <Layers3 className="h-4 w-4" />
                    Manage variants
                  </a>
                </Button>
              ) : null}
            </div>
          </EditorSection>

          <EditorSection title="Category" description="Type a category to create or reuse it.">
              <Input placeholder="e.g. Skincare" {...register("category")} />
            
          </EditorSection>

          <EditorSection title={<><LockKeyhole className="h-4 w-4" />
                Membership access</>} description="Buying this product can automatically unlock linked membership
                plans after payment.">
            <div className="space-y-3">
              {linkedMembershipPlans.length > 0 ? (
                linkedMembershipPlans.map((plan) => (
                  <div
                    key={plan.id}
                    className="rounded-lg border border-kv-border p-3 dark:border-zinc-800"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-kv-fg dark:text-zinc-50">
                          {plan.name}
                        </p>
                        <p className="mt-1 text-xs text-kv-muted-fg">
                          {MEMBERSHIP_LEVEL_LABEL[plan.level]} ·{" "}
                          {plan.accessDays === 0
                            ? "Lifetime"
                            : `${plan.accessDays} days`}
                        </p>
                      </div>
                      <Badge variant={plan.isActive ? "success" : "outline"}>
                        {plan.isActive ? "Active" : "Hidden"}
                      </Badge>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-kv-border p-4 text-sm text-kv-muted-fg dark:border-zinc-700">
                  No membership plan is linked to this product yet.
                </div>
              )}
              <Button asChild variant="outline" className="w-full">
                <Link href="/dashboard/membership/plans">
                  <ExternalLink className="h-4 w-4" />
                  Manage linked plans
                </Link>
              </Button>
              <p className="text-xs leading-5 text-kv-muted-fg">
                Link a plan from Membership → Plans → Linked product. When this
                product order is paid, the customer membership is created or
                renewed automatically.
              </p>
            </div>
          </EditorSection>

          <EditorSection title="Featured image">
              <ImageUpload
                previewUrl={previewUrl}
                disabled={pending}
                onUploaded={(file) => {
                  setValue("imageId", file.id, { shouldDirty: true });
                  setPreviewUrl(file.url);
                }}
                onRemove={() => {
                  setValue("imageId", "", { shouldDirty: true });
                  setPreviewUrl(null);
                }}
              />
            
          </EditorSection>

          <EditorSection title="Gallery" description="Add supporting product images.">
            <div className="space-y-4">
              {galleryImages.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {galleryImages.map((image) => (
                    <div
                      key={image.id}
                      className="relative overflow-hidden rounded-lg border border-kv-border dark:border-zinc-800"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        loading="lazy"
                        decoding="async"
                        src={image.url}
                        alt=""
                        className="aspect-square w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setGallery(galleryImages.filter((item) => item.id !== image.id))
                        }
                        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-zinc-900/80 text-white transition hover:bg-zinc-900"
                        aria-label="Remove gallery image"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed border-kv-border text-center text-kv-muted-fg dark:border-zinc-700">
                  <ImagePlus className="mb-2 h-5 w-5" />
                  <p className="text-xs">Upload images for the product gallery.</p>
                </div>
              )}
              <ImageUpload
                previewUrl={null}
                disabled={pending}
                onUploaded={(file) => setGallery([...galleryImages, file])}
                onRemove={() => undefined}
              />
            </div>
          </EditorSection>
        </aside>
      </div>
      </form>

      {mode === "create" ? (
        <DraftVariantOptionsPanel
          axes={draftVariantAxes}
          onChange={(nextAxes) => {
            setDraftVariantAxes(nextAxes);
            setDraftVariants((current) =>
              reconcileDraftVariantRows(nextAxes, current)
            );
          }}
          variants={draftVariants}
          onVariantsChange={setDraftVariants}
          tracksInventory={typeValue === "PHYSICAL"}
        />
      ) : showVariantManager && productId ? (
        <div id="variants" className="scroll-mt-6 space-y-6">
          <VariantOptionsPanel
            productId={productId}
            axes={variantAxes}
            variants={variants}
            tracksInventory={typeValue === "PHYSICAL"}
          />
        </div>
      ) : null}

    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-kv-destructive">{error}</p> : null}
    </div>
  );
}

function CollapsibleCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Search;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="kv-frame flex min-w-0 flex-col p-[4px]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="group flex w-full items-center justify-between gap-[12px] rounded-[10px] border-[0.8px] border-kv-input bg-kv-card px-[14px] py-[12px] text-left transition-colors hover:bg-kv-hover"
      >
        <span className="flex min-w-0 items-center gap-[10px]">
          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] border-[0.8px] border-kv-border bg-kv-secondary text-kv-secondary-fg">
            <Icon className="h-[15px] w-[15px]" strokeWidth={1.6} />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-kv-fg">{title}</span>
            <span className="block truncate text-[12px] text-kv-muted-fg">{description}</span>
          </span>
        </span>
        <ChevronDown className={`h-[16px] w-[16px] shrink-0 text-kv-subtle transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="mt-[4px] animate-kv-fade rounded-[10px] border-[0.8px] border-kv-input bg-kv-card p-[14px] sm:p-[16px]">{children}</div>
      ) : null}
    </section>
  );
}
