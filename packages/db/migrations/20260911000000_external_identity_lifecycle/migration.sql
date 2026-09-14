-- WI-OI-013: retain proof-based OIDC bindings while allowing explicit revocation and reactivation.
CREATE TYPE "ExternalIdentityStatus" AS ENUM ('ACTIVE', 'REVOKED');

ALTER TABLE "external_identities"
  ADD COLUMN "status" "ExternalIdentityStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "statusReason" TEXT,
  ADD COLUMN "revokedAt" TIMESTAMPTZ(3),
  ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DROP INDEX "external_identities_configurationId_userId_key";

CREATE INDEX "external_identities_configurationId_userId_status_idx"
  ON "external_identities"("configurationId", "userId", "status");

ALTER TABLE "external_identities"
  ADD CONSTRAINT "external_identities_lifecycle_check"
  CHECK (
    ("status" = 'ACTIVE' AND "revokedAt" IS NULL)
    OR
    ("status" = 'REVOKED' AND "revokedAt" IS NOT NULL)
  );
