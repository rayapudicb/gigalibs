-- WI-OI-120p slice 3 (R13): per-unit department role allowances (which custom roles a delegated head may assign in a
-- unit). Additive only — a new table, no change to existing ones.
BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE "department_role_allowances" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "customRoleId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "department_role_allowances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "department_role_allowances_unique" ON "department_role_allowances" ("tenantId", "unitId", "customRoleId");
CREATE INDEX "department_role_allowances_unit_idx" ON "department_role_allowances" ("tenantId", "unitId");

COMMIT;
