-- Preserve tenant identity in every hierarchy and membership relationship.
-- Existing rows must already satisfy these joins; the migration fails closed if they do not.

CREATE UNIQUE INDEX "departments_tenantId_id_key"
  ON "departments"("tenantId", "id");

ALTER TABLE "tenant_members"
  DROP CONSTRAINT "tenant_members_departmentId_fkey";

ALTER TABLE "tenant_members"
  ADD CONSTRAINT "tenant_members_tenantId_departmentId_fkey"
  FOREIGN KEY ("tenantId", "departmentId")
  REFERENCES "departments"("tenantId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "departments"
  DROP CONSTRAINT "departments_parentId_fkey";

ALTER TABLE "departments"
  ADD CONSTRAINT "departments_tenantId_parentId_fkey"
  FOREIGN KEY ("tenantId", "parentId")
  REFERENCES "departments"("tenantId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
