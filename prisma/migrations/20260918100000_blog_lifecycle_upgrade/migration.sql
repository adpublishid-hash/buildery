-- Extend publication and job lifecycles.
ALTER TYPE "BlogPostStatus" ADD VALUE IF NOT EXISTS 'SCHEDULED';
ALTER TYPE "BlogPostStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';
ALTER TYPE "ScheduledJobKind" ADD VALUE IF NOT EXISTS 'BLOG_PUBLICATION';

CREATE TYPE "BlogPostEventType" AS ENUM ('VIEW', 'READ_COMPLETE', 'SHARE');

ALTER TABLE "BlogPost"
ADD COLUMN "canonicalUrl" TEXT,
ADD COLUMN "noindex" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "imageAlt" TEXT,
ADD COLUMN "imageCaption" TEXT,
ADD COLUMN "publishedSlug" TEXT,
ADD COLUMN "publishedVersion" INTEGER,
ADD COLUMN "scheduledVersion" INTEGER,
ADD COLUMN "scheduledAt" TIMESTAMP(3),
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "featuredAt" TIMESTAMP(3);

CREATE TABLE "BlogPostVersion" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT,
    "body" TEXT NOT NULL,
    "seoTitle" TEXT,
    "metaDescription" TEXT,
    "canonicalUrl" TEXT,
    "noindex" BOOLEAN NOT NULL DEFAULT false,
    "imageUrl" TEXT,
    "imageAlt" TEXT,
    "imageCaption" TEXT,
    "authorName" TEXT,
    "categoryName" TEXT,
    "categorySlug" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogPostVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BlogSlugHistory" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogSlugHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BlogPostEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "type" "BlogPostEventType" NOT NULL,
    "visitorId" TEXT,
    "path" TEXT,
    "referrer" TEXT,
    "platform" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogPostEvent_pkey" PRIMARY KEY ("id")
);

-- Existing posts become immutable version 1. Published rows point at it;
-- drafts keep the revision without becoming public.
INSERT INTO "BlogPostVersion" (
    "id", "postId", "version", "title", "slug", "excerpt", "body",
    "seoTitle", "metaDescription", "canonicalUrl", "noindex",
    "imageUrl", "imageAlt", "imageCaption", "authorName",
    "categoryName", "categorySlug", "tags", "createdAt"
)
SELECT
    'legacy_blog_' || md5(p."id"),
    p."id",
    1,
    p."title",
    p."slug",
    p."excerpt",
    p."body",
    p."seoTitle",
    p."metaDescription",
    NULL,
    false,
    image."url",
    NULL,
    NULL,
    author."name",
    category."name",
    category."slug",
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object('name', tag."name", 'slug', tag."slug")
          ORDER BY tag."name"
        )
        FROM "_BlogPostToBlogTag" post_tag
        JOIN "BlogTag" tag ON tag."id" = post_tag."B"
        WHERE post_tag."A" = p."id"
      ),
      '[]'::jsonb
    ),
    p."updatedAt"
FROM "BlogPost" p
LEFT JOIN "UploadFile" image ON image."id" = p."imageId"
LEFT JOIN "User" author ON author."id" = p."authorId"
LEFT JOIN "BlogCategory" category ON category."id" = p."categoryId";

UPDATE "BlogPost"
SET
  "publishedSlug" = CASE WHEN "status" = 'PUBLISHED' THEN "slug" ELSE NULL END,
  "publishedVersion" = CASE WHEN "status" = 'PUBLISHED' THEN 1 ELSE NULL END,
  "featuredAt" = CASE WHEN "isPopular" THEN COALESCE("publishedAt", "updatedAt") ELSE NULL END;

DROP INDEX IF EXISTS "BlogPost_workspaceId_status_idx";
DROP INDEX IF EXISTS "BlogPost_categoryId_idx";

CREATE UNIQUE INDEX "BlogPost_workspaceId_publishedSlug_key" ON "BlogPost"("workspaceId", "publishedSlug");
CREATE INDEX "BlogPost_workspaceId_status_publishedAt_idx" ON "BlogPost"("workspaceId", "status", "publishedAt");
CREATE INDEX "BlogPost_categoryId_status_publishedAt_idx" ON "BlogPost"("categoryId", "status", "publishedAt");
CREATE INDEX "BlogPost_workspaceId_featuredAt_idx" ON "BlogPost"("workspaceId", "featuredAt");
CREATE UNIQUE INDEX "BlogPostVersion_postId_version_key" ON "BlogPostVersion"("postId", "version");
CREATE INDEX "BlogPostVersion_postId_createdAt_idx" ON "BlogPostVersion"("postId", "createdAt");
CREATE UNIQUE INDEX "BlogSlugHistory_workspaceId_slug_key" ON "BlogSlugHistory"("workspaceId", "slug");
CREATE INDEX "BlogSlugHistory_postId_idx" ON "BlogSlugHistory"("postId");
CREATE INDEX "BlogPostEvent_postId_type_createdAt_idx" ON "BlogPostEvent"("postId", "type", "createdAt");
CREATE INDEX "BlogPostEvent_workspaceId_createdAt_idx" ON "BlogPostEvent"("workspaceId", "createdAt");

ALTER TABLE "BlogPostVersion" ADD CONSTRAINT "BlogPostVersion_postId_fkey" FOREIGN KEY ("postId") REFERENCES "BlogPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlogSlugHistory" ADD CONSTRAINT "BlogSlugHistory_postId_fkey" FOREIGN KEY ("postId") REFERENCES "BlogPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlogPostEvent" ADD CONSTRAINT "BlogPostEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlogPostEvent" ADD CONSTRAINT "BlogPostEvent_postId_fkey" FOREIGN KEY ("postId") REFERENCES "BlogPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
