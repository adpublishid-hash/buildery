import { z } from "zod";

/**
 * A checkbox or switch as it arrives from a form.
 *
 * Zod's `coerce.boolean` is `Boolean(value)`, so the string "false" — which every
 * form sending `String(someBoolean)` produces — coerced to **true**. Turning a
 * toggle off could not be saved, and on the integrations form it made "Save
 * integrations" fail outright ("Required when Mailketing is enabled") for a
 * workspace that had nothing enabled.
 *
 * Missing means false: an unchecked native checkbox is simply not submitted.
 */
const formBoolean = () =>
  z
    .union([z.boolean(), z.string()])
    .transform((value) =>
      typeof value === "string"
        ? ["true", "on", "1", "yes"].includes(value.trim().toLowerCase())
        : value
    )
    .default(false);

// ----- Auth -----

export const loginSchema = z.object({
  email: z.string().email("Alamat email tidak valid"),
  password: z.string().min(1, "Password wajib diisi"),
});

export const registerSchema = z.object({
  name: z
    .string()
    .min(2, "Nama minimal 2 karakter")
    .max(60, "Nama terlalu panjang"),
  email: z.string().email("Alamat email tidak valid"),
  phone: z
    .string()
    .trim()
    .min(8, "Nomor HP minimal 8 digit")
    .max(20, "Nomor HP terlalu panjang")
    .regex(/^\+?[0-9\s-]+$/, "Gunakan angka, spasi, strip, atau awalan +"),
  password: z
    .string()
    .min(8, "Password minimal 8 karakter")
    .max(100, "Password terlalu panjang"),
  confirmPassword: z.string().min(1, "Ulangi password"),
}).refine((v) => v.password === v.confirmPassword, {
  message: "Password tidak sama",
  path: ["confirmPassword"],
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

export const memberLoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const memberRegisterSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters").max(80),
    email: z.string().email("Invalid email address"),
    phone: z
      .string()
      .trim()
      .max(30, "Phone is too long")
      .optional()
      .or(z.literal("")),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(100, "Password is too long"),
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type MemberLoginInput = z.infer<typeof memberLoginSchema>;
export type MemberRegisterInput = z.infer<typeof memberRegisterSchema>;

// ----- Workspace -----

const slugRegex = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const hexColor = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const absoluteOrUploadedImageUrl = z
  .string()
  .max(500)
  .refine(
    (value) => {
      if (!value) return true;
      if (value.startsWith("/uploads/")) return true;
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Must be a valid URL or uploaded image" }
  );

export const workspaceSlugSchema = z
  .string()
  .min(3, "Slug minimal 3 karakter")
  .max(40, "Slug terlalu panjang")
  .regex(
    slugRegex,
    "Gunakan huruf kecil, angka, dan tanda hubung tanpa awalan/akhiran tanda hubung"
  );

export const createWorkspaceSchema = z.object({
  name: z
    .string()
    .min(2, "Nama minimal 2 karakter")
    .max(60, "Nama terlalu panjang"),
  slug: workspaceSlugSchema,
});

export const updateWorkspaceGeneralSchema = z.object({
  name: z
    .string()
    .min(2, "Nama minimal 2 karakter")
    .max(60, "Nama terlalu panjang"),
  slug: workspaceSlugSchema,
  language: z.enum(["ID", "EN"]).default("ID"),
  locale: z.enum(["id-ID", "en-US", "en-GB"]).default("id-ID"),
  timezone: z.enum(["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura", "UTC"]).default("Asia/Jakarta"),
  currencyCode: z.string().regex(/^[A-Z]{3}$/, "Gunakan kode mata uang 3 huruf"),
  dateFormat: z.enum(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]),
});

export const updateBrandingSchema = z.object({
  logoUrl: z.union([absoluteOrUploadedImageUrl, z.literal("")]).optional(),
  faviconUrl: z.union([absoluteOrUploadedImageUrl, z.literal("")]).optional(),
  primaryColor: z.string().regex(hexColor, "Use a hex color like #18181b"),
  customDomain: z
    .string()
    .max(253)
    .regex(
      /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i,
      "Enter a valid domain like store.example.com"
    )
    .or(z.literal(""))
    .optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["ADMIN", "EDITOR", "VIEWER"]),
});

export const updateMemberRoleSchema = z.object({
  memberId: z.string().min(1),
  role: z.enum(["ADMIN", "EDITOR", "VIEWER"]),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type UpdateWorkspaceGeneralInput = z.infer<
  typeof updateWorkspaceGeneralSchema
>;
export type UpdateBrandingInput = z.infer<typeof updateBrandingSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

// ----- Website & Page (Part 3) -----

export const pageSlugSchema = z
  .string()
  .min(1, "Slug is required")
  .max(60, "Slug is too long")
  .regex(
    slugRegex,
    "Use lowercase letters, numbers, and hyphens (no leading/trailing hyphen)"
  );

export const updateWebsiteSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(80, "Name is too long"),
  description: z.string().max(280, "Description is too long").optional(),
});

export const createPageSchema = z.object({
  title: z
    .string()
    .min(2, "Title must be at least 2 characters")
    .max(120, "Title is too long"),
  slug: pageSlugSchema,
});

export const updatePageSettingsSchema = z.object({
  title: z
    .string()
    .min(2, "Title must be at least 2 characters")
    .max(120, "Title is too long"),
  slug: pageSlugSchema,
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
  seoTitle: z.string().max(70, "Keep SEO title under 70 characters").optional(),
  metaDescription: z
    .string()
    .max(180, "Keep meta description under 180 characters")
    .optional(),
  ogImage: z
    .union([absoluteOrUploadedImageUrl, z.literal("")])
    .optional(),
  canonicalUrl: z
    .string()
    .trim()
    .max(500)
    .refine((value) => !value || /^https?:\/\//i.test(value), {
      message: "Canonical URL must start with http:// or https://",
    })
    .optional()
    .or(z.literal("")),
  noindex: formBoolean(),
});

