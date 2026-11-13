-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('UNIVERSITY', 'COLLEGE', 'SCHOOL', 'TRAINING_CENTER', 'MANUFACTURING', 'CONSTRUCTION', 'HEALTHCARE', 'WAREHOUSE', 'LOGISTICS', 'SMALL_BUSINESS', 'ENTERPRISE', 'OTHER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('NONE', 'PLATFORM_ADMINISTRATOR', 'PLATFORM_OWNER');

-- CreateEnum
CREATE TYPE "RoleKey" AS ENUM ('ORG_OWNER', 'ORG_ADMINISTRATOR', 'HR_ADMINISTRATOR', 'EHS_ADMINISTRATOR', 'INSTRUCTOR', 'SAFETY_TRAINER', 'TEACHING_ASSISTANT', 'SUPERVISOR', 'LEARNER', 'CUSTOM');

-- CreateEnum
CREATE TYPE "RoleScopeType" AS ENUM ('ORGANIZATION', 'DEPARTMENT', 'LOCATION', 'COURSE');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY', 'SEASONAL', 'INTERN', 'VOLUNTEER');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'TERMINATED');

-- CreateEnum
CREATE TYPE "CourseType" AS ENUM ('ACADEMIC', 'PROFESSIONAL', 'SAFETY', 'COMPLIANCE', 'CERTIFICATION', 'ORIENTATION', 'REFRESHER', 'MICROLEARNING');

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('ONLINE_SELF_PACED', 'INSTRUCTOR_LED_CLASSROOM', 'INSTRUCTOR_LED_VIRTUAL', 'BLENDED', 'ON_THE_JOB', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "TrainingType" AS ENUM ('ORGANIZATION_TRAINING', 'COMPANY_POLICY_TRAINING', 'SAFETY_AWARENESS_TRAINING', 'REGULATORY_TRAINING', 'THIRD_PARTY_TRAINING', 'OSHA_OUTREACH_TRAINING', 'CERTIFICATION', 'CREDENTIAL');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('RICH_TEXT', 'VIDEO', 'DOCUMENT', 'PRESENTATION', 'IMAGE', 'EXTERNAL_LINK', 'SCORM', 'INTERACTIVE', 'SAFETY_SCENARIO');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ENROLLED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'WITHDRAWN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ProgressStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MULTIPLE_CHOICE', 'MULTIPLE_SELECT', 'TRUE_FALSE', 'SHORT_ANSWER', 'ESSAY', 'MATCHING', 'ORDERING', 'SCENARIO');

-- CreateEnum
CREATE TYPE "QuizAttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'GRADED', 'ABANDONED', 'VOIDED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'LATE', 'RETURNED', 'GRADED', 'MISSING');

-- CreateEnum
CREATE TYPE "GradeSource" AS ENUM ('QUIZ', 'ASSIGNMENT', 'MANUAL', 'IMPORTED', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ComplianceStatus" AS ENUM ('CURRENT', 'EXPIRING_SOON', 'EXPIRED', 'MISSING', 'IN_PROGRESS', 'PENDING', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "RequirementScopeType" AS ENUM ('ORGANIZATION', 'DEPARTMENT', 'LOCATION', 'JOB_ROLE', 'EMPLOYMENT_TYPE', 'HAZARD_EXPOSURE', 'EQUIPMENT_AUTHORIZATION', 'SHIFT', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "ExpirationBasis" AS ENUM ('COMPLETION_DATE', 'FIXED_DATE', 'ANNIVERSARY_OF_HIRE');

-- CreateEnum
CREATE TYPE "TrainingAssignmentStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'WAIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssignmentOrigin" AS ENUM ('REQUIREMENT_ENGINE', 'MANUAL', 'INCIDENT_CORRECTIVE_ACTION', 'JHA', 'SELF_ENROLLED', 'IMPORT');

-- CreateEnum
CREATE TYPE "TrainingSessionStatus" AS ENUM ('SCHEDULED', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('REGISTERED', 'PRESENT', 'LATE', 'LEFT_EARLY', 'ABSENT', 'EXCUSED');

-- CreateEnum
CREATE TYPE "AttendanceMethod" AS ENUM ('MANUAL', 'QR_CHECK_IN', 'ONLINE_ACTIVITY', 'IMPORT');

-- CreateEnum
CREATE TYPE "CriterionResult" AS ENUM ('PASS', 'FAIL', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "CredentialType" AS ENUM ('CERTIFICATE', 'COMPLETION_CARD', 'BADGE', 'CREDENTIAL', 'TRAINING_RECORD');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('NEAR_MISS', 'FIRST_AID', 'MEDICAL_TREATMENT', 'LOST_TIME', 'FATALITY', 'PROPERTY_DAMAGE', 'ENVIRONMENTAL');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('REPORTED', 'UNDER_INVESTIGATION', 'CORRECTIVE_ACTION', 'CLOSED');

-- CreateEnum
CREATE TYPE "CorrectiveActionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'VERIFIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ObservationType" AS ENUM ('SAFE_BEHAVIOUR', 'AT_RISK_BEHAVIOUR', 'UNSAFE_CONDITION', 'GOOD_CATCH', 'SUGGESTION');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS', 'PUSH');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'READ', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('TRAINING_ASSIGNED', 'TRAINING_DUE', 'TRAINING_OVERDUE', 'TRAINING_EXPIRING', 'TRAINING_EXPIRED', 'CERTIFICATE_ISSUED', 'CERTIFICATE_REVOKED', 'COMPLIANCE_DIGEST', 'SESSION_REMINDER', 'ASSIGNMENT_DUE', 'GRADE_POSTED', 'ANNOUNCEMENT', 'SECURITY', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_CHANGED', 'PASSWORD_RESET_REQUESTED', 'MFA_ENROLLED', 'USER_INVITED', 'USER_CREATED', 'USER_UPDATED', 'USER_DELETED', 'ROLE_CHANGED', 'PERMISSION_CHANGED', 'ORGANIZATION_CREATED', 'ORGANIZATION_UPDATED', 'COURSE_CREATED', 'COURSE_UPDATED', 'COURSE_PUBLISHED', 'COURSE_ARCHIVED', 'ENROLLMENT_CREATED', 'TRAINING_REQUIREMENT_CREATED', 'TRAINING_REQUIREMENT_UPDATED', 'TRAINING_ASSIGNED', 'TRAINING_COMPLETED', 'TRAINING_WAIVED', 'TRAINING_RECORD_CREATED', 'TRAINING_RECORD_UPDATED', 'PRACTICAL_ASSESSMENT_RECORDED', 'CERTIFICATE_ISSUED', 'CERTIFICATE_REVOKED', 'CERTIFICATE_VERIFIED', 'GRADE_CHANGED', 'ATTENDANCE_RECORDED', 'INCIDENT_REPORTED', 'CORRECTIVE_ACTION_CREATED', 'FILE_UPLOADED', 'FILE_ACCESSED', 'FILE_DELETED', 'EXPORT_CREATED', 'AI_GENERATION_REQUESTED', 'AI_GENERATION_APPROVED', 'SUBSCRIPTION_CHANGED', 'SETTINGS_UPDATED', 'API_KEY_CREATED', 'API_KEY_REVOKED');

-- CreateEnum
CREATE TYPE "FileVisibility" AS ENUM ('PRIVATE', 'ORGANIZATION', 'COURSE', 'PUBLIC_LINK');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "EntitlementKey" AS ENUM ('AI_TUTOR', 'AI_COURSE_BUILDER', 'AI_QUESTION_GENERATOR', 'AI_SCENARIO_GENERATOR', 'AI_ANALYTICS_ASSISTANT', 'SAFETY_MODULE', 'TRAINING_MATRIX', 'CERTIFICATES', 'PRACTICAL_ASSESSMENTS', 'INCIDENT_MANAGEMENT', 'ADVANCED_ANALYTICS', 'SSO', 'SAML', 'SCIM', 'LTI', 'SCORM', 'XAPI', 'CUSTOM_BRANDING', 'API_ACCESS', 'WEBHOOKS', 'PRIORITY_SUPPORT', 'MAX_USERS', 'MAX_COURSES', 'MAX_STORAGE_GB', 'MAX_AI_REQUESTS_PER_MONTH');

-- CreateEnum
CREATE TYPE "EntitlementValueType" AS ENUM ('BOOLEAN', 'NUMERIC', 'UNLIMITED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE');

-- CreateEnum
CREATE TYPE "AiFeature" AS ENUM ('TUTOR', 'COURSE_BUILDER', 'QUESTION_GENERATOR', 'SCENARIO_GENERATOR', 'ANALYTICS_ASSISTANT', 'STUDY_ASSISTANT');

-- CreateEnum
CREATE TYPE "AiReviewStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "IntegrationKind" AS ENUM ('GOOGLE_WORKSPACE', 'MICROSOFT_365', 'MICROSOFT_ENTRA_ID', 'SLACK', 'TEAMS', 'HRIS', 'PAYROLL', 'SAML', 'OIDC', 'SCORM', 'LTI', 'XAPI', 'WEBHOOK');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "type" "OrganizationType" NOT NULL DEFAULT 'OTHER',
    "status" "OrganizationStatus" NOT NULL DEFAULT 'TRIAL',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "locale" TEXT NOT NULL DEFAULT 'en-US',
    "primaryDomain" TEXT,
    "logoFileId" UUID,
    "brandColor" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier" "PlanTier" NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "interval" TEXT NOT NULL DEFAULT 'month',
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_entitlements" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "key" "EntitlementKey" NOT NULL,
    "valueType" "EntitlementValueType" NOT NULL,
    "boolValue" BOOLEAN,
    "numValue" INTEGER,

    CONSTRAINT "plan_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "trialEndsAt" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "externalCustomerId" TEXT,
    "externalSubId" TEXT,
    "seatsPurchased" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlement_overrides" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "key" "EntitlementKey" NOT NULL,
    "valueType" "EntitlementValueType" NOT NULL,
    "boolValue" BOOLEAN,
    "numValue" INTEGER,
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entitlement_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_records" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "metric" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "externalId" TEXT,
    "lineItems" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "email" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "passwordHash" TEXT,
    "passwordUpdatedAt" TIMESTAMP(3),
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarFileId" UUID,
    "phone" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en-US',
    "timezone" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "platformRole" "PlatformRole" NOT NULL DEFAULT 'NONE',
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_identities" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "email" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "user_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "organizationId" UUID,
    "tokenHash" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "deviceLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestIp" TEXT,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "key" "RoleKey" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "permissions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "scopeType" "RoleScopeType" NOT NULL DEFAULT 'ORGANIZATION',
    "scopeId" UUID,
    "grantedById" UUID,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "createdById" UUID,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "parentId" UUID,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "managerId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "timezone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_roles" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "hazardExposures" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "job_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID,
    "employeeNumber" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "departmentId" UUID,
    "locationId" UUID,
    "jobRoleId" UUID,
    "supervisorId" UUID,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "shift" TEXT,
    "hireDate" TIMESTAMP(3),
    "terminationDate" TIMESTAMP(3),
    "equipmentAuthorizations" TEXT[],
    "hazardExposures" TEXT[],
    "isStudent" BOOLEAN NOT NULL DEFAULT false,
    "studentNumber" TEXT,
    "programOfStudy" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "requirementsStaleAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "type" "CourseType" NOT NULL DEFAULT 'ACADEMIC',
    "status" "CourseStatus" NOT NULL DEFAULT 'DRAFT',
    "ownerId" UUID,
    "thumbnailFileId" UUID,
    "tags" TEXT[],
    "publishedVersionId" UUID,
    "sourceTemplateId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_prerequisites" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "prerequisiteId" UUID NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "course_prerequisites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_versions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "objectives" TEXT[],
    "deliveryMethod" "DeliveryMethod" NOT NULL DEFAULT 'ONLINE_SELF_PACED',
    "trainingType" "TrainingType" NOT NULL DEFAULT 'ORGANIZATION_TRAINING',
    "estimatedMinutes" INTEGER,
    "creditHours" DECIMAL(6,2),
    "passingScore" INTEGER,
    "maxAttempts" INTEGER,
    "requiresFinalAssessment" BOOLEAN NOT NULL DEFAULT false,
    "requiresPracticalAssessment" BOOLEAN NOT NULL DEFAULT false,
    "requiresAttendance" BOOLEAN NOT NULL DEFAULT false,
    "requiresInstructorSignoff" BOOLEAN NOT NULL DEFAULT false,
    "renewalIntervalDays" INTEGER,
    "expirationBasis" "ExpirationBasis" NOT NULL DEFAULT 'COMPLETION_DATE',
    "warningIntervalDays" INTEGER[],
    "issuesCertificate" BOOLEAN NOT NULL DEFAULT false,
    "certificateTemplate" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "reviewDate" TIMESTAMP(3),
    "changeSummary" TEXT,
    "publishedAt" TIMESTAMP(3),
    "publishedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_course_profiles" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "courseVersionId" UUID NOT NULL,
    "safetyCategory" TEXT,
    "industry" TEXT,
    "hazardCategories" TEXT[],
    "targetAudience" TEXT[],
    "regulatoryReferences" TEXT[],
    "companyPolicyReferences" TEXT[],
    "instructorRequirements" TEXT,
    "practicalRequirements" TEXT,
    "disclaimer" TEXT,
    "revision" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "safety_course_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_modules" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "courseVersionId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "unlockAfterId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lessons" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "moduleId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "contentType" "ContentType" NOT NULL DEFAULT 'RICH_TEXT',
    "body" TEXT,
    "fileId" UUID,
    "externalUrl" TEXT,
    "durationSeconds" INTEGER,
    "minimumSeconds" INTEGER,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "scenarioId" UUID,
    "transcript" TEXT,
    "captionsFileId" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_paths" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_paths_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_path_items" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "pathId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "learning_path_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "courseVersionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ENROLLED',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastAccessedAt" TIMESTAMP(3),
    "finalScore" DECIMAL(6,2),
    "passed" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_progress" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "lessonId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "ProgressStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "secondsSpent" INTEGER NOT NULL DEFAULT 0,
    "lastPositionSeconds" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_banks" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "subject" TEXT,
    "tags" TEXT[],
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_banks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "bankId" UUID,
    "type" "QuestionType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "scenario" TEXT,
    "explanation" TEXT,
    "points" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "difficulty" INTEGER,
    "tags" TEXT[],
    "mediaFileId" UUID,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "aiGenerationId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_options" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "feedback" TEXT,

    CONSTRAINT "question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quizzes" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "courseId" UUID,
    "courseVersionId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isFinalAssessment" BOOLEAN NOT NULL DEFAULT false,
    "passingScore" INTEGER NOT NULL DEFAULT 80,
    "maxAttempts" INTEGER,
    "timeLimitMinutes" INTEGER,
    "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false,
    "shuffleOptions" BOOLEAN NOT NULL DEFAULT false,
    "showFeedback" BOOLEAN NOT NULL DEFAULT true,
    "availableFrom" TIMESTAMP(3),
    "availableUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_questions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "quizId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "points" DECIMAL(6,2),

    CONSTRAINT "quiz_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_attempts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "quizId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "enrollmentId" UUID,
    "attemptNumber" INTEGER NOT NULL,
    "status" "QuizAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "gradedAt" TIMESTAMP(3),
    "pointsEarned" DECIMAL(8,2),
    "pointsPossible" DECIMAL(8,2),
    "scorePercent" DECIMAL(6,2),
    "passed" BOOLEAN,
    "timeSpentSeconds" INTEGER,
    "ipAddress" TEXT,

    CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_responses" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "answer" JSONB NOT NULL DEFAULT '{}',
    "isCorrect" BOOLEAN,
    "pointsEarned" DECIMAL(6,2),
    "gradedById" UUID,
    "gradedAt" TIMESTAMP(3),
    "feedback" TEXT,

    CONSTRAINT "quiz_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "courseVersionId" UUID,
    "categoryId" UUID,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "pointsPossible" DECIMAL(8,2) NOT NULL DEFAULT 100,
    "dueAt" TIMESTAMP(3),
    "availableFrom" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "allowLate" BOOLEAN NOT NULL DEFAULT true,
    "latePenaltyPercentPerDay" DECIMAL(5,2),
    "maxLateDays" INTEGER,
    "rubric" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "assignmentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "body" TEXT,
    "fileIds" UUID[],
    "submittedAt" TIMESTAMP(3),
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "lateDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_categories" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "weightPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "dropLowest" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "gradebook_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grades" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "courseId" UUID,
    "categoryId" UUID,
    "studentId" UUID NOT NULL,
    "assignmentId" UUID,
    "submissionId" UUID,
    "quizId" UUID,
    "source" "GradeSource" NOT NULL DEFAULT 'MANUAL',
    "pointsEarned" DECIMAL(8,2),
    "pointsPossible" DECIMAL(8,2),
    "percent" DECIMAL(6,2),
    "letter" TEXT,
    "isExcused" BOOLEAN NOT NULL DEFAULT false,
    "isExtraCredit" BOOLEAN NOT NULL DEFAULT false,
    "penaltyApplied" DECIMAL(6,2),
    "feedback" TEXT,
    "recordedById" UUID,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_audits" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "gradeId" UUID NOT NULL,
    "changedById" UUID,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previousValue" JSONB NOT NULL,
    "newValue" JSONB NOT NULL,
    "reason" TEXT,

    CONSTRAINT "grade_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_requirements" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "courseId" UUID NOT NULL,
    "scopeType" "RequirementScopeType" NOT NULL,
    "departmentId" UUID,
    "locationId" UUID,
    "jobRoleId" UUID,
    "employeeId" UUID,
    "employmentType" "EmploymentType",
    "shift" TEXT,
    "hazardExposure" TEXT,
    "equipmentKey" TEXT,
    "dueWithinDays" INTEGER DEFAULT 30,
    "renewalIntervalDays" INTEGER,
    "warningIntervalDays" INTEGER[],
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveUntil" TIMESTAMP(3),
    "basis" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_states" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "requirementId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "status" "ComplianceStatus" NOT NULL DEFAULT 'MISSING',
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "daysUntilExpiry" INTEGER,
    "latestRecordId" UUID,
    "assignmentId" UUID,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compliance_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_assignments" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "courseVersionId" UUID,
    "requirementId" UUID,
    "sessionId" UUID,
    "status" "TrainingAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "origin" "AssignmentOrigin" NOT NULL DEFAULT 'MANUAL',
    "assignedById" UUID,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "waivedAt" TIMESTAMP(3),
    "waivedById" UUID,
    "waiverReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_records" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "courseVersionId" UUID NOT NULL,
    "requirementId" UUID,
    "assignmentId" UUID,
    "sessionId" UUID,
    "enrollmentId" UUID,
    "courseTitle" TEXT NOT NULL,
    "courseVersionNumber" INTEGER NOT NULL,
    "trainingType" "TrainingType" NOT NULL,
    "deliveryMethod" "DeliveryMethod" NOT NULL,
    "instructorId" UUID,
    "instructorName" TEXT,
    "trainingDate" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER,
    "creditHours" DECIMAL(6,2),
    "score" DECIMAL(6,2),
    "passingScore" INTEGER,
    "passed" BOOLEAN NOT NULL DEFAULT true,
    "practicalAssessmentId" UUID,
    "practicalPassed" BOOLEAN,
    "expiresAt" TIMESTAMP(3),
    "supersededById" UUID,
    "supersededAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "evidenceFileIds" UUID[],
    "notes" TEXT,
    "externalProvider" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_sessions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "courseVersionId" UUID,
    "title" TEXT NOT NULL,
    "status" "TrainingSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "deliveryMethod" "DeliveryMethod" NOT NULL DEFAULT 'INSTRUCTOR_LED_CLASSROOM',
    "instructorId" UUID,
    "instructorName" TEXT,
    "locationId" UUID,
    "room" TEXT,
    "virtualUrl" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "capacity" INTEGER,
    "checkInCode" TEXT,
    "checkInOpensAt" TIMESTAMP(3),
    "checkInClosesAt" TIMESTAMP(3),
    "notes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_entries" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "employeeId" UUID,
    "userId" UUID,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'REGISTERED',
    "method" "AttendanceMethod" NOT NULL DEFAULT 'MANUAL',
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "minutesAttended" INTEGER,
    "recordedById" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practical_assessment_templates" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "courseVersionId" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "requireAllCriteria" BOOLEAN NOT NULL DEFAULT true,
    "passingPercent" INTEGER,
    "requiresEmployeeAcknowledgment" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practical_assessment_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practical_criteria" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "guidance" TEXT,
    "position" INTEGER NOT NULL,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "weight" DECIMAL(5,2) NOT NULL DEFAULT 1,

    CONSTRAINT "practical_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practical_assessments" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "assessorId" UUID,
    "assessorName" TEXT,
    "sessionId" UUID,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "passed" BOOLEAN,
    "scorePercent" DECIMAL(6,2),
    "comments" TEXT,
    "evidenceFileIds" UUID[],
    "assessorSignature" TEXT,
    "assessorSignedAt" TIMESTAMP(3),
    "employeeAcknowledgedAt" TIMESTAMP(3),
    "employeeSignature" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practical_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practical_criterion_results" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "criterionId" UUID NOT NULL,
    "result" "CriterionResult" NOT NULL,
    "comment" TEXT,

    CONSTRAINT "practical_criterion_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificates" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "certificateNumber" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "integrityHash" TEXT NOT NULL,
    "employeeId" UUID NOT NULL,
    "trainingRecordId" UUID,
    "courseId" UUID NOT NULL,
    "courseVersionId" UUID NOT NULL,
    "status" "CertificateStatus" NOT NULL DEFAULT 'ACTIVE',
    "learnerName" TEXT NOT NULL,
    "organizationName" TEXT NOT NULL,
    "courseTitle" TEXT NOT NULL,
    "trainingType" "TrainingType" NOT NULL,
    "deliveryMethod" "DeliveryMethod" NOT NULL,
    "instructorName" TEXT,
    "durationMinutes" INTEGER,
    "creditHours" DECIMAL(6,2),
    "score" DECIMAL(6,2),
    "completedAt" TIMESTAMP(3) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "disclaimer" TEXT,
    "fileId" UUID,
    "revokedAt" TIMESTAMP(3),
    "revokedById" UUID,
    "revokedReason" TEXT,
    "verificationCount" INTEGER NOT NULL DEFAULT 0,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credentials" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "certificateId" UUID,
    "type" "CredentialType" NOT NULL DEFAULT 'CERTIFICATE',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageFileId" UUID,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "format" TEXT NOT NULL DEFAULT 'olbos/v1',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'REPORTED',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportedById" UUID,
    "locationId" UUID,
    "areaDescription" TEXT,
    "subjectEmployeeId" UUID,
    "immediateCause" TEXT,
    "rootCause" TEXT,
    "investigationNotes" TEXT,
    "investigatedById" UUID,
    "investigationCompletedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "evidenceFileIds" UUID[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corrective_actions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "incidentId" UUID,
    "jhaId" UUID,
    "observationId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "CorrectiveActionStatus" NOT NULL DEFAULT 'OPEN',
    "ownerEmployeeId" UUID,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" UUID,
    "trainingCourseIds" UUID[],
    "trainingAssignedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "corrective_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jha_jsas" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "jobDescription" TEXT,
    "jobRoleId" UUID,
    "locationId" UUID,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "overallRisk" "RiskLevel" NOT NULL DEFAULT 'MEDIUM',
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jha_jsas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jha_tasks" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "jhaId" UUID NOT NULL,
    "step" INTEGER NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "jha_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jha_hazards" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "hazard" TEXT NOT NULL,
    "hazardCategory" TEXT,
    "likelihood" INTEGER NOT NULL DEFAULT 3,
    "severity" INTEGER NOT NULL DEFAULT 3,
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'MEDIUM',
    "controls" TEXT[],
    "recommendedCourseIds" UUID[],

    CONSTRAINT "jha_hazards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_observations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "type" "ObservationType" NOT NULL,
    "description" TEXT NOT NULL,
    "locationId" UUID,
    "areaDescription" TEXT,
    "departmentId" UUID,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportedById" UUID,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'LOW',
    "immediateActionTaken" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "photoFileIds" UUID[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "safety_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_scenarios" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "safetyCategory" TEXT,
    "difficulty" INTEGER NOT NULL DEFAULT 2,
    "estimatedMinutes" INTEGER,
    "passingScore" INTEGER NOT NULL DEFAULT 80,
    "graph" JSONB NOT NULL DEFAULT '{}',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "aiGenerationId" UUID,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "safety_scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenario_attempts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "scenarioId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "employeeId" UUID,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "scorePercent" DECIMAL(6,2),
    "passed" BOOLEAN,
    "path" JSONB NOT NULL DEFAULT '[]',
    "hazardsIdentified" INTEGER NOT NULL DEFAULT 0,
    "hazardsMissed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "scenario_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "actionUrl" TEXT,
    "dedupeKey" TEXT,
    "batchKey" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "frequency" TEXT NOT NULL DEFAULT 'immediate',

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "courseId" UUID,
    "authorId" UUID,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discussions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "courseId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discussions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discussion_posts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "discussionId" UUID NOT NULL,
    "parentId" UUID,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "mentionedUserIds" UUID[],
    "isInstructorPost" BOOLEAN NOT NULL DEFAULT false,
    "hiddenAt" TIMESTAMP(3),
    "hiddenById" UUID,
    "hiddenReason" TEXT,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discussion_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "courseId" UUID,
    "sessionId" UUID,
    "assignmentId" UUID,
    "employeeId" UUID,
    "userId" UUID,
    "locationId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_files" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "checksumSha256" TEXT,
    "visibility" "FileVisibility" NOT NULL DEFAULT 'PRIVATE',
    "scanStatus" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "scanCompletedAt" TIMESTAMP(3),
    "scanDetail" TEXT,
    "ownerType" TEXT,
    "ownerId" UUID,
    "uploadedById" UUID,
    "retainUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "actorUserId" UUID,
    "actorLabel" TEXT,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT,
    "changes" JSONB NOT NULL DEFAULT '{}',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "feature" "AiFeature" NOT NULL,
    "title" TEXT,
    "courseId" UUID,
    "contextRefs" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "citations" JSONB NOT NULL DEFAULT '[]',
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_records" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID,
    "feature" "AiFeature" NOT NULL,
    "model" TEXT NOT NULL,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "succeeded" BOOLEAN NOT NULL DEFAULT true,
    "errorCode" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_generations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "feature" "AiFeature" NOT NULL,
    "status" "AiReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "requestedById" UUID NOT NULL,
    "prompt" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB NOT NULL DEFAULT '{}',
    "model" TEXT,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "appliedEntityType" TEXT,
    "appliedEntityId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "kind" "IntegrationKind" NOT NULL,
    "name" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "secretRef" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_runs" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "reportKey" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'csv',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "requestedById" UUID,
    "rowCount" INTEGER,
    "fileId" UUID,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "error" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organizations_status_idx" ON "organizations"("status");

-- CreateIndex
CREATE INDEX "organizations_deletedAt_idx" ON "organizations"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "plans_key_key" ON "plans"("key");

-- CreateIndex
CREATE UNIQUE INDEX "plan_entitlements_planId_key_key" ON "plan_entitlements"("planId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_organizationId_key" ON "subscriptions"("organizationId");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "entitlement_overrides_organizationId_key_key" ON "entitlement_overrides"("organizationId", "key");

-- CreateIndex
CREATE INDEX "usage_records_organizationId_recordedAt_idx" ON "usage_records"("organizationId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "usage_records_organizationId_metric_periodStart_key" ON "usage_records"("organizationId", "metric", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE INDEX "invoices_organizationId_status_idx" ON "invoices"("organizationId", "status");

-- CreateIndex
CREATE INDEX "users_organizationId_status_idx" ON "users"("organizationId", "status");

-- CreateIndex
CREATE INDEX "users_emailNormalized_idx" ON "users"("emailNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "users_organizationId_emailNormalized_key" ON "users"("organizationId", "emailNormalized");

-- CreateIndex
CREATE INDEX "user_identities_userId_idx" ON "user_identities"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_identities_provider_providerUserId_key" ON "user_identities"("provider", "providerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_tokenHash_key" ON "user_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "user_sessions_userId_revokedAt_idx" ON "user_sessions"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "user_sessions_expiresAt_idx" ON "user_sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_tokenHash_key" ON "email_verification_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "email_verification_tokens_userId_idx" ON "email_verification_tokens"("userId");

-- CreateIndex
CREATE INDEX "roles_organizationId_key_idx" ON "roles"("organizationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "roles_organizationId_name_key" ON "roles"("organizationId", "name");

-- CreateIndex
CREATE INDEX "user_roles_organizationId_userId_idx" ON "user_roles"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "user_roles_organizationId_roleId_idx" ON "user_roles"("organizationId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_userId_roleId_scopeType_scopeId_key" ON "user_roles"("userId", "roleId", "scopeType", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_prefix_key" ON "api_keys"("prefix");

-- CreateIndex
CREATE INDEX "api_keys_organizationId_revokedAt_idx" ON "api_keys"("organizationId", "revokedAt");

-- CreateIndex
CREATE INDEX "departments_organizationId_parentId_idx" ON "departments"("organizationId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "departments_organizationId_name_key" ON "departments"("organizationId", "name");

-- CreateIndex
CREATE INDEX "locations_organizationId_idx" ON "locations"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "locations_organizationId_name_key" ON "locations"("organizationId", "name");

-- CreateIndex
CREATE INDEX "job_roles_organizationId_idx" ON "job_roles"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "job_roles_organizationId_title_key" ON "job_roles"("organizationId", "title");

-- CreateIndex
CREATE UNIQUE INDEX "employees_userId_key" ON "employees"("userId");

-- CreateIndex
CREATE INDEX "employees_organizationId_status_idx" ON "employees"("organizationId", "status");

-- CreateIndex
CREATE INDEX "employees_organizationId_departmentId_idx" ON "employees"("organizationId", "departmentId");

-- CreateIndex
CREATE INDEX "employees_organizationId_locationId_idx" ON "employees"("organizationId", "locationId");

-- CreateIndex
CREATE INDEX "employees_organizationId_jobRoleId_idx" ON "employees"("organizationId", "jobRoleId");

-- CreateIndex
CREATE INDEX "employees_organizationId_supervisorId_idx" ON "employees"("organizationId", "supervisorId");

-- CreateIndex
CREATE INDEX "employees_organizationId_requirementsStaleAt_idx" ON "employees"("organizationId", "requirementsStaleAt");

-- CreateIndex
CREATE UNIQUE INDEX "employees_organizationId_employeeNumber_key" ON "employees"("organizationId", "employeeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "courses_publishedVersionId_key" ON "courses"("publishedVersionId");

-- CreateIndex
CREATE INDEX "courses_organizationId_status_idx" ON "courses"("organizationId", "status");

-- CreateIndex
CREATE INDEX "courses_organizationId_type_idx" ON "courses"("organizationId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "courses_organizationId_slug_key" ON "courses"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "course_prerequisites_organizationId_idx" ON "course_prerequisites"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "course_prerequisites_courseId_prerequisiteId_key" ON "course_prerequisites"("courseId", "prerequisiteId");

-- CreateIndex
CREATE INDEX "course_versions_organizationId_courseId_idx" ON "course_versions"("organizationId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "course_versions_courseId_version_key" ON "course_versions"("courseId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "safety_course_profiles_courseVersionId_key" ON "safety_course_profiles"("courseVersionId");

-- CreateIndex
CREATE INDEX "safety_course_profiles_organizationId_safetyCategory_idx" ON "safety_course_profiles"("organizationId", "safetyCategory");

-- CreateIndex
CREATE INDEX "course_modules_organizationId_courseVersionId_idx" ON "course_modules"("organizationId", "courseVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "course_modules_courseVersionId_position_key" ON "course_modules"("courseVersionId", "position");

-- CreateIndex
CREATE INDEX "lessons_organizationId_moduleId_idx" ON "lessons"("organizationId", "moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "lessons_moduleId_position_key" ON "lessons"("moduleId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "learning_paths_organizationId_slug_key" ON "learning_paths"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "learning_path_items_organizationId_pathId_idx" ON "learning_path_items"("organizationId", "pathId");

-- CreateIndex
CREATE UNIQUE INDEX "learning_path_items_pathId_position_key" ON "learning_path_items"("pathId", "position");

-- CreateIndex
CREATE INDEX "enrollments_organizationId_courseId_status_idx" ON "enrollments"("organizationId", "courseId", "status");

-- CreateIndex
CREATE INDEX "enrollments_organizationId_userId_status_idx" ON "enrollments"("organizationId", "userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_userId_courseVersionId_key" ON "enrollments"("userId", "courseVersionId");

-- CreateIndex
CREATE INDEX "lesson_progress_organizationId_userId_idx" ON "lesson_progress"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_progress_enrollmentId_lessonId_key" ON "lesson_progress"("enrollmentId", "lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "question_banks_organizationId_name_key" ON "question_banks"("organizationId", "name");

-- CreateIndex
CREATE INDEX "questions_organizationId_bankId_idx" ON "questions"("organizationId", "bankId");

-- CreateIndex
CREATE INDEX "questions_organizationId_type_idx" ON "questions"("organizationId", "type");

-- CreateIndex
CREATE INDEX "question_options_organizationId_idx" ON "question_options"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "question_options_questionId_position_key" ON "question_options"("questionId", "position");

-- CreateIndex
CREATE INDEX "quizzes_organizationId_courseId_idx" ON "quizzes"("organizationId", "courseId");

-- CreateIndex
CREATE INDEX "quiz_questions_organizationId_idx" ON "quiz_questions"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_questions_quizId_position_key" ON "quiz_questions"("quizId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_questions_quizId_questionId_key" ON "quiz_questions"("quizId", "questionId");

-- CreateIndex
CREATE INDEX "quiz_attempts_organizationId_userId_idx" ON "quiz_attempts"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "quiz_attempts_organizationId_quizId_status_idx" ON "quiz_attempts"("organizationId", "quizId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_attempts_quizId_userId_attemptNumber_key" ON "quiz_attempts"("quizId", "userId", "attemptNumber");

-- CreateIndex
CREATE INDEX "quiz_responses_organizationId_idx" ON "quiz_responses"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_responses_attemptId_questionId_key" ON "quiz_responses"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX "assignments_organizationId_courseId_idx" ON "assignments"("organizationId", "courseId");

-- CreateIndex
CREATE INDEX "submissions_organizationId_assignmentId_status_idx" ON "submissions"("organizationId", "assignmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_assignmentId_userId_attemptNumber_key" ON "submissions"("assignmentId", "userId", "attemptNumber");

-- CreateIndex
CREATE INDEX "gradebook_categories_organizationId_courseId_idx" ON "gradebook_categories"("organizationId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_categories_courseId_name_key" ON "gradebook_categories"("courseId", "name");

-- CreateIndex
CREATE INDEX "grades_organizationId_courseId_studentId_idx" ON "grades"("organizationId", "courseId", "studentId");

-- CreateIndex
CREATE INDEX "grades_organizationId_assignmentId_idx" ON "grades"("organizationId", "assignmentId");

-- CreateIndex
CREATE INDEX "grade_audits_organizationId_gradeId_idx" ON "grade_audits"("organizationId", "gradeId");

-- CreateIndex
CREATE INDEX "training_requirements_organizationId_isActive_idx" ON "training_requirements"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "training_requirements_organizationId_courseId_idx" ON "training_requirements"("organizationId", "courseId");

-- CreateIndex
CREATE INDEX "training_requirements_organizationId_scopeType_idx" ON "training_requirements"("organizationId", "scopeType");

-- CreateIndex
CREATE INDEX "compliance_states_organizationId_status_idx" ON "compliance_states"("organizationId", "status");

-- CreateIndex
CREATE INDEX "compliance_states_organizationId_expiresAt_idx" ON "compliance_states"("organizationId", "expiresAt");

-- CreateIndex
CREATE INDEX "compliance_states_organizationId_courseId_status_idx" ON "compliance_states"("organizationId", "courseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_states_employeeId_requirementId_key" ON "compliance_states"("employeeId", "requirementId");

-- CreateIndex
CREATE INDEX "training_assignments_organizationId_employeeId_status_idx" ON "training_assignments"("organizationId", "employeeId", "status");

-- CreateIndex
CREATE INDEX "training_assignments_organizationId_status_dueAt_idx" ON "training_assignments"("organizationId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "training_assignments_organizationId_requirementId_idx" ON "training_assignments"("organizationId", "requirementId");

-- CreateIndex
CREATE UNIQUE INDEX "training_records_supersededById_key" ON "training_records"("supersededById");

-- CreateIndex
CREATE INDEX "training_records_organizationId_employeeId_completedAt_idx" ON "training_records"("organizationId", "employeeId", "completedAt");

-- CreateIndex
CREATE INDEX "training_records_organizationId_courseId_completedAt_idx" ON "training_records"("organizationId", "courseId", "completedAt");

-- CreateIndex
CREATE INDEX "training_records_organizationId_expiresAt_idx" ON "training_records"("organizationId", "expiresAt");

-- CreateIndex
CREATE INDEX "training_records_organizationId_requirementId_idx" ON "training_records"("organizationId", "requirementId");

-- CreateIndex
CREATE UNIQUE INDEX "training_sessions_checkInCode_key" ON "training_sessions"("checkInCode");

-- CreateIndex
CREATE INDEX "training_sessions_organizationId_startsAt_idx" ON "training_sessions"("organizationId", "startsAt");

-- CreateIndex
CREATE INDEX "training_sessions_organizationId_courseId_status_idx" ON "training_sessions"("organizationId", "courseId", "status");

-- CreateIndex
CREATE INDEX "attendance_entries_organizationId_sessionId_status_idx" ON "attendance_entries"("organizationId", "sessionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_entries_sessionId_employeeId_key" ON "attendance_entries"("sessionId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "practical_assessment_templates_organizationId_name_key" ON "practical_assessment_templates"("organizationId", "name");

-- CreateIndex
CREATE INDEX "practical_criteria_organizationId_idx" ON "practical_criteria"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "practical_criteria_templateId_position_key" ON "practical_criteria"("templateId", "position");

-- CreateIndex
CREATE INDEX "practical_assessments_organizationId_employeeId_assessedAt_idx" ON "practical_assessments"("organizationId", "employeeId", "assessedAt");

-- CreateIndex
CREATE INDEX "practical_criterion_results_organizationId_idx" ON "practical_criterion_results"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "practical_criterion_results_assessmentId_criterionId_key" ON "practical_criterion_results"("assessmentId", "criterionId");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_certificateNumber_key" ON "certificates"("certificateNumber");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_publicId_key" ON "certificates"("publicId");

-- CreateIndex
CREATE INDEX "certificates_organizationId_employeeId_idx" ON "certificates"("organizationId", "employeeId");

-- CreateIndex
CREATE INDEX "certificates_organizationId_status_expiresAt_idx" ON "certificates"("organizationId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "credentials_certificateId_key" ON "credentials"("certificateId");

-- CreateIndex
CREATE INDEX "credentials_organizationId_employeeId_idx" ON "credentials"("organizationId", "employeeId");

-- CreateIndex
CREATE INDEX "incidents_organizationId_status_occurredAt_idx" ON "incidents"("organizationId", "status", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "incidents_organizationId_reference_key" ON "incidents"("organizationId", "reference");

-- CreateIndex
CREATE INDEX "corrective_actions_organizationId_status_dueAt_idx" ON "corrective_actions"("organizationId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "jha_jsas_organizationId_status_idx" ON "jha_jsas"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "jha_jsas_organizationId_reference_key" ON "jha_jsas"("organizationId", "reference");

-- CreateIndex
CREATE INDEX "jha_tasks_organizationId_idx" ON "jha_tasks"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "jha_tasks_jhaId_step_key" ON "jha_tasks"("jhaId", "step");

-- CreateIndex
CREATE INDEX "jha_hazards_organizationId_taskId_idx" ON "jha_hazards"("organizationId", "taskId");

-- CreateIndex
CREATE INDEX "safety_observations_organizationId_status_observedAt_idx" ON "safety_observations"("organizationId", "status", "observedAt");

-- CreateIndex
CREATE INDEX "safety_scenarios_organizationId_isPublished_idx" ON "safety_scenarios"("organizationId", "isPublished");

-- CreateIndex
CREATE INDEX "scenario_attempts_organizationId_scenarioId_idx" ON "scenario_attempts"("organizationId", "scenarioId");

-- CreateIndex
CREATE INDEX "scenario_attempts_organizationId_userId_idx" ON "scenario_attempts"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "notifications_organizationId_userId_readAt_idx" ON "notifications"("organizationId", "userId", "readAt");

-- CreateIndex
CREATE INDEX "notifications_organizationId_status_scheduledFor_idx" ON "notifications"("organizationId", "status", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_userId_channel_dedupeKey_key" ON "notifications"("userId", "channel", "dedupeKey");

-- CreateIndex
CREATE INDEX "notification_preferences_organizationId_userId_idx" ON "notification_preferences"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_category_channel_key" ON "notification_preferences"("userId", "category", "channel");

-- CreateIndex
CREATE INDEX "announcements_organizationId_courseId_publishedAt_idx" ON "announcements"("organizationId", "courseId", "publishedAt");

-- CreateIndex
CREATE INDEX "discussions_organizationId_courseId_idx" ON "discussions"("organizationId", "courseId");

-- CreateIndex
CREATE INDEX "discussion_posts_organizationId_discussionId_createdAt_idx" ON "discussion_posts"("organizationId", "discussionId", "createdAt");

-- CreateIndex
CREATE INDEX "calendar_events_organizationId_startsAt_idx" ON "calendar_events"("organizationId", "startsAt");

-- CreateIndex
CREATE INDEX "calendar_events_organizationId_userId_startsAt_idx" ON "calendar_events"("organizationId", "userId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_storageKey_key" ON "stored_files"("storageKey");

-- CreateIndex
CREATE INDEX "stored_files_organizationId_ownerType_ownerId_idx" ON "stored_files"("organizationId", "ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "stored_files_organizationId_scanStatus_idx" ON "stored_files"("organizationId", "scanStatus");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_occurredAt_idx" ON "audit_logs"("organizationId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_entityType_entityId_idx" ON "audit_logs"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_action_occurredAt_idx" ON "audit_logs"("organizationId", "action", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorUserId_occurredAt_idx" ON "audit_logs"("actorUserId", "occurredAt");

-- CreateIndex
CREATE INDEX "ai_conversations_organizationId_userId_updatedAt_idx" ON "ai_conversations"("organizationId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "ai_messages_organizationId_conversationId_createdAt_idx" ON "ai_messages"("organizationId", "conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_records_organizationId_occurredAt_idx" ON "ai_usage_records"("organizationId", "occurredAt");

-- CreateIndex
CREATE INDEX "ai_usage_records_organizationId_feature_occurredAt_idx" ON "ai_usage_records"("organizationId", "feature", "occurredAt");

-- CreateIndex
CREATE INDEX "ai_generations_organizationId_status_idx" ON "ai_generations"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_organizationId_kind_name_key" ON "integrations"("organizationId", "kind", "name");

-- CreateIndex
CREATE INDEX "report_runs_organizationId_reportKey_createdAt_idx" ON "report_runs"("organizationId", "reportKey", "createdAt");

-- AddForeignKey
ALTER TABLE "plan_entitlements" ADD CONSTRAINT "plan_entitlements_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlement_overrides" ADD CONSTRAINT "entitlement_overrides_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_roles" ADD CONSTRAINT "job_roles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_jobRoleId_fkey" FOREIGN KEY ("jobRoleId") REFERENCES "job_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_publishedVersionId_fkey" FOREIGN KEY ("publishedVersionId") REFERENCES "course_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_prerequisites" ADD CONSTRAINT "course_prerequisites_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_prerequisites" ADD CONSTRAINT "course_prerequisites_prerequisiteId_fkey" FOREIGN KEY ("prerequisiteId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_versions" ADD CONSTRAINT "course_versions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_versions" ADD CONSTRAINT "course_versions_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_course_profiles" ADD CONSTRAINT "safety_course_profiles_courseVersionId_fkey" FOREIGN KEY ("courseVersionId") REFERENCES "course_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_modules" ADD CONSTRAINT "course_modules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_modules" ADD CONSTRAINT "course_modules_courseVersionId_fkey" FOREIGN KEY ("courseVersionId") REFERENCES "course_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "course_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_paths" ADD CONSTRAINT "learning_paths_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_path_items" ADD CONSTRAINT "learning_path_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_path_items" ADD CONSTRAINT "learning_path_items_pathId_fkey" FOREIGN KEY ("pathId") REFERENCES "learning_paths"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_path_items" ADD CONSTRAINT "learning_path_items_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_courseVersionId_fkey" FOREIGN KEY ("courseVersionId") REFERENCES "course_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_banks" ADD CONSTRAINT "question_banks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "question_banks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_courseVersionId_fkey" FOREIGN KEY ("courseVersionId") REFERENCES "course_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_responses" ADD CONSTRAINT "quiz_responses_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "quiz_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_responses" ADD CONSTRAINT "quiz_responses_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_courseVersionId_fkey" FOREIGN KEY ("courseVersionId") REFERENCES "course_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "gradebook_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_categories" ADD CONSTRAINT "gradebook_categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_categories" ADD CONSTRAINT "gradebook_categories_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "gradebook_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizzes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_audits" ADD CONSTRAINT "grade_audits_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_audits" ADD CONSTRAINT "grade_audits_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "grades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_audits" ADD CONSTRAINT "grade_audits_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_requirements" ADD CONSTRAINT "training_requirements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_requirements" ADD CONSTRAINT "training_requirements_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_requirements" ADD CONSTRAINT "training_requirements_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_requirements" ADD CONSTRAINT "training_requirements_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_requirements" ADD CONSTRAINT "training_requirements_jobRoleId_fkey" FOREIGN KEY ("jobRoleId") REFERENCES "job_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_requirements" ADD CONSTRAINT "training_requirements_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_states" ADD CONSTRAINT "compliance_states_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_states" ADD CONSTRAINT "compliance_states_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_states" ADD CONSTRAINT "compliance_states_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "training_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_assignments" ADD CONSTRAINT "training_assignments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_assignments" ADD CONSTRAINT "training_assignments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_assignments" ADD CONSTRAINT "training_assignments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_assignments" ADD CONSTRAINT "training_assignments_courseVersionId_fkey" FOREIGN KEY ("courseVersionId") REFERENCES "course_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_assignments" ADD CONSTRAINT "training_assignments_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "training_requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_assignments" ADD CONSTRAINT "training_assignments_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "training_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_courseVersionId_fkey" FOREIGN KEY ("courseVersionId") REFERENCES "course_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "training_requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "training_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "training_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "training_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_courseVersionId_fkey" FOREIGN KEY ("courseVersionId") REFERENCES "course_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "training_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_entries" ADD CONSTRAINT "attendance_entries_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practical_assessment_templates" ADD CONSTRAINT "practical_assessment_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practical_assessment_templates" ADD CONSTRAINT "practical_assessment_templates_courseVersionId_fkey" FOREIGN KEY ("courseVersionId") REFERENCES "course_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practical_criteria" ADD CONSTRAINT "practical_criteria_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "practical_assessment_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practical_assessments" ADD CONSTRAINT "practical_assessments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practical_assessments" ADD CONSTRAINT "practical_assessments_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "practical_assessment_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practical_assessments" ADD CONSTRAINT "practical_assessments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practical_assessments" ADD CONSTRAINT "practical_assessments_assessorId_fkey" FOREIGN KEY ("assessorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practical_criterion_results" ADD CONSTRAINT "practical_criterion_results_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "practical_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practical_criterion_results" ADD CONSTRAINT "practical_criterion_results_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "practical_criteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_trainingRecordId_fkey" FOREIGN KEY ("trainingRecordId") REFERENCES "training_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_courseVersionId_fkey" FOREIGN KEY ("courseVersionId") REFERENCES "course_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "certificates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_subjectEmployeeId_fkey" FOREIGN KEY ("subjectEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_jhaId_fkey" FOREIGN KEY ("jhaId") REFERENCES "jha_jsas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "safety_observations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_ownerEmployeeId_fkey" FOREIGN KEY ("ownerEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jha_jsas" ADD CONSTRAINT "jha_jsas_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jha_jsas" ADD CONSTRAINT "jha_jsas_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jha_tasks" ADD CONSTRAINT "jha_tasks_jhaId_fkey" FOREIGN KEY ("jhaId") REFERENCES "jha_jsas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jha_hazards" ADD CONSTRAINT "jha_hazards_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "jha_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_observations" ADD CONSTRAINT "safety_observations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_observations" ADD CONSTRAINT "safety_observations_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_observations" ADD CONSTRAINT "safety_observations_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_scenarios" ADD CONSTRAINT "safety_scenarios_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenario_attempts" ADD CONSTRAINT "scenario_attempts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenario_attempts" ADD CONSTRAINT "scenario_attempts_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "safety_scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussions" ADD CONSTRAINT "discussions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussions" ADD CONSTRAINT "discussions_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "discussions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "discussion_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
