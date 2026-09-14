BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE "tenant_members" ADD COLUMN "customRoleId" TEXT;

CREATE INDEX "tenant_members_customRoleId_idx" ON "tenant_members"("customRoleId");

ALTER TABLE "tenant_members"
  ADD CONSTRAINT "tenant_members_customRoleId_fkey"
  FOREIGN KEY ("customRoleId") REFERENCES "custom_roles"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
