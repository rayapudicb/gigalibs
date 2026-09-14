BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE "mfa_recovery_codes" (
  "id" TEXT NOT NULL,
  "codeDigest" TEXT NOT NULL,
  "usedAt" TIMESTAMPTZ(3),
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mfa_recovery_codes_userId_codeDigest_key"
  ON "mfa_recovery_codes"("userId", "codeDigest");

CREATE INDEX "mfa_recovery_codes_userId_usedAt_idx"
  ON "mfa_recovery_codes"("userId", "usedAt");

ALTER TABLE "mfa_recovery_codes"
  ADD CONSTRAINT "mfa_recovery_codes_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
