-- WI-OI-120w (R2 slice 2a): a member may hold several roles at their own scope. `tenant_members.customRoleId` becomes the
-- member's oldest live `MEMBER` role, kept for display and for an earlier release. A change of the column (from any
-- release) now revokes only the role the column named and grants the one it names; the member's other roles stay.
-- Explicit scopes stay refused (`member_role_assignments_member_scope_only`) until slice 2b.
BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION "member_role_assignments_follow_column"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public
AS $$
DECLARE
  actor TEXT := COALESCE(NULLIF(current_setting('app.role_change_actor', true), ''), 'system:customRoleId');
  why TEXT := COALESCE(NULLIF(current_setting('app.role_change_reason', true), ''), 'Role set through tenant_members.customRoleId');
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."customRoleId" IS NOT DISTINCT FROM OLD."customRoleId" THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."customRoleId" IS NOT NULL THEN
    UPDATE "member_role_assignments"
       SET "revokedAt" = CURRENT_TIMESTAMP, "revokedById" = actor, "revokeReason" = why
     WHERE "tenantId" = NEW."tenantId" AND "userId" = NEW."userId" AND "scope" = 'MEMBER' AND "revokedAt" IS NULL
       AND "customRoleId" = OLD."customRoleId";
  END IF;
  IF NEW."customRoleId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "member_role_assignments"
     WHERE "tenantId" = NEW."tenantId" AND "userId" = NEW."userId" AND "scope" = 'MEMBER' AND "revokedAt" IS NULL
       AND "customRoleId" = NEW."customRoleId"
  ) THEN
    INSERT INTO "member_role_assignments" ("id", "tenantId", "userId", "customRoleId", "scope", "reason", "grantedById")
    VALUES ('mra_' || md5(gen_random_uuid()::text), NEW."tenantId", NEW."userId", NEW."customRoleId", 'MEMBER', why, actor);
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
