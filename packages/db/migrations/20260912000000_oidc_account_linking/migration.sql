-- WI-OI-013: distinguish sign-in authorization from an authenticated account-link request.
CREATE TYPE "OidcAuthorizationPurpose" AS ENUM ('LOGIN', 'LINK');

ALTER TABLE "oidc_login_transactions"
  ADD COLUMN "purpose" "OidcAuthorizationPurpose" NOT NULL DEFAULT 'LOGIN',
  ADD COLUMN "linkUserId" TEXT,
  ADD COLUMN "linkReason" TEXT;

ALTER TABLE "oidc_login_transactions"
  ADD CONSTRAINT "oidc_login_transactions_link_intent_check"
  CHECK (
    ("purpose" = 'LOGIN' AND "linkUserId" IS NULL AND "linkReason" IS NULL)
    OR
    ("purpose" = 'LINK' AND "linkUserId" IS NOT NULL AND char_length("linkReason") BETWEEN 3 AND 500)
  );

CREATE INDEX "oidc_login_transactions_linkUserId_purpose_expiresAt_idx"
  ON "oidc_login_transactions"("linkUserId", "purpose", "expiresAt");

ALTER TABLE "oidc_login_transactions"
  ADD CONSTRAINT "oidc_login_transactions_linkUserId_fkey"
  FOREIGN KEY ("linkUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
