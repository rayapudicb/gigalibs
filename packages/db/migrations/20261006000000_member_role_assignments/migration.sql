-- WI-OI-120w (R2 slice 1, ADR-0034): a member holds several role assignments, each a custom role (module roles are
-- custom roles) held at a scope. Assignments are granted and revoked, never edited, so the history stays.
-- Scope `MEMBER` is the member's own scope exactly as today (organization grants, the legacy department, or places);
-- `WORKSPACE`, `UNITS` and `PLACES` are given from slice 2. The move below turns each member's single custom role
-- into one `MEMBER` assignment, so no one's access changes (owner, 2026-10-06). `tenant_members.customRoleId` is kept
-- until a later card drops it.
BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TYPE "MemberRoleScope" AS ENUM ('MEMBER', 'WORKSPACE', 'UNITS', 'PLACES');

-- An assignment names a role of its own tenant.
ALTER TABLE "custom_roles" ADD CONSTRAINT "custom_roles_tenantId_id_key" UNIQUE ("tenantId", "id");

CREATE TABLE "member_role_assignments" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "customRoleId" TEXT NOT NULL,
  "scope" "MemberRoleScope" NOT NULL,
  "unitIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "placeIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "reason" VARCHAR(500) NOT NULL,
  "grantedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMPTZ(3),
  "revokedById" TEXT,
  "revokeReason" VARCHAR(500),
  CONSTRAINT "member_role_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "member_role_assignments_member_fkey" FOREIGN KEY ("userId", "tenantId")
    REFERENCES "tenant_members"("userId", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
  -- Deleting a custom role removes its assignments, as it cleared `customRoleId` before.
  CONSTRAINT "member_role_assignments_role_fkey" FOREIGN KEY ("tenantId", "customRoleId")
    REFERENCES "custom_roles"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "member_role_assignments_scope_check" CHECK (
    ("scope" = 'UNITS' AND cardinality("unitIds") > 0 AND cardinality("placeIds") = 0)
    OR ("scope" = 'PLACES' AND cardinality("placeIds") > 0 AND cardinality("unitIds") = 0)
    OR ("scope" IN ('MEMBER', 'WORKSPACE') AND cardinality("unitIds") = 0 AND cardinality("placeIds") = 0)
  ),
  CONSTRAINT "member_role_assignments_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 3 AND 500),
  CONSTRAINT "member_role_assignments_revocation_check" CHECK (
    ("revokedAt" IS NULL) = ("revokedById" IS NULL) AND ("revokedAt" IS NULL) = ("revokeReason" IS NULL)
  )
);

CREATE INDEX "member_role_assignments_member_idx" ON "member_role_assignments"("tenantId", "userId");
CREATE INDEX "member_role_assignments_role_idx" ON "member_role_assignments"("tenantId", "customRoleId");
-- A member holds a role at one scope once.
CREATE UNIQUE INDEX "member_role_assignments_live_key" ON "member_role_assignments"
  ("tenantId", "userId", "customRoleId", "scope", "unitIds", "placeIds") WHERE "revokedAt" IS NULL;

-- The move: each member's single custom role becomes one assignment at the member's own scope. The id is derived from
-- the membership and the role, so the move is the same wherever it runs.
INSERT INTO "member_role_assignments" ("id", "tenantId", "userId", "customRoleId", "scope", "reason", "grantedById")
SELECT 'mra_' || md5(m."id" || ':' || m."customRoleId"), m."tenantId", m."userId", m."customRoleId", 'MEMBER',
       'Moved from the member''s single custom role (WI-OI-120w, ADR-0034 §7)', 'system:migration'
FROM "tenant_members" m
WHERE m."customRoleId" IS NOT NULL;

COMMIT;
