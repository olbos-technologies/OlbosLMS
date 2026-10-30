ALTER TABLE "course_versions" ADD COLUMN "academyMetadata" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "questions" ADD COLUMN "reviewStatus" TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "reviewedById" UUID, ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "contentVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "questions" ADD CONSTRAINT "questions_review_status_check"
  CHECK ("reviewStatus" IN ('DRAFT', 'APPROVED', 'REJECTED'));
ALTER TABLE "quiz_attempts" ADD COLUMN "questionSnapshot" JSONB NOT NULL DEFAULT '[]';
ALTER TYPE "AuditAction" ADD VALUE 'LESSON_COMPLETED';
-- Existing built-in tenant roles receive the same self-learning grants as new
-- tenants. Custom roles retain their explicit administrator-managed permissions.
UPDATE "roles" SET "permissions" = array_append("permissions", 'enrollment:enroll_self')
  WHERE "isSystem" = true AND "organizationId" IS NOT NULL
    AND NOT ('enrollment:enroll_self' = ANY("permissions"));
UPDATE "roles" SET "permissions" = array_append("permissions", 'lesson:complete_own')
  WHERE "isSystem" = true AND "organizationId" IS NOT NULL
    AND NOT ('lesson:complete_own' = ANY("permissions"));
