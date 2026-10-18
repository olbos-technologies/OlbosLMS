-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'CAMPUS_PROGRAM_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'CAMPUS_TERM_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'CAMPUS_COURSE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'CAMPUS_SECTION_CREATED';

-- CreateTable
CREATE TABLE "academic_programs" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "award" TEXT NOT NULL,
    "requiredCredits" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_terms" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_courses" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "programId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_sections" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "academicCourseId" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "lmsCourseId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_sections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "academic_programs_organizationId_id_key" ON "academic_programs"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_programs_organizationId_code_key" ON "academic_programs"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "academic_terms_organizationId_id_key" ON "academic_terms"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_terms_organizationId_code_key" ON "academic_terms"("organizationId", "code");

-- CreateIndex
CREATE INDEX "academic_courses_organizationId_programId_idx" ON "academic_courses"("organizationId", "programId");

-- CreateIndex
CREATE UNIQUE INDEX "academic_courses_organizationId_id_key" ON "academic_courses"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_courses_organizationId_code_key" ON "academic_courses"("organizationId", "code");

-- CreateIndex
CREATE INDEX "academic_sections_organizationId_academicCourseId_idx" ON "academic_sections"("organizationId", "academicCourseId");

-- CreateIndex
CREATE INDEX "academic_sections_organizationId_lmsCourseId_idx" ON "academic_sections"("organizationId", "lmsCourseId");

-- CreateIndex
CREATE UNIQUE INDEX "academic_sections_organizationId_termId_academicCourseId_co_key" ON "academic_sections"("organizationId", "termId", "academicCourseId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "courses_organizationId_id_key" ON "courses"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "academic_programs" ADD CONSTRAINT "academic_programs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_terms" ADD CONSTRAINT "academic_terms_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_courses" ADD CONSTRAINT "academic_courses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_courses" ADD CONSTRAINT "academic_courses_organizationId_programId_fkey" FOREIGN KEY ("organizationId", "programId") REFERENCES "academic_programs"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_sections" ADD CONSTRAINT "academic_sections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_sections" ADD CONSTRAINT "academic_sections_organizationId_academicCourseId_fkey" FOREIGN KEY ("organizationId", "academicCourseId") REFERENCES "academic_courses"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_sections" ADD CONSTRAINT "academic_sections_organizationId_termId_fkey" FOREIGN KEY ("organizationId", "termId") REFERENCES "academic_terms"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_sections" ADD CONSTRAINT "academic_sections_organizationId_lmsCourseId_fkey" FOREIGN KEY ("organizationId", "lmsCourseId") REFERENCES "courses"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Match API invariants even for direct database imports.
ALTER TABLE "academic_programs" ADD CONSTRAINT "academic_programs_credits_check" CHECK ("requiredCredits" BETWEEN 1 AND 500);
ALTER TABLE "academic_terms" ADD CONSTRAINT "academic_terms_dates_check" CHECK ("endsOn" >= "startsOn");
ALTER TABLE "academic_courses" ADD CONSTRAINT "academic_courses_credits_check" CHECK ("credits" BETWEEN 0 AND 30);
ALTER TABLE "academic_sections" ADD CONSTRAINT "academic_sections_capacity_check" CHECK ("capacity" BETWEEN 1 AND 10000);

-- Add permissions to existing built-in administrators without replacing custom grants.
UPDATE "roles"
SET "permissions" = ARRAY(SELECT DISTINCT p FROM unnest("permissions" || ARRAY['campus:read', 'campus:manage']) AS p),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "isSystem" = true AND "organizationId" IS NOT NULL
  AND "key" IN ('ORG_OWNER', 'ORG_ADMINISTRATOR');