export type UpdateWebsiteInput = z.infer<typeof updateWebsiteSchema>;
export type CreatePageInput = z.infer<typeof createPageSchema>;
export type UpdatePageSettingsInput = z.infer<typeof updatePageSettingsSchema>;

// ----- Store / products (Part 5) -----

const moneyInt = z.coerce
  .number({ invalid_type_error: "Enter a number" })
  .int("Whole numbers only")
  .min(0, "Cannot be negative")
  .max(1_000_000_000, "That's too large");

const optionalInt = z
  .union([z.coerce.number().int().min(0).max(1_000_000), z.literal("")])
  .optional()
  .transform((value) => (value === "" || value == null ? undefined : value));

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .optional()
  .or(z.literal(""))
  .refine((value) => !value || /^https?:\/\//i.test(value), {
    message: "URL must start with http:// or https://",
  });

const digitalAccessItemSchema = z
  .object({
    label: z.string().trim().max(80, "Button label is too long").optional(),
    url: optionalUrl,
  })
  .superRefine((value, ctx) => {
    if (value.label?.trim() && !value.url?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["url"],
        message: "Add a URL for this digital access.",
      });
    }
  });

const optionalDateTime = z
  .string()
  .optional()
  .or(z.literal(""))
  .transform((value) => (value ? new Date(value) : undefined))
  .refine((value) => !value || !Number.isNaN(value.getTime()), {
    message: "Enter a valid date and time",
  });

