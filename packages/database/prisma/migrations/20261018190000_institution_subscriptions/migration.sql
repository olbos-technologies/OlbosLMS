-- AlterEnum
ALTER TYPE "EntitlementKey" ADD VALUE 'CAMPUS_MODULE';

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "billingEmail" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "websiteUrl" TEXT;

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "externalPriceId" TEXT;

-- CreateTable
CREATE TABLE "billing_checkouts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_webhook_events" (
    "id" TEXT NOT NULL,
    "organizationId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_checkouts_organizationId_key" ON "billing_checkouts"("organizationId");

-- CreateIndex
CREATE INDEX "billing_webhook_events_organizationId_processedAt_idx" ON "billing_webhook_events"("organizationId", "processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "plans_externalPriceId_key" ON "plans"("externalPriceId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_externalCustomerId_key" ON "subscriptions"("externalCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_externalSubId_key" ON "subscriptions"("externalSubId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_externalId_key" ON "invoices"("externalId");

-- AddForeignKey
ALTER TABLE "billing_checkouts" ADD CONSTRAINT "billing_checkouts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_checkouts" ADD CONSTRAINT "billing_checkouts_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_webhook_events" ADD CONSTRAINT "billing_webhook_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing paid-plan customers retain Campus creation features.
INSERT INTO "plan_entitlements" ("id", "planId", "key", "valueType", "boolValue")
SELECT gen_random_uuid(), "id", 'CAMPUS_MODULE'::"EntitlementKey", 'BOOLEAN'::"EntitlementValueType", true
FROM "plans" WHERE "tier" IN ('STARTER', 'PROFESSIONAL', 'ENTERPRISE')
ON CONFLICT ("planId", "key") DO NOTHING;
