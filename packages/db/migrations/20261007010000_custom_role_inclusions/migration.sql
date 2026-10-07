-- WI-OI-120w (R2 slice 2c, ADR-0034 §2): a workspace custom role may include other roles of the same workspace; it
-- grants its own permissions and, transitively, those of the roles it includes, at the scope it is held. The service
-- keeps the graph acyclic and shallow (at most 5 deep, 10 inclusions a role) and refuses deleting an included role;
-- the database keeps both ends in one workspace, forbids self-inclusion and lists each pair once.
BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE "custom_role_inclusions" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "includedRoleId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "custom_role_inclusions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "custom_role_inclusions_not_self" CHECK ("roleId" <> "includedRoleId")
);

CREATE UNIQUE INDEX "custom_role_inclusions_roleId_includedRoleId_key" ON "custom_role_inclusions"("roleId", "includedRoleId");
CREATE INDEX "custom_role_inclusions_tenantId_includedRoleId_idx" ON "custom_role_inclusions"("tenantId", "includedRoleId");

-- Removing the including role removes its inclusions; an included role cannot go while included (checked at the end
-- of the statement, so a workspace removed as a whole removes both ends together).
ALTER TABLE "custom_role_inclusions" ADD CONSTRAINT "custom_role_inclusions_tenantId_roleId_fkey"
  FOREIGN KEY ("tenantId", "roleId") REFERENCES "custom_roles"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "custom_role_inclusions" ADD CONSTRAINT "custom_role_inclusions_tenantId_includedRoleId_fkey"
  FOREIGN KEY ("tenantId", "includedRoleId") REFERENCES "custom_roles"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

COMMIT;