export const productSchema = z
  .object({
    name: z
      .string()
      .min(2, "Name must be at least 2 characters")
      .max(120, "Name is too long"),
    slug: z
      .string()
      .min(1, "Slug is required")
      .max(80)
      .regex(
        slugRegex,
        "Use lowercase letters, numbers, and hyphens"
      ),
    description: z.string().max(4000).optional(),
    details: z.string().max(12000).optional(),
    type: z.enum(["PHYSICAL", "DIGITAL"]),
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
    pricingMode: z.enum(["ONE_TIME", "SUBSCRIPTION"]),
    price: moneyInt,
    costPrice: moneyInt.optional().or(z.literal("").transform(() => undefined)),
    discountPrice: moneyInt.optional().or(z.literal("").transform(() => undefined)),
    stock: z.coerce.number().int().min(0).max(1_000_000),
    sku: z.string().max(80).optional(),
    lowStockThreshold: optionalInt,
    category: z.string().max(60).optional(),
    imageId: z.string().optional().or(z.literal("")),
    galleryImageIds: z.array(z.string()).default([]),
    metaTitle: z.string().max(70, "Keep SEO title under 70 characters").optional(),
    metaDescription: z
      .string()
      .max(180, "Keep meta description under 180 characters")
      .optional(),
    downloadUrl: optionalUrl,
    downloadLabel: z.string().max(80).optional(),
    digitalAccessItems: z
      .array(digitalAccessItemSchema)
      .max(20, "Add at most 20 digital access links")
      .default([]),
    serviceLocation: z.string().max(160).optional(),
    serviceDurationMinutes: optionalInt,
    eventStartsAt: optionalDateTime,
    eventEndsAt: optionalDateTime,
    eventLocation: z.string().max(160).optional(),
    weightGrams: optionalInt,
    lengthCm: optionalInt,
    widthCm: optionalInt,
    heightCm: optionalInt,
  })
  .refine(
    (v) =>
      v.discountPrice == null ||
      v.discountPrice === undefined ||
      v.discountPrice < v.price,
    { message: "Discount price must be lower than the normal price", path: ["discountPrice"] }
  )
  .refine(
    (v) => !v.eventEndsAt || !v.eventStartsAt || v.eventEndsAt >= v.eventStartsAt,
    { message: "End time must be after the start time", path: ["eventEndsAt"] }
  );

export const checkoutSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(80, "Name is too long"),
  email: z.string().email("Invalid email address"),
  phone: z.string().max(30).optional(),
  note: z.string().max(500).optional(),
});

export type ProductInput = z.infer<typeof productSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;

// ----- Courses / LMS (Part 6) -----

export const courseSchema = z
  .object({
    title: z.string().min(2, "Title must be at least 2 characters").max(120),
    slug: z
      .string()
      .min(1, "Slug is required")
      .max(80)
      .regex(slugRegex, "Use lowercase letters, numbers, and hyphens"),
    summary: z.string().max(280).optional(),
    description: z.string().max(8000).optional(),
    status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
    isFree: formBoolean(),
    price: moneyInt,
    requiredLevel: z.enum(["FREE", "BASIC", "PREMIUM"]).default("FREE"),
    imageId: z.string().optional().or(z.literal("")),
  })
  .refine((v) => v.isFree || v.price > 0, {
    message: "Paid courses need a price greater than zero",
    path: ["price"],
  });

export const moduleSchema = z.object({
  title: z.string().min(1, "Title is required").max(120),
});

export const lessonSchema = z
  .object({
    title: z.string().min(1, "Title is required").max(120),
    type: z.enum(["TEXT", "VIDEO_EMBED", "PDF", "LINK"]),
    body: z.string().max(100_000).optional(),
    url: z.string().max(500).optional(),
    label: z.string().max(100).optional(),
    assetId: z.string().max(100).optional(),
    attachmentLabel: z.string().max(120).optional(),
    transcript: z.string().max(100_000).optional(),
    durationMinutes: z.coerce.number().int().min(0).max(100_000).default(0),
    prerequisiteLessonId: z.string().max(100).optional(),
    isPreview: formBoolean(),
    dripEnabled: formBoolean(),
    dripDays: z
      .union([z.coerce.number().int().min(0).max(3650), z.literal("")])
      .optional()
      .transform((value) => (value === "" || value == null ? undefined : value)),
  })
  .superRefine((v, ctx) => {
    if (v.dripEnabled && v.dripDays == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dripDays"],
        message: "Enter the number of days before this lesson unlocks.",
      });
    }
    if (v.type === "TEXT") {
      if (!v.body || v.body.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["body"],
          message: "Body is required for text lessons.",
        });
      }
      return;
    }
    if (v.type !== "LINK" && v.assetId) return;
    if (!v.url || v.url.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["url"],
        message: "URL is required.",
      });
    } else if (!/^https?:\/\//i.test(v.url)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["url"],
        message: "URL must start with http:// or https://",
      });
    }
    if (v.type === "LINK" && (!v.label || v.label.trim().length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["label"],
        message: "Button label is required.",
      });
    }
  });

export const enrollmentSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(80),
  email: z.string().email("Invalid email address"),
});

