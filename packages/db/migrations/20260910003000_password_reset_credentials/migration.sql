CREATE TABLE "password_reset_credentials" (
  "id" TEXT NOT NULL,
  "tokenDigest" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "usedAt" TIMESTAMPTZ(3),
  "userId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_reset_credentials_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "password_reset_credentials_reason_check"
    CHECK (char_length(btrim("reason")) BETWEEN 3 AND 500),
  CONSTRAINT "password_reset_credentials_expiry_check"
    CHECK ("expiresAt" > "createdAt"),
  CONSTRAINT "password_reset_credentials_use_check"
    CHECK ("usedAt" IS NULL OR "usedAt" >= "createdAt")
);

CREATE UNIQUE INDEX "password_reset_credentials_tokenDigest_key"
  ON "password_reset_credentials"("tokenDigest");
CREATE INDEX "password_reset_credentials_userId_expiresAt_idx"
  ON "password_reset_credentials"("userId", "expiresAt");
CREATE INDEX "password_reset_credentials_requestedById_createdAt_idx"
  ON "password_reset_credentials"("requestedById", "createdAt" DESC);

ALTER TABLE "password_reset_credentials"
  ADD CONSTRAINT "password_reset_credentials_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "password_reset_credentials"
  ADD CONSTRAINT "password_reset_credentials_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
