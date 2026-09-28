-- Phase 2 / US-P2-01: Dual-Mode Dynamic Form Engine & Public Questionnaire Portal
-- Adds operational spatial node bindings, public shareable slug, mobile offline idempotency keys, and device metadata.

-- 1. Alter form_schemas
ALTER TABLE "form_schemas"
  ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'OPERATIONAL',
  ADD COLUMN IF NOT EXISTS "isPublic" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "publicSlug" TEXT,
  ADD COLUMN IF NOT EXISTS "spatialNodeId" TEXT,
  ADD COLUMN IF NOT EXISTS "equipmentTag" TEXT,
  ADD COLUMN IF NOT EXISTS "targetWorkflowId" TEXT,
  ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'OPERATIONAL';

CREATE UNIQUE INDEX IF NOT EXISTS "form_schemas_publicSlug_key" ON "form_schemas"("publicSlug") WHERE "publicSlug" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "form_schemas_spatialNodeId_idx" ON "form_schemas"("spatialNodeId");

-- 2. Alter form_submissions
ALTER TABLE "form_submissions"
  ADD COLUMN IF NOT EXISTS "submissionMode" TEXT NOT NULL DEFAULT 'OPERATIONAL',
  ADD COLUMN IF NOT EXISTS "spatialNodeId" TEXT,
  ADD COLUMN IF NOT EXISTS "equipmentTag" TEXT,
  ADD COLUMN IF NOT EXISTS "clientSubmissionId" TEXT,
  ADD COLUMN IF NOT EXISTS "ipAddress" TEXT,
  ADD COLUMN IF NOT EXISTS "deviceMetadata" JSONB,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'SUBMITTED';

CREATE UNIQUE INDEX IF NOT EXISTS "form_submissions_clientSubmissionId_key" ON "form_submissions"("clientSubmissionId") WHERE "clientSubmissionId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "form_submissions_spatialNodeId_idx" ON "form_submissions"("spatialNodeId");
