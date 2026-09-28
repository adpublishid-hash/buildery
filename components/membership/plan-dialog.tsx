"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { Archive, Check, Clock3, CreditCard, Loader2, RefreshCcw } from "lucide-react";
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
  createMembershipPlanAction,
  updateMembershipPlanAction,
} from "@/lib/actions/membership";
import { slugify } from "@/lib/slug";
import { MEMBERSHIP_LEVEL_LABEL } from "@/lib/labels";
import { formatPrice } from "@/lib/utils";

export type PlanDialogValues = {
  name: string;
  slug: string;
  description: string;
  level: "FREE" | "BASIC" | "PREMIUM";
  price: string;
  accessDays: string;
  isActive: "true" | "false";
  productId: string;
  benefits: string;
  recommended: "true" | "false";
  ctaLabel: string;
  sortOrder: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  planId?: string;
  /** Archived plans can be edited but stay hidden until restored. */
  archived?: boolean;
  defaultValues: PlanDialogValues;
  products?: { id: string; name: string; price: number; type: string }[];
};

export function PlanDialog({
  open,
  onOpenChange,
  mode,
  planId,
  archived = false,
  defaultValues,
  products = [],
}: Props) {
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
    reset,
    setError,
    formState: { errors },
  } = useForm<PlanDialogValues>({ defaultValues });

  const name = watch("name");
  const slug = watch("slug");
  const level = watch("level");
  const price = watch("price");
  const accessDays = watch("accessDays");
  const isActive = watch("isActive");
  const productId = watch("productId");
  const benefits = watch("benefits");
  const recommended = watch("recommended");
  const ctaLabel = watch("ctaLabel");
  const description = watch("description");
  const benefitList = (benefits ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
  const selectedProduct = products.find((product) => product.id === productId);
  const priceNumber = Number(price || 0);
  const accessDaysNumber = Number(accessDays || 0);
  const durationText =
    accessDaysNumber === 0
      ? "Lifetime access"
      : `${accessDaysNumber} days`;

  useEffect(() => {
    if (open) {
      reset(defaultValues);
      setServerError(null);
      setSlugTouched(mode === "edit");
    }
  }, [open, defaultValues, reset, mode]);

  useEffect(() => {
    if (slugTouched) return;
    setValue("slug", slugify(name ?? ""));
  }, [name, slugTouched, setValue]);

  function onSubmit(values: PlanDialogValues) {
    setServerError(null);
    const fd = new FormData();
    fd.set("name", values.name);
    fd.set("slug", values.slug);
    fd.set("description", values.description);
    fd.set("level", values.level);
    fd.set("price", values.price || "0");
    fd.set("accessDays", values.accessDays || "0");
    fd.set("isActive", values.isActive);
    fd.set("productId", values.productId);
    fd.set("benefits", values.benefits);
    fd.set("recommended", values.recommended);
    fd.set("ctaLabel", values.ctaLabel);
    fd.set("sortOrder", values.sortOrder || "0");

    startTransition(async () => {
      const res =
        mode === "create"
          ? await createMembershipPlanAction(fd)
          : await updateMembershipPlanAction(planId!, fd);
      if (!res.ok) {
        setServerError(res.error);
        if (res.fieldErrors) {
          for (const [field, msgs] of Object.entries(res.fieldErrors)) {
            if (msgs?.[0]) {
              setError(field as keyof PlanDialogValues, { message: msgs[0] });
            }
          }
        }
        return;
      }
      toast.success(mode === "create" ? "Plan created" : "Plan saved");
      onOpenChange(false);
      router.refresh();
    });
  }

  function applyPreset(kind: "free" | "monthly" | "yearly" | "lifetime") {
    if (kind === "free") {
      setValue("price", "0", { shouldDirty: true });
      setValue("accessDays", "0", { shouldDirty: true });
      setValue("level", "FREE", { shouldDirty: true });
      return;
    }
    if (kind === "monthly") {
      setValue("accessDays", "30", { shouldDirty: true });
      setValue("level", "BASIC", { shouldDirty: true });
      if (!Number(price || 0)) setValue("price", "99000", { shouldDirty: true });
      return;
    }
    if (kind === "yearly") {
      setValue("accessDays", "365", { shouldDirty: true });
      setValue("level", "PREMIUM", { shouldDirty: true });
      if (!Number(price || 0)) setValue("price", "999000", { shouldDirty: true });
      return;
    }
    setValue("accessDays", "0", { shouldDirty: true });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-[880px] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b-[0.8px] border-kv-border px-[20px] py-[14px] pr-[48px] text-left">
          <DialogTitle>
            {mode === "create" ? "New plan" : "Edit plan"}
          </DialogTitle>
          <DialogDescription>
            A plan grants access to a membership level for a set period.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="kv-editor flex min-h-0 flex-1 flex-col">
          <div className="grid min-h-0 flex-1 gap-[16px] overflow-y-auto px-[20px] py-[16px] md:grid-cols-[minmax(0,1fr)_240px]">
            <div className="min-w-0 space-y-[16px]">
              <div className="flex flex-wrap items-center gap-[6px]">
                <span className="mr-[2px] text-[12px] text-kv-muted-fg">Presets:</span>
                <button
                  type="button"
                  onClick={() => applyPreset("free")}
                  className="h-[26px] rounded-[7px] border-[0.8px] border-kv-border bg-kv-card px-[10px] text-[12px] font-medium text-kv-secondary-fg transition-colors hover:bg-kv-hover hover:text-kv-fg"
                >
                  Free
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("monthly")}
                  className="h-[26px] rounded-[7px] border-[0.8px] border-kv-border bg-kv-card px-[10px] text-[12px] font-medium text-kv-secondary-fg transition-colors hover:bg-kv-hover hover:text-kv-fg"
                >
                  30-day pass
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("yearly")}
                  className="h-[26px] rounded-[7px] border-[0.8px] border-kv-border bg-kv-card px-[10px] text-[12px] font-medium text-kv-secondary-fg transition-colors hover:bg-kv-hover hover:text-kv-fg"
                >
                  365-day pass
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("lifetime")}
                  className="h-[26px] rounded-[7px] border-[0.8px] border-kv-border bg-kv-card px-[10px] text-[12px] font-medium text-kv-secondary-fg transition-colors hover:bg-kv-hover hover:text-kv-fg"
                >
                  Lifetime
                </button>
              </div>
              {archived ? (
                <div className="flex items-start gap-[8px] rounded-[8px] border-[0.8px] border-amber-200 bg-amber-50/70 px-[12px] py-[8px] text-[12px] text-amber-900">
                  <Archive className="mt-[1px] h-[14px] w-[14px] shrink-0" />
                  This plan is archived. Changes are saved, but it stays hidden from signup until you restore it.
                </div>
              ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="plan-name">Name</Label>
              <Input
                id="plan-name"
                autoFocus
                {...register("name", { required: "Name is required" })}
              />
              {errors.name && (
                <p className="text-xs text-kv-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-slug">Slug</Label>
              <div className="flex gap-2">
                <Input
                  id="plan-slug"
                  {...register("slug", {
                    required: "Slug is required",
                    onChange: () => setSlugTouched(true),
                  })}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    setValue("slug", slugify(name || "membership"), {
                      shouldDirty: true,
                    });
                    setSlugTouched(true);
                  }}
                  aria-label="Regenerate slug"
                >
                  <RefreshCcw className="h-4 w-4" />
                </Button>
              </div>
              {errors.slug && (
                <p className="text-xs text-kv-destructive">{errors.slug.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="plan-access-days">Access length (days)</Label>
            <Input
              id="plan-access-days"
              type="number"
              min={0}
              placeholder="0"
              {...register("accessDays")}
            />
            <p className="text-xs text-kv-muted-fg">
              0 = lifetime. Paid once, not a recurring charge. Members extend by buying again.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="plan-description">Description</Label>
            <Textarea
              id="plan-description"
              rows={2}
              {...register("description")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="plan-benefits">Benefits</Label>
            <Textarea
              id="plan-benefits"
              rows={4}
              placeholder={"Premium courses\nMember community\nPriority support"}
              {...register("benefits")}
            />
            <p className="text-xs text-kv-muted-fg">One benefit per line.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="plan-level">Level</Label>
              <Controller
                control={control}
                name="level"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="plan-level">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FREE">Free</SelectItem>
                      <SelectItem value="BASIC">Basic</SelectItem>
                      <SelectItem value="PREMIUM">Premium</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-price">Price (Rp)</Label>
              <Input
                id="plan-price"
                type="number"
                min={0}
                placeholder="0"
                {...register("price")}
              />
              {errors.price && (
                <p className="text-xs text-kv-destructive">{errors.price.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="plan-product">Linked product</Label>
            <Controller
              control={control}
              name="productId"
              render={({ field }) => (
                <Select
                  value={field.value || "NONE"}
                  onValueChange={(value) =>
                    field.onChange(value === "NONE" ? "" : value)
                  }
                >
                  <SelectTrigger id="plan-product">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">
                      No linked product
                    </SelectItem>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-xs text-kv-muted-fg">
              Customers get this plan automatically after buying the linked product.
            </p>
            {selectedProduct ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setValue("price", String(selectedProduct.price), {
                    shouldDirty: true,
                  })
                }
              >
                <CreditCard className="h-4 w-4" />
                Sync price from {selectedProduct.name}
              </Button>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="plan-active">Visibility</Label>
            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="plan-active">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true" disabled={archived}>Live on membership page</SelectItem>
                    <SelectItem value="false">Hidden</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plan-recommended">Highlight</Label>
            <Controller
              control={control}
              name="recommended"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="plan-recommended"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">Standard</SelectItem>
                    <SelectItem value="true">Recommended</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plan-cta">Button label</Label>
            <Input id="plan-cta" placeholder="Buy access" {...register("ctaLabel")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plan-order">Display order</Label>
            <Input id="plan-order" type="number" min={0} max={999} {...register("sortOrder")} />
          </div>
          </div>

          {serverError && (
            <div role="alert" className="rounded-[8px] border-[0.8px] border-red-200 bg-red-50/70 px-[12px] py-[8px] text-[12px] text-red-700">
              {serverError}
            </div>
          )}

            </div>
            <div className="md:sticky md:top-0 md:self-start">
          <div className="kv-frame p-[4px]">
            <p className="px-[8px] py-[6px] text-[12px] font-medium text-kv-secondary-fg">Public preview</p>
            <div
              className={
                recommended === "true"
                  ? "rounded-[10px] border-[0.8px] border-kv-fg bg-kv-card p-[14px]"
                  : "rounded-[10px] border-[0.8px] border-kv-input bg-kv-card p-[14px]"
              }
            >
              <div className="flex items-center justify-between gap-[6px]">
                <span className="text-[10px] font-medium uppercase tracking-wide text-kv-muted-fg">
                  {MEMBERSHIP_LEVEL_LABEL[level]}
                </span>
                {recommended === "true" ? (
                  <span className="rounded-full bg-kv-fg px-[6px] py-[2px] text-[10px] font-medium text-white">
                    Recommended
                  </span>
                ) : null}
              </div>
              <p className="mt-[6px] truncate text-[16px] font-semibold text-kv-fg">{name || "Untitled plan"}</p>
              {description ? (
                <p className="mt-[2px] line-clamp-2 text-[12px] text-kv-muted-fg">{description}</p>
              ) : null}
              <p className="mt-[10px] text-[18px] font-semibold text-kv-fg">
                {priceNumber > 0 ? formatPrice(priceNumber) : "Free"}
              </p>
              <p className="mt-[2px] inline-flex items-center gap-[5px] text-[12px] text-kv-muted-fg">
                <Clock3 className="h-[12px] w-[12px]" />
                {durationText}
              </p>
              {benefitList.length ? (
                <ul className="mt-[10px] space-y-[4px]">
                  {benefitList.map((item, index) => (
                    <li key={`${index}-${item}`} className="flex items-start gap-[6px] text-[12px] text-kv-secondary-fg">
                      <Check className="mt-[2px] h-[12px] w-[12px] shrink-0 text-kv-success" />
                      <span className="min-w-0 break-words">{item}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-[12px] flex h-[30px] items-center justify-center rounded-[8px] bg-kv-fg text-[12px] font-medium text-white">
                {ctaLabel?.trim() || (priceNumber > 0 ? "Buy access" : "Join free")}
              </div>
            </div>
            <p className="px-[8px] pb-[4px] pt-[8px] text-[11px] leading-[1.45] text-kv-muted-fg">
              {archived
                ? "Archived plans are hidden from signup."
                : isActive === "true"
                  ? `Live at /memberships#plan-${slug || "plan-slug"}`
                  : "Hidden plans stay off the public page."}
            </p>
          </div>
            </div>
          </div>

          <DialogFooter className="border-t-[0.8px] border-kv-border px-[20px] py-[12px]">
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
              {mode === "create" ? "Create plan" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
