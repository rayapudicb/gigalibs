-- WI-OI-120cf: the mobile v1 BFF. A mobile sign-in is an ordinary row in "sessions", so every revocation that already
-- ends sessions (logout, password change or reset, member removal, SCIM, identity revocation, the expiry sweep) ends
-- it too. These tables hold only what is mobile's own: the installation and app profile the session is bound to and
-- its rotating refresh token, the refresh tokens it has retired (a reused one revokes the session), MFA challenges
-- (no token is issued before the second factor) and the outcome of a workspace switch, so a retried switch answers
-- the same without rotating twice. Secrets are stored only as SHA-256 hashes, or encrypted.

CREATE TABLE "mobile_sessions" (
  "sessionId" TEXT NOT NULL,
  "appProfile" VARCHAR(100) NOT NULL,
  "installationId" UUID NOT NULL,
  "refreshTokenHash" CHAR(64) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "mobile_sessions_pkey" PRIMARY KEY ("sessionId"),
  CONSTRAINT "mobile_sessions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "mobile_sessions_refresh_hash_check" CHECK ("refreshTokenHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "mobile_sessions_revision_check" CHECK ("revision" >= 1)
);
CREATE UNIQUE INDEX "mobile_sessions_refreshTokenHash_key" ON "mobile_sessions" ("refreshTokenHash");

CREATE TABLE "mobile_retired_refresh_tokens" (
  "tokenHash" CHAR(64) NOT NULL,
  "sessionId" TEXT NOT NULL,
  "retiredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mobile_retired_refresh_tokens_pkey" PRIMARY KEY ("tokenHash"),
  CONSTRAINT "mobile_retired_refresh_tokens_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "mobile_sessions"("sessionId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "mobile_retired_refresh_tokens_hash_check" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$')
);
CREATE INDEX "mobile_retired_refresh_tokens_sessionId_idx" ON "mobile_retired_refresh_tokens" ("sessionId");

CREATE TABLE "mobile_mfa_challenges" (
  "challengeHash" CHAR(64) NOT NULL,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT,
  "appProfile" VARCHAR(100) NOT NULL,
  "installationId" UUID NOT NULL,
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mobile_mfa_challenges_pkey" PRIMARY KEY ("challengeHash"),
  CONSTRAINT "mobile_mfa_challenges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "mobile_mfa_challenges_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "mobile_mfa_challenges_hash_check" CHECK ("challengeHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "mobile_mfa_challenges_attempts_check" CHECK ("failedAttempts" >= 0)
);
CREATE INDEX "mobile_mfa_challenges_userId_idx" ON "mobile_mfa_challenges" ("userId");
CREATE INDEX "mobile_mfa_challenges_expiresAt_idx" ON "mobile_mfa_challenges" ("expiresAt");

CREATE TABLE "mobile_switch_outcomes" (
  "sessionId" TEXT NOT NULL,
  "idempotencyKey" UUID NOT NULL,
  "selectionHash" CHAR(64) NOT NULL,
  "tenantId" TEXT NOT NULL,
  "refreshTokenEnvelope" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mobile_switch_outcomes_pkey" PRIMARY KEY ("sessionId", "idempotencyKey"),
  CONSTRAINT "mobile_switch_outcomes_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "mobile_sessions"("sessionId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "mobile_switch_outcomes_hash_check" CHECK ("selectionHash" ~ '^[0-9a-f]{64}$')
);
CREATE INDEX "mobile_switch_outcomes_expiresAt_idx" ON "mobile_switch_outcomes" ("expiresAt");
