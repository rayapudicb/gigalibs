-- WI-OI-120w (R2 slice 2b, ADR-0034 §1 and §6): a role may be held at an explicit scope (the whole workspace, some
-- units, some places) besides the member's own. The service gives explicit scopes (Tenant Admins only), validates the
-- units and refuses any combination that would widen a module that still reads one scope per request. Here the
-- MEMBER-only constraint from slice 1 is lifted; the scope check from 20261006000000 stays, and the id lists are bounded
-- as the signed context bounds them.
BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE "member_role_assignments" DROP CONSTRAINT "member_role_assignments_member_scope_only";

ALTER TABLE "member_role_assignments"
  ADD CONSTRAINT "member_role_assignments_scope_size" CHECK (cardinality("unitIds") <= 200 AND cardinality("placeIds") <= 50);

COMMIT;
