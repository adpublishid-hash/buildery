-- CreateEnum
CREATE TYPE "FormStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- AlterTable
ALTER TABLE "Form"
ADD COLUMN "status" "FormStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN "publishedSlug" TEXT,
ADD COLUMN "publishedVersion" INTEGER,
ADD COLUMN "publishedAt" TIMESTAMP(3),
ADD COLUMN "opensAt" TIMESTAMP(3),
ADD COLUMN "closesAt" TIMESTAMP(3),
ADD COLUMN "maxSubmissions" INTEGER,
ADD COLUMN "closedMessage" TEXT NOT NULL DEFAULT 'This form is closed and no longer accepting submissions.';

ALTER TABLE "Form" ALTER COLUMN "isOpen" SET DEFAULT false;

-- CreateTable
CREATE TABLE "FormVersion" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "successMessage" TEXT NOT NULL,
    "submitLabel" TEXT NOT NULL,
    "multiStep" BOOLEAN NOT NULL DEFAULT false,
    "notifyEmail" TEXT,
    "webhookUrl" TEXT,
    "redirectUrl" TEXT,
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "maxSubmissions" INTEGER,
    "closedMessage" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormVersion_pkey" PRIMARY KEY ("id")
);

-- Preserve every existing form as publication version 1 before lifecycle
-- status starts separating dashboard drafts from public content.
INSERT INTO "FormVersion" (
    "id", "formId", "version", "title", "slug", "description",
    "successMessage", "submitLabel", "multiStep", "notifyEmail",
    "webhookUrl", "redirectUrl", "opensAt", "closesAt",
    "maxSubmissions", "closedMessage", "fields", "createdAt"
)
SELECT
    'legacy_' || md5(f."id"),
    f."id",
    1,
    f."title",
    f."slug",
    f."description",
    f."successMessage",
    f."submitLabel",
    f."multiStep",
    f."notifyEmail",
    f."webhookUrl",
    f."redirectUrl",
    NULL,
    NULL,
    NULL,
    'This form is closed and no longer accepting submissions.',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', ff."id",
            'label', ff."label",
            'name', ff."name",
            'type', ff."type"::text,
            'required', ff."required",
            'placeholder', ff."placeholder",
            'helpText', ff."helpText",
            'options', ff."options",
            'order', ff."order",
            'pageStep', ff."pageStep",
            'minLength', ff."minLength",
            'maxLength', ff."maxLength",
            'minValue', ff."minValue",
            'maxValue', ff."maxValue",
            'pattern', ff."pattern",
            'patternHint', ff."patternHint",
            'acceptMime', ff."acceptMime",
            'visibleIf', ff."visibleIf"
          ) ORDER BY ff."order"
        )
        FROM "FormField" ff
        WHERE ff."formId" = f."id"
      ),
      '[]'::jsonb
    ),
    f."updatedAt"
FROM "Form" f;

UPDATE "Form"
SET
  "status" = CASE WHEN "isOpen" THEN 'PUBLISHED'::"FormStatus" ELSE 'CLOSED'::"FormStatus" END,
  "publishedSlug" = "slug",
  "publishedVersion" = 1,
  "publishedAt" = "updatedAt";

-- AlterTable
ALTER TABLE "FormSubmission" ADD COLUMN "formVersionId" TEXT;

UPDATE "FormSubmission" s
SET "formVersionId" = v."id"
FROM "FormVersion" v
WHERE v."formId" = s."formId" AND v."version" = 1;

-- CreateIndex
CREATE UNIQUE INDEX "Form_workspaceId_publishedSlug_key" ON "Form"("workspaceId", "publishedSlug");
CREATE INDEX "Form_workspaceId_status_idx" ON "Form"("workspaceId", "status");
CREATE UNIQUE INDEX "FormVersion_formId_version_key" ON "FormVersion"("formId", "version");
CREATE INDEX "FormVersion_formId_createdAt_idx" ON "FormVersion"("formId", "createdAt");
CREATE INDEX "FormSubmission_formVersionId_idx" ON "FormSubmission"("formVersionId");

-- AddForeignKey
ALTER TABLE "FormVersion" ADD CONSTRAINT "FormVersion_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_formVersionId_fkey" FOREIGN KEY ("formVersionId") REFERENCES "FormVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