export type CourseInput = z.infer<typeof courseSchema>;
export type ModuleInput = z.infer<typeof moduleSchema>;
export type LessonInput = z.infer<typeof lessonSchema>;
export type EnrollmentInput = z.infer<typeof enrollmentSchema>;

// ----- Blog (Part 7) -----

export const blogPostSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters").max(180),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(120)
    .regex(slugRegex, "Use lowercase letters, numbers, and hyphens"),
  excerpt: z.string().max(280).optional(),
  body: z.string().max(200_000),
  status: z.enum(["DRAFT", "SCHEDULED", "PUBLISHED", "ARCHIVED"]),
  category: z.string().max(60).optional(),
  tags: z.string().max(400).optional(), // comma-separated
  seoTitle: z.string().max(160).optional(),
  metaDescription: z.string().max(300).optional(),
  canonicalUrl: z
    .string()
    .max(500)
    .optional()
    .or(z.literal(""))
    .refine((value) => !value || /^https?:\/\//i.test(value), {
      message: "Canonical URL must start with http:// or https://",
    }),
  noindex: z.enum(["true", "false"]).transform((value) => value === "true"),
  imageAlt: z.string().max(180).optional(),
  imageCaption: z.string().max(300).optional(),
  scheduledAt: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? new Date(value) : undefined))
    .refine((value) => !value || !Number.isNaN(value.getTime()), {
      message: "Enter a valid publication time",
    }),
  featured: z.enum(["true", "false"]).transform((value) => value === "true"),
  imageId: z.string().optional().or(z.literal("")),
});

export const blogCategorySchema = z.object({
  name: z.string().min(1, "Name is required").max(60),
});

export type BlogPostInput = z.infer<typeof blogPostSchema>;
export type BlogCategoryInput = z.infer<typeof blogCategorySchema>;

// ----- Forms (Part 7) -----

const optionalHttpUrl = z
  .string()
  .trim()
  .max(500)
  .optional()
  .or(z.literal(""))
  .refine((v) => !v || /^https?:\/\//i.test(v), {
    message: "URL must start with http:// or https://",
  });

const optionalEmail = z
  .string()
  .trim()
  .max(160)
  .optional()
  .or(z.literal(""))
  .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
    message: "Enter a valid email address",
  });

const optionalFormDate = z
  .union([z.coerce.date(), z.literal("")])
  .optional()
  .transform((value) => (value === "" || value == null ? undefined : value));

const optionalSubmissionLimit = z
  .union([z.coerce.number().int().min(1).max(1_000_000), z.literal("")])
  .optional()
  .transform((value) => (value === "" || value == null ? undefined : value));

export const formSchema = z
  .object({
    title: z.string().min(2, "Title must be at least 2 characters").max(120),
    slug: z
      .string()
      .min(1, "Slug is required")
      .max(80)
      .regex(slugRegex, "Use lowercase letters, numbers, and hyphens"),
    description: z.string().max(500).optional(),
    successMessage: z.string().max(280).optional(),
    submitLabel: z.string().max(40).optional(),
    isOpen: formBoolean(),
    multiStep: formBoolean().optional(),
    notifyEmail: optionalEmail,
    webhookUrl: optionalHttpUrl,
    redirectUrl: optionalHttpUrl,
    opensAt: optionalFormDate,
    closesAt: optionalFormDate,
    maxSubmissions: optionalSubmissionLimit,
    closedMessage: z.string().max(280).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.opensAt &&
      value.closesAt &&
      value.closesAt.getTime() <= value.opensAt.getTime()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["closesAt"],
        message: "Closing time must be after opening time.",
      });
    }
  });

const fieldNameRegex = /^[a-z_][a-z0-9_]*$/;

const optionalFieldInt = z
  .union([z.coerce.number().int().min(0).max(100_000), z.literal("")])
  .optional()
  .transform((v) => (v === "" || v == null ? undefined : v));

const optionalFieldNum = z
  .union([z.coerce.number().min(-1e15).max(1e15), z.literal("")])
  .optional()
  .transform((v) => (v === "" || v == null ? undefined : v));

