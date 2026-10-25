-- WI-OI-120p slice 4 (R13): a delegated invitation carries the custom roles and the unit to grant on acceptance.
-- Additive, nullable/defaulted columns on tenant_invites — an ordinary base-role invite leaves them empty/null.
BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE "tenant_invites"
  ADD COLUMN "customRoleIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "unitId" TEXT;

COMMIT;
