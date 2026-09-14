CREATE TYPE "MfaAssistedRecoveryStatus" AS ENUM ('REQUESTED', 'APPROVED', 'CONSUMED', 'REJECTED', 'EXPIRED');

CREATE TABLE "mfa_assisted_recoveries" (
  "id" TEXT NOT NULL,
  "status" "MfaAssistedRecoveryStatus" NOT NULL DEFAULT 'REQUESTED',
  "requestReason" TEXT NOT NULL,
  "identityEvidenceReference" TEXT NOT NULL,
  "grantDigest" TEXT,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "approvedAt" TIMESTAMPTZ(3),
  "consumedAt" TIMESTAMPTZ(3),
  "rejectedAt" TIMESTAMPTZ(3),
  "tenantId" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "approvedById" TEXT,
  "rejectedById" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "mfa_assisted_recoveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mfa_assisted_recoveries_reason_check" CHECK (char_length(btrim("requestReason")) BETWEEN 3 AND 500),
  CONSTRAINT "mfa_assisted_recoveries_evidence_check" CHECK (char_length(btrim("identityEvidenceReference")) BETWEEN 3 AND 500),
  CONSTRAINT "mfa_assisted_recoveries_requester_check" CHECK ("requestedById" <> "targetUserId"),
  CONSTRAINT "mfa_assisted_recoveries_approver_check" CHECK ("approvedById" IS NULL OR ("approvedById" <> "requestedById" AND "approvedById" <> "targetUserId")),
  CONSTRAINT "mfa_assisted_recoveries_grant_check" CHECK ("grantDigest" IS NULL OR "grantDigest" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "mfa_assisted_recoveries_lifecycle_check" CHECK (
    ("status" = 'REQUESTED' AND "grantDigest" IS NULL AND "approvedById" IS NULL AND "approvedAt" IS NULL AND "consumedAt" IS NULL AND "rejectedById" IS NULL AND "rejectedAt" IS NULL)
    OR ("status" = 'APPROVED' AND "grantDigest" IS NOT NULL AND "approvedById" IS NOT NULL AND "approvedAt" IS NOT NULL AND "consumedAt" IS NULL AND "rejectedById" IS NULL AND "rejectedAt" IS NULL AND "expiresAt" > "approvedAt")
    OR ("status" = 'CONSUMED' AND "grantDigest" IS NULL AND "approvedById" IS NOT NULL AND "approvedAt" IS NOT NULL AND "consumedAt" IS NOT NULL AND "rejectedById" IS NULL AND "rejectedAt" IS NULL)
    OR ("status" = 'REJECTED' AND "grantDigest" IS NULL AND "approvedById" IS NULL AND "approvedAt" IS NULL AND "consumedAt" IS NULL AND "rejectedById" IS NOT NULL AND "rejectedAt" IS NOT NULL)
    OR ("status" = 'EXPIRED' AND "grantDigest" IS NULL AND "consumedAt" IS NULL AND "rejectedById" IS NULL AND "rejectedAt" IS NULL)
  )
);

CREATE UNIQUE INDEX "mfa_assisted_recoveries_grantDigest_key" ON "mfa_assisted_recoveries"("grantDigest");
CREATE INDEX "mfa_assisted_recoveries_tenantId_status_createdAt_idx" ON "mfa_assisted_recoveries"("tenantId", "status", "createdAt");
CREATE INDEX "mfa_assisted_recoveries_targetUserId_status_idx" ON "mfa_assisted_recoveries"("targetUserId", "status");
CREATE UNIQUE INDEX "mfa_assisted_recoveries_one_active_target_idx" ON "mfa_assisted_recoveries"("tenantId", "targetUserId") WHERE "status" IN ('REQUESTED', 'APPROVED');

ALTER TABLE "mfa_assisted_recoveries" ADD CONSTRAINT "mfa_assisted_recoveries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mfa_assisted_recoveries" ADD CONSTRAINT "mfa_assisted_recoveries_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mfa_assisted_recoveries" ADD CONSTRAINT "mfa_assisted_recoveries_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mfa_assisted_recoveries" ADD CONSTRAINT "mfa_assisted_recoveries_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mfa_assisted_recoveries" ADD CONSTRAINT "mfa_assisted_recoveries_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