const optionalRegex = z
  .string()
  .max(500)
  .optional()
  .refine(
    (v) => {
      if (!v) return true;
      try {
        new RegExp(v);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Enter a valid regular expression" }
  );

const visibleIfRuleSchema = z.object({
  field: z.string().min(1).max(40),
  op: z.enum([
    "eq",
    "neq",
    "in",
    "nin",
    "contains",
    "not_contains",
    "filled",
    "empty",
    "checked",
    "unchecked",
  ]),
  value: z
    .union([z.string().max(500), z.array(z.string().max(200)).max(20)])
    .optional(),
});

const visibleIfSchema = z
  .union([
    visibleIfRuleSchema,
    z.object({
      logic: z.enum(["all", "any"]).default("all"),
      rules: z.array(visibleIfRuleSchema).min(1).max(8),
    }),
  ])
  .optional();

export const formFieldSchema = z
  .object({
    label: z.string().min(1, "Label is required").max(80),
    name: z
      .string()
      .min(1, "Name is required")
      .max(40)
      .regex(
        fieldNameRegex,
        "Use lowercase letters, numbers, and underscores (no spaces)"
      ),
    type: z.enum([
      "TEXT",
      "EMAIL",
      "PHONE",
      "NUMBER",
      "URL",
      "DATE",
      "TEXTAREA",
      "SELECT",
      "RADIO",
      "MULTISELECT",
      "CHECKBOX",
      "CHECKBOXES",
      "FILE",
    ]),
    required: formBoolean(),
    placeholder: z.string().max(120).optional(),
    helpText: z.string().max(280).optional(),
    options: z.string().max(2000).optional(),
    pageStep: optionalFieldInt,
    minLength: optionalFieldInt,
    maxLength: optionalFieldInt,
    minValue: optionalFieldNum,
    maxValue: optionalFieldNum,
    pattern: optionalRegex,
    patternHint: z.string().max(160).optional(),
    acceptMime: z.string().max(200).optional(),
    visibleIf: visibleIfSchema,
  })
  .superRefine((v, ctx) => {
    if (["SELECT", "RADIO", "MULTISELECT", "CHECKBOXES"].includes(v.type)) {
      const opts = (v.options ?? "")
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (opts.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["options"],
          message: "Add at least one option, one per line.",
        });
      }
    }
    if (
      v.minLength != null &&
      v.maxLength != null &&
      v.minLength > v.maxLength
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxLength"],
        message: "Max length must be greater than or equal to min length.",
      });
    }
    if (v.minValue != null && v.maxValue != null && v.minValue > v.maxValue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxValue"],
        message: "Max value must be greater than or equal to min value.",
      });
    }
    const visibilityRules =
      v.visibleIf && "rules" in v.visibleIf ? v.visibleIf.rules : v.visibleIf ? [v.visibleIf] : [];
    visibilityRules.forEach((rule, index) => {
      if (
        !["eq", "neq", "in", "nin", "contains", "not_contains"].includes(
          rule.op
        )
      ) {
        return;
      }
      const raw = rule.value;
      const hasValue = Array.isArray(raw)
        ? raw.some((item) => item.trim())
        : typeof raw === "string" && raw.trim();
      if (!hasValue) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["visibleIf"],
          message: `Add a value for visibility condition ${index + 1}.`,
        });
      }
    });
  });

export type FormInput = z.infer<typeof formSchema>;
export type FormFieldInput = z.infer<typeof formFieldSchema>;

// ----- Affiliate / coupon / membership (Part 8) -----

export const affiliateProgramSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(60),
  description: z.string().max(500).optional(),
  commissionPercent: z.coerce
    .number()
    .int("Whole numbers only")
    .min(0, "0% minimum")
    .max(100, "100% maximum"),
  isOpen: formBoolean(),
  approvalMode: z.enum(["AUTO", "MANUAL"]),
  attributionModel: z.enum(["FIRST_CLICK", "LAST_CLICK"]),
  attributionDays: z.coerce.number().int().min(1).max(365),
  holdDays: z.coerce.number().int().min(0).max(365),
  minimumPayout: z.coerce.number().int().min(0).max(2_000_000_000),
  allowSelfReferral: formBoolean(),
  includeShipping: formBoolean(),
  includeTax: formBoolean(),
  includeFees: formBoolean(),
  recurringCommissions: formBoolean(),
  terms: z.string().max(5000).optional(),
});

