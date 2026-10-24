-- WI-OI-120hq (R4, delegation & revocation): a delegated role assignment is bounded and attributed to the grantor.
-- Additive, nullable columns — an ordinary assignment leaves them null; a delegation sets all three.
BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE "member_role_assignments"
  ADD COLUMN "delegatedById" TEXT,
  ADD COLUMN "effectiveFrom" TIMESTAMPTZ(3),
  ADD COLUMN "effectiveTo"   TIMESTAMPTZ(3);

COMMIT;
