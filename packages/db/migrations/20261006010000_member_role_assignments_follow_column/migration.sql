-- WI-OI-120w (R2 slice 1), Security review fixes.
-- M1: while `tenant_members.customRoleId` exists, an earlier release (during a deploy, or after a rollback) may still
-- write it. This trigger keeps the member's `MEMBER` assignment matching the column whoever writes it, so a role removed
-- through an earlier release cannot come back when the new release serves again. The new release says who changed the
-- role and why through transaction settings `app.role_change_actor` and `app.role_change_reason`; an earlier release
-- writes without them and is recorded as `system:customRoleId`. Slice 2 replaces this when a member may hold several
-- roles at their own scope.
-- L4: only `MEMBER` assignments exist until slice 2 gives explicit scopes.
BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE "member_role_assignments"
  ADD CONSTRAINT "member_role_assignments_member_scope_only" CHECK ("scope" = 'MEMBER');

CREATE FUNCTION "member_role_assignments_follow_column"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  actor TEXT := COALESCE(NULLIF(current_setting('app.role_change_actor', true), ''), 'system:customRoleId');
  why TEXT := COALESCE(NULLIF(current_setting('app.role_change_reason', true), ''), 'Role set through tenant_members.customRoleId');
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."customRoleId" IS NOT DISTINCT FROM OLD."customRoleId" THEN
    RETURN NEW;
  END IF;
  UPDATE "member_role_assignments"
     SET "revokedAt" = CURRENT_TIMESTAMP, "revokedById" = actor, "revokeReason" = why
   WHERE "tenantId" = NEW."tenantId" AND "userId" = NEW."userId" AND "scope" = 'MEMBER' AND "revokedAt" IS NULL
     AND "customRoleId" IS DISTINCT FROM NEW."customRoleId";
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

CREATE TRIGGER "tenant_members_custom_role_follow"
  AFTER INSERT OR UPDATE OF "customRoleId" ON "tenant_members"
  FOR EACH ROW EXECUTE FUNCTION "member_role_assignments_follow_column"();

-- Align once: a role changed through an earlier release after the previous migration and before this one.
UPDATE "member_role_assignments" a
   SET "revokedAt" = CURRENT_TIMESTAMP, "revokedById" = 'system:migration', "revokeReason" = 'Aligned with tenant_members.customRoleId'
  FROM "tenant_members" m
 WHERE a."tenantId" = m."tenantId" AND a."userId" = m."userId" AND a."scope" = 'MEMBER' AND a."revokedAt" IS NULL
   AND a."customRoleId" IS DISTINCT FROM m."customRoleId";
INSERT INTO "member_role_assignments" ("id", "tenantId", "userId", "customRoleId", "scope", "reason", "grantedById")
SELECT 'mra_' || md5(m."id" || ':' || m."customRoleId" || ':aligned'), m."tenantId", m."userId", m."customRoleId", 'MEMBER',
       'Aligned with tenant_members.customRoleId', 'system:migration'
  FROM "tenant_members" m
 WHERE m."customRoleId" IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM "member_role_assignments" a
    WHERE a."tenantId" = m."tenantId" AND a."userId" = m."userId" AND a."scope" = 'MEMBER' AND a."revokedAt" IS NULL
      AND a."customRoleId" = m."customRoleId"
 );

COMMIT;