export const addAffiliateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(80),
  email: z.string().email("Invalid email address"),
});

export const couponCodeSchema = z
  .string()
  .min(2, "Code must be at least 2 characters")
  .max(40)
  .regex(
    /^[A-Z0-9_-]+$/,
    "Use uppercase letters, numbers, dashes, and underscores"
  );

export const couponSchema = z
  .object({
    code: couponCodeSchema,
    type: z.enum(["PERCENTAGE", "FIXED"]),
    stackingMode: z.enum(["ADDITIVE", "OVERRIDE"]).default("ADDITIVE"),
    value: z.coerce.number().int().min(1, "Value must be at least 1"),
    maxUses: z
      .union([z.coerce.number().int().min(0), z.literal("")])
      .optional(),
    maxUsesPerCustomer: z.union([z.coerce.number().int().min(1), z.literal("")]).optional(),
    minimumPurchase: moneyInt.optional(),
    startsAt: z.string().optional().or(z.literal("")),
    expiresAt: z.string().optional().or(z.literal("")),
    firstOrderOnly: z.boolean().default(false),
    freeShipping: z.boolean().default(false),
    isActive: formBoolean(),
    customerId: z.string().optional().or(z.literal("")),
    productIds: z.array(z.string()).default([]),
    courseIds: z.array(z.string()).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.type === "PERCENTAGE" && v.value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "Percentage cannot exceed 100.",
      });
    }
    if (v.expiresAt && v.expiresAt !== "") {
      const date = new Date(v.expiresAt);
      if (Number.isNaN(date.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["expiresAt"],
          message: "Enter a valid date.",
        });
      }
    }
  });

export const membershipPlanSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(60),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(60)
    .regex(slugRegex, "Use lowercase letters, numbers, and hyphens"),
  description: z.string().max(500).optional(),
  level: z.enum(["FREE", "BASIC", "PREMIUM"]),
  price: moneyInt,
  accessDays: z.coerce.number().int().min(0).max(3650).default(0),
  isActive: formBoolean(),
  productId: z.string().optional().or(z.literal("")),
  benefits: z.string().max(2000).optional(),
  recommended: formBoolean(),
  ctaLabel: z.string().trim().max(40).optional().or(z.literal("")),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export const assignMembershipSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(80),
  email: z.string().email("Invalid email address"),
  planId: z.string().min(1, "Pick a plan"),
});

export type AffiliateProgramInput = z.infer<typeof affiliateProgramSchema>;
export type AddAffiliateInput = z.infer<typeof addAffiliateSchema>;
export type CouponInput = z.infer<typeof couponSchema>;
export type MembershipPlanInput = z.infer<typeof membershipPlanSchema>;
export type AssignMembershipInput = z.infer<typeof assignMembershipSchema>;

// ----- Integration settings (Part 9) -----

const optionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .or(z.literal(""));

