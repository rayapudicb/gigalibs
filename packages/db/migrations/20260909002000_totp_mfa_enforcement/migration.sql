BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE "sessions"
  ADD COLUMN "mfaVerifiedAt" TIMESTAMPTZ(3);

CREATE TABLE "totp_credentials" (
  "id" TEXT NOT NULL,
  "secretEnvelope" TEXT NOT NULL,
  "keyVersion" TEXT NOT NULL,
  "verifiedAt" TIMESTAMPTZ(3),
  "lastUsedStep" BIGINT,
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMPTZ(3),
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "totp_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "totp_credentials_userId_key" ON "totp_credentials"("userId");

ALTER TABLE "totp_credentials"
  ADD CONSTRAINT "totp_credentials_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
