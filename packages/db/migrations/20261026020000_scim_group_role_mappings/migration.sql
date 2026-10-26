-- WI-OI-120 (R15): directory (IdP) groups mapped to scoped custom roles. Reuses the existing MemberRoleScope enum.
-- Relation-free like department_role_allowances; the service validates role and scope at reconcile time.

CREATE TABLE "scim_group_role_mappings" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "externalGroupId" TEXT NOT NULL,
  "customRoleId" TEXT NOT NULL,
  "scope" "MemberRoleScope" NOT NULL,
  "unitIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "scim_group_role_mappings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "scim_group_role_mappings_scope_check" CHECK ("scope" IN ('WORKSPACE', 'UNITS')),
  CONSTRAINT "scim_group_role_mappings_units_check" CHECK (
    ("scope" = 'UNITS' AND array_length("unitIds", 1) >= 1)
    OR ("scope" = 'WORKSPACE' AND array_length("unitIds", 1) IS NULL)
  )
);

CREATE UNIQUE INDEX "scim_group_role_mappings_unique"
  ON "scim_group_role_mappings"("tenantId", "externalGroupId", "customRoleId");
CREATE INDEX "scim_group_role_mappings_group_idx"
  ON "scim_group_role_mappings"("tenantId", "externalGroupId");
