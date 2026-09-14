BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE "tenants"
  ADD COLUMN "customDomainChallengeDomain" TEXT,
  ADD COLUMN "customDomainVerificationDigest" TEXT,
  ADD COLUMN "customDomainChallengeExpiresAt" TIMESTAMPTZ(3),
  ADD COLUMN "customDomainVerifiedAt" TIMESTAMPTZ(3),
  ADD COLUMN "customDomainVerificationAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "customDomainVerificationLockedUntil" TIMESTAMPTZ(3);

-- Existing customDomain values predate ownership verification. Move them out of the
-- unique trusted-domain slot so an unverified legacy value cannot block its real owner.
UPDATE "tenants"
SET "customDomainChallengeDomain" = "customDomain",
    "customDomain" = NULL
WHERE "customDomain" IS NOT NULL;

COMMIT;