export const integrationSettingSchema = z.object({
  metaPixelId: z
    .string()
    .trim()
    .max(30)
    .regex(/^\d{6,30}$/, "Meta Pixel ID should be 6–30 digits")
    .optional()
    .or(z.literal("")),
  metaCapiEnabled: formBoolean(),
  metaCapiAccessToken: z
    .string()
    .trim()
    .max(600)
    .optional()
    .or(z.literal("")),
  metaCapiTestEventCode: z
    .string()
    .trim()
    .max(80)
    .regex(
      /^TEST[0-9A-Z_]{4,76}$/i,
      "Use a Meta test event code like TEST12345"
    )
    .optional()
    .or(z.literal("")),
  tiktokPixelId: z
    .string()
    .trim()
    .max(40)
    .regex(/^[A-Z0-9]{10,40}$/i, "TikTok Pixel ID berupa 10–40 huruf/angka, mis. C4ABCDEFGH1234567890")
    .optional()
    .or(z.literal("")),
  tiktokEventsApiEnabled: formBoolean(),
  tiktokAccessToken: z.string().trim().max(600).optional().or(z.literal("")),
  tiktokTestEventCode: z
    .string()
    .trim()
    .max(80)
    .regex(/^TEST[0-9A-Z_]{2,76}$/i, "Gunakan test event code TikTok, mis. TEST12345")
    .optional()
    .or(z.literal("")),
  googleAnalyticsId: z
    .string()
    .trim()
    .max(30)
    .regex(
      /^G-[A-Z0-9]{4,12}$/,
      "Use a GA4 Measurement ID like G-XXXXXXX"
    )
    .optional()
    .or(z.literal("")),
  googleTagManagerId: z
    .string()
    .trim()
    .max(20)
    .regex(/^GTM-[A-Z0-9]{4,10}$/, "Use a GTM ID like GTM-XXXXXX")
    .optional()
    .or(z.literal("")),
  googleAnalyticsApiSecret: z.string().trim().max(200).optional().or(z.literal("")),
  googleAdsConversionId: z
    .string()
    .trim()
    .max(20)
    .regex(/^AW-\d{6,15}$/, "Gunakan ID konversi Google Ads, mis. AW-123456789")
    .optional()
    .or(z.literal("")),
  googleAdsPurchaseLabel: z
    .string()
    .trim()
    .max(100)
    .regex(/^[\w-]{1,100}$/, "Label konversi hanya huruf, angka, - dan _")
    .optional()
    .or(z.literal("")),
  adConsentRequired: formBoolean(),
  googleSearchConsoleVerification: z
    .string()
    .trim()
    .max(120)
    .regex(
      /^[A-Za-z0-9_\-]{20,120}$/,
      "Paste only the verification token (letters, digits, dashes, underscores)"
    )
    .optional()
    .or(z.literal("")),
  customHeadScript: optionalText,
  mailketingEnabled: formBoolean(),
  mailketingApiToken: z.string().trim().max(500).optional().or(z.literal("")),
  mailketingSenderName: z
    .string()
    .trim()
    .max(80)
    .optional()
    .or(z.literal("")),
  mailketingSenderEmail: z
    .string()
    .trim()
    .max(120)
    .email("Enter a valid Mailketing sender email")
    .optional()
    .or(z.literal("")),
  gmailOAuthEnabled: formBoolean(),
  gmailSenderEmail: z
    .string()
    .trim()
    .max(120)
    .email("Enter a valid Gmail sender email")
    .optional()
    .or(z.literal("")),
  gmailSenderName: z.string().trim().max(80).optional().or(z.literal("")),
  gmailClientId: z.string().trim().max(200).optional().or(z.literal("")),
  gmailClientSecret: z.string().trim().max(500).optional().or(z.literal("")),
  gmailRefreshToken: z.string().trim().max(2000).optional().or(z.literal("")),
  telegramEnabled: formBoolean(),
  telegramBotToken: z
    .string()
    .trim()
    .max(200)
    .regex(
      /^\d{5,20}:[A-Za-z0-9_-]{20,}$/,
      "Use a Telegram bot token from BotFather"
    )
    .optional()
    .or(z.literal("")),
  telegramChatId: z
    .string()
    .trim()
    .max(100)
    .regex(
      /^(@[A-Za-z0-9_]{5,32}|-?\d{1,30})$/,
      "Use a numeric chat ID or @channelusername"
    )
    .optional()
    .or(z.literal("")),
  telegramMessageThreadId: z
    .string()
    .trim()
    .max(30)
    .regex(/^\d{1,30}$/, "Use a numeric forum topic thread ID")
    .optional()
    .or(z.literal("")),
  whatsappProvider: z
    .enum(["ONESENDER", "WABA", "STARSENDER"])
    .optional()
    .or(z.literal("")),
  whatsappApiKey: z.string().trim().max(500).optional().or(z.literal("")),
  whatsappSenderNumber: z
    .string()
    .trim()
    .max(30)
    .optional()
    .or(z.literal("")),
  whatsappPhoneNumberId: z
    .string()
    .trim()
    .max(120)
    .optional()
    .or(z.literal("")),
  whatsappWebhookVerifyToken: z
    .string()
    .trim()
    .max(160)
    .optional()
    .or(z.literal("")),
  whatsappWebhookSecret: z
    .string()
    .trim()
    .max(160)
    .optional()
    .or(z.literal("")),
  whatsappIsActive: formBoolean(),
}).superRefine((data, ctx) => {
  if (data.mailketingEnabled) {
    const required: Array<keyof typeof data> = [
      "mailketingApiToken",
      "mailketingSenderName",
      "mailketingSenderEmail",
    ];
    for (const field of required) {
      if (!String(data[field] ?? "").trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: "Required when Mailketing is enabled",
        });
      }
    }
  }

  if (data.telegramEnabled) {
    const required: Array<keyof typeof data> = [
      "telegramBotToken",
      "telegramChatId",
    ];
    for (const field of required) {
      if (!String(data[field] ?? "").trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: "Required when Telegram notifications are enabled",
        });
      }
    }
  }

  if (data.gmailOAuthEnabled) {
    const required: Array<keyof typeof data> = [
      "gmailSenderEmail",
      "gmailClientId",
      "gmailClientSecret",
      "gmailRefreshToken",
    ];
    for (const field of required) {
      if (!String(data[field] ?? "").trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: "Required when Gmail OAuth2 is enabled",
        });
      }
    }
  }
});

