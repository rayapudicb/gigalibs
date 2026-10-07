-- WI-OI-120w (R2 slice 2c, Security review L2): an included role's foreign key is checked at the end of the
-- transaction, so a workspace removed as a whole removes both ends of an inclusion in any row order. Deleting an
-- included role on its own still fails at commit; the service refuses it before then (409 ROLE_INCLUDED).
BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE "custom_role_inclusions"
  ALTER CONSTRAINT "custom_role_inclusions_tenantId_includedRoleId_fkey" DEFERRABLE INITIALLY DEFERRED;

COMMIT;
