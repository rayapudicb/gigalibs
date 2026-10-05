-- WI-OI-120e (U3.2, P1-20): password login is throttled per account. A row counts the failed logins for one
-- normalised email (stored only as its SHA-256), so unknown emails are counted the same way and the answers reveal no
-- accounts. Five failures within 15 minutes lock that email for 15 minutes; a successful login removes the row.

CREATE TABLE "login_throttles" (
  "emailHash" CHAR(64) NOT NULL,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "windowStartedAt" TIMESTAMPTZ(3) NOT NULL,
  "lockedUntil" TIMESTAMPTZ(3),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "login_throttles_pkey" PRIMARY KEY ("emailHash"),
  CONSTRAINT "login_throttles_hash_check" CHECK ("emailHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "login_throttles_count_check" CHECK ("failedCount" >= 0)
);

CREATE INDEX "login_throttles_updated_idx" ON "login_throttles" ("updatedAt");