export type IntegrationSettingInput = z.infer<typeof integrationSettingSchema>;

// ----- SaaS + admin (Part 10) -----

export const updateUserRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["SUPER_ADMIN", "OWNER", "STAFF", "CUSTOMER", "AFFILIATE"]),
});

export const siteTemplateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(80),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(80)
    .regex(slugRegex, "Use lowercase letters, numbers, and hyphens"),
  description: z.string().max(500).optional(),
  thumbnail: z
    .string()
    .url("Must be a valid URL")
    .optional()
    .or(z.literal("")),
  isPublished: formBoolean(),
  category: z.string().max(40).optional().or(z.literal("")),
});

/** Menyalin blok satu halaman yang sudah jadi menjadi template platform. */
export const siteTemplateFromPageSchema = siteTemplateSchema.extend({
  pageId: z.string().min(1, "Pilih halaman sumbernya"),
});

export const abuseReportSchema = z.object({
  workspaceId: z.string().optional().or(z.literal("")),
  reporterEmail: z
    .string()
    .email("Invalid email")
    .optional()
    .or(z.literal("")),
  reason: z.string().min(5, "Tell us a bit more").max(2000),
});

export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;
export type SiteTemplateInput = z.infer<typeof siteTemplateSchema>;
export type AbuseReportInput = z.infer<typeof abuseReportSchema>;

// ============================================================
// Pengaturan eCommerce
// ============================================================

/**
 * Nilai enum dari form pengaturan toko.
 *
 * Sebelumnya string mentah dari FormData langsung di-cast ke tipe enum Prisma,
 * jadi nilai tak dikenal baru ditolak Postgres sebagai error mentah, bukan
 * sebagai pesan validasi yang bisa dibaca.
 */
export const ecommerceSectionSchema = z.enum([
  "general",
  "checkout",
  "payments",
  "shipping",
  "tax",
  "stock",
  "sound",
]);

export const currencySymbolPositionSchema = z.enum([
  "LEFT",
  "RIGHT",
  "LEFT_SPACE",
  "RIGHT_SPACE",
]);

export const paymentTimeoutUnitSchema = z.enum(["MINUTES", "HOURS", "DAYS"]);

export const stockDecrementTimingSchema = z.enum(["CHECKOUT", "PAID"]);

export const manualPaymentMethodTypeSchema = z.enum([
  "BANK_TRANSFER",
  "EWALLET",
  "QRIS",
  "OTHER",
]);

/** Satuan berat dan dimensi disimpan sebagai teks bebas di database. */
export const measurementUnitSchema = z.enum(["CM", "MM", "M", "INCH", "KG", "G", "LB"]);

export type EcommerceSection = z.infer<typeof ecommerceSectionSchema>;

// ============================================================
// Akun pengguna sendiri
// ============================================================

export const accountNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Nama minimal 2 karakter")
    .max(80, "Nama terlalu panjang"),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Password saat ini wajib diisi"),
    password: z
      .string()
      .min(8, "Password minimal 8 karakter")
      .max(100, "Password terlalu panjang"),
    confirmPassword: z.string().min(1, "Ulangi password baru"),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Password baru tidak sama",
    path: ["confirmPassword"],
  });

export type AccountNameInput = z.infer<typeof accountNameSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
