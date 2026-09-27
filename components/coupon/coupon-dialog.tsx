"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { Loader2, Sparkles } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import {
  createCouponAction,
  updateCouponAction,
} from "@/lib/actions/coupon";
import { cn, formatPrice } from "@/lib/utils";

export type CouponDialogValues = {
  code: string;
  type: "PERCENTAGE" | "FIXED";
  stackingMode: "ADDITIVE" | "OVERRIDE";
  value: string;
  maxUses: string;
  maxUsesPerCustomer: string;
  minimumPurchase: string;
  startsAt: string;
  expiresAt: string;
  firstOrderOnly: boolean;
  freeShipping: boolean;
  isActive: "true" | "false";
  customerId: string;
  productIds: string[];
  courseIds: string[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  couponId?: string;
  defaultValues: CouponDialogValues;
  customers?: { id: string; name: string; email: string }[];
  products?: { id: string; name: string; price: number }[];
  courses?: { id: string; title: string; price: number }[];
};

export function CouponDialog({
  open,
  onOpenChange,
  mode,
  couponId,
  defaultValues,
  customers = [],
  products = [],
  courses = [],
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [customerScope, setCustomerScope] = useState<"ALL" | "SPECIFIC">(
    defaultValues.customerId ? "SPECIFIC" : "ALL"
  );
  const [productScope, setProductScope] = useState<"ALL" | "SPECIFIC">(
    defaultValues.productIds.length ? "SPECIFIC" : "ALL"
  );

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CouponDialogValues>({ defaultValues });

  const typeValue = watch("type");
  const activeValue = watch("isActive");
  const selectedProducts = watch("productIds") ?? [];
  const selectedCourses = watch("courseIds") ?? [];
  const selectedCustomerId = watch("customerId");

  useEffect(() => {
    if (open) {
      reset(defaultValues);
      setCustomerScope(defaultValues.customerId ? "SPECIFIC" : "ALL");
      setProductScope(defaultValues.productIds.length ? "SPECIFIC" : "ALL");
      setServerError(null);
    }
  }, [open, defaultValues, reset]);

  function generateCode() {
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const prefix = typeValue === "PERCENTAGE" ? "SALE" : "HEMAT";
    setValue("code", `${prefix}${suffix}`, { shouldDirty: true });
  }

  function onSubmit(values: CouponDialogValues) {
    setServerError(null);
    const fd = new FormData();
    fd.set("code", values.code.toUpperCase());
    fd.set("type", values.type);
    fd.set("stackingMode", values.stackingMode);
    fd.set("value", values.value);
    fd.set("maxUses", values.maxUses);
    fd.set("maxUsesPerCustomer", values.maxUsesPerCustomer);
    fd.set("minimumPurchase", values.minimumPurchase);
    fd.set("startsAt", values.startsAt);
    fd.set("expiresAt", values.expiresAt);
    fd.set("firstOrderOnly", String(values.firstOrderOnly));
    fd.set("freeShipping", String(values.freeShipping));
    fd.set("isActive", values.isActive);
    fd.set("customerId", customerScope === "SPECIFIC" ? values.customerId : "");
    fd.set(
      "productIds",
      JSON.stringify(productScope === "SPECIFIC" ? values.productIds : [])
    );
    fd.set("courseIds", JSON.stringify(values.courseIds));

    startTransition(async () => {
      const res =
        mode === "create"
          ? await createCouponAction(fd)
          : await updateCouponAction(couponId!, fd);
      if (!res.ok) {
        setServerError(res.error);
        if (res.fieldErrors) {
          for (const [field, msgs] of Object.entries(res.fieldErrors)) {
            if (msgs?.[0]) {
              setError(field as keyof CouponDialogValues, { message: msgs[0] });
            }
          }
        }
        return;
      }
      toast.success(mode === "create" ? "Coupon created" : "Coupon saved");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "New coupon" : "Edit coupon"}
          </DialogTitle>
          <DialogDescription>
            Customers redeem the code at checkout.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="coupon-code">Code</Label>
            <div className="flex gap-2">
              <Input
                id="coupon-code"
                autoFocus
                autoComplete="off"
                placeholder="LAUNCH20"
                className="font-mono uppercase"
                {...register("code", { required: "Code is required" })}
                onChange={(e) => {
                  e.target.value = e.target.value.toUpperCase();
                }}
              />
              <Button type="button" variant="outline" onClick={generateCode}>
                <Sparkles className="h-4 w-4" />
                Generate
              </Button>
            </div>
            {errors.code && (
              <p className="text-xs text-red-600">{errors.code.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Type">
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                      <SelectItem value="FIXED">Fixed (Rp)</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field
              label={typeValue === "PERCENTAGE" ? "Value (%)" : "Value (Rp)"}
              error={errors.value?.message}
            >
              <div className="relative">
                <Input
                  type="number"
                  min={1}
                  className="pr-10"
                  {...register("value", { required: "Value is required" })}
                />
                <span className="pointer-events-none absolute right-3 top-2 text-sm text-zinc-400">
                  {typeValue === "PERCENTAGE" ? "%" : "Rp"}
                </span>
              </div>
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Minimum purchase"><Input type="number" min={0} {...register("minimumPurchase")} /></Field>
            <Field label="Max uses per customer"><Input type="number" min={1} placeholder="Unlimited" {...register("maxUsesPerCustomer")} /></Field>
            <Field label="Starts (optional)"><Input type="date" {...register("startsAt")} /></Field>
            <div className="space-y-2">
              <label className="flex h-9 items-center gap-2 rounded-md border border-zinc-200 px-3 text-sm"><input type="checkbox" {...register("firstOrderOnly")} /> First order only</label>
              <label className="flex h-9 items-center gap-2 rounded-md border border-zinc-200 px-3 text-sm"><input type="checkbox" {...register("freeShipping")} /> Free shipping</label>
            </div>
          </div>

          <Field label="Discount stacking">
            <Controller
              control={control}
              name="stackingMode"
              render={({ field }) => (
                <div className="grid grid-cols-2 gap-3">
                  <ChoiceButton
                    active={field.value === "ADDITIVE"}
                    title="Additive"
                    description="Added after product/event discounts."
                    onClick={() => field.onChange("ADDITIVE")}
                  />
                  <ChoiceButton
                    active={field.value === "OVERRIDE"}
                    title="Override"
                    description="Treat this code as the main discount."
                    onClick={() => field.onChange("OVERRIDE")}
                  />
                </div>
              )}
            />
          </Field>

          <Field label="Courses">
            <p className="text-xs text-zinc-500">Leave all unchecked to allow every course.</p>
            <Controller control={control} name="courseIds" render={({ field }) => <div className="mt-2 max-h-40 space-y-1 overflow-auto rounded-lg border border-zinc-200 p-2">{courses.length ? courses.map((course) => <label key={course.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-2 text-sm hover:bg-zinc-50"><span className="truncate">{course.title}</span><input type="checkbox" checked={field.value.includes(course.id)} onChange={(event) => field.onChange(event.target.checked ? [...field.value, course.id] : field.value.filter((id) => id !== course.id))} /></label>) : <p className="px-2 py-3 text-sm text-zinc-500">No courses yet.</p>}</div>} />
            {selectedCourses.length ? <p className="text-xs text-zinc-500">Restricted to {selectedCourses.length} course(s).</p> : null}
          </Field>

          <Field label="Customer">
            <div className="grid grid-cols-2 gap-3">
              <ChoiceButton
                active={customerScope === "ALL"}
                title="All customers"
                description="Anyone can redeem this code."
                onClick={() => {
                  setCustomerScope("ALL");
                  setValue("customerId", "", { shouldDirty: true });
                }}
              />
              <ChoiceButton
                active={customerScope === "SPECIFIC"}
                title="Specific customer"
                description="Restrict by checkout email."
                onClick={() => setCustomerScope("SPECIFIC")}
              />
            </div>
            {customerScope === "SPECIFIC" ? (
              <Controller
                control={control}
                name="customerId"
                render={({ field }) => (
                  <Select value={field.value || ""} onValueChange={field.onChange}>
                    <SelectTrigger className="mt-3">
                      <SelectValue placeholder="Choose customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.name} ({customer.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            ) : null}
            {customerScope === "SPECIFIC" && !selectedCustomerId ? (
              <p className="text-xs text-amber-600">
                Pick a customer before saving a customer-specific coupon.
              </p>
            ) : null}
          </Field>

          <Field label="Products">
            <div className="grid grid-cols-2 gap-3">
              <ChoiceButton
                active={productScope === "ALL"}
                title="All products"
                description="Coupon applies to every eligible cart item."
                onClick={() => {
                  setProductScope("ALL");
                  setValue("productIds", [], { shouldDirty: true });
                }}
              />
              <ChoiceButton
                active={productScope === "SPECIFIC"}
                title="Specific products"
                description="Discount only selected products."
                onClick={() => setProductScope("SPECIFIC")}
              />
            </div>
            {productScope === "SPECIFIC" ? (
              <Controller
                control={control}
                name="productIds"
                render={({ field }) => (
                  <div className="mt-3 max-h-44 space-y-2 overflow-auto rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
                    {products.length === 0 ? (
                      <p className="px-2 py-3 text-sm text-zinc-500">
                        No products yet.
                      </p>
                    ) : (
                      products.map((product) => (
                        <label
                          key={product.id}
                          className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-zinc-900 dark:text-zinc-50">
                              {product.name}
                            </span>
                            <span className="text-xs text-zinc-500">
                              {formatPrice(product.price)}
                            </span>
                          </span>
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={field.value.includes(product.id)}
                            onChange={(event) =>
                              field.onChange(
                                event.target.checked
                                  ? [...field.value, product.id]
                                  : field.value.filter((id) => id !== product.id)
                              )
                            }
                          />
                        </label>
                      ))
                    )}
                  </div>
                )}
              />
            ) : null}
            {productScope === "SPECIFIC" && selectedProducts.length === 0 ? (
              <p className="text-xs text-amber-600">
                Select at least one product, or switch back to all products.
              </p>
            ) : null}
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Max uses (optional)" error={errors.maxUses?.message}>
              <Input
                type="number"
                min={0}
                placeholder="Unlimited"
                {...register("maxUses")}
              />
            </Field>
            <Field label="Expires (optional)" error={errors.expiresAt?.message}>
              <Input type="date" {...register("expiresAt")} />
            </Field>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
            <div>
              <Label>Status</Label>
              <p className="text-xs text-zinc-500">
                {activeValue === "true"
                  ? "Active - coupon can be redeemed"
                  : "Inactive - coupon is hidden from checkout"}
              </p>
            </div>
            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <Switch
                  checked={field.value === "true"}
                  onCheckedChange={(checked) =>
                    field.onChange(checked ? "true" : "false")
                  }
                  aria-label="Coupon active status"
                />
              )}
            />
          </div>

          {serverError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {serverError}
            </div>
          )}

          <DialogFooter>
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
              {mode === "create" ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

function ChoiceButton({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-2 text-left transition",
        active
          ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900 dark:border-zinc-50 dark:bg-zinc-900 dark:ring-zinc-50"
          : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
      )}
    >
      <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-50">
        {title}
      </span>
      <span className="mt-1 block text-xs leading-4 text-zinc-500">
        {description}
      </span>
    </button>
  );
}
