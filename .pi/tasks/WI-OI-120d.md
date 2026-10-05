# WI-OI-120d (U3.1): Close the SCIM tenant and role-elevation defect

- **Status:** Review (implementation verified 2026-10-05; independent Security/QA pending)
- **Work item:** WI-OI-120; first bounded slice of U3, targeting audit P0-06 only.
- **Size:** M
- **Routing:** SDLC Orchestrator → Tenant Identity Access / Backend → independent Security and QA review.
- **Requirements:** FR-14; NFR-SEC-001, NFR-SEC-002, NFR-DATA-001–004, NFR-OBS-001–004.

## Goal

An authorized tenant administrator can provision and manage users through SCIM inside the verified tenant.
An ordinary member cannot create, elevate, suspend or delete memberships; supplied tenant IDs cannot change
authority; SCIM cannot grant platform/super-admin authority or bypass existing membership safeguards.

## Scope

- **May change:** `apps/playground-api/src/scim.controller.ts`, `scim.service.ts`, adjacent SCIM validation/helpers
  and tests; narrowly necessary SCIM dependency registration in `app.module.ts`; shared membership helper/test
  changes in `packages/tenancy-nest/src/` only to reuse existing last-administrator, audit and revocation semantics;
  SCIM's direct dependencies in the API package manifest/lockfile and isolated SCIM test runner;
  this card, `.pi/NOW.md`, WI-OI-120's registry/evidence and the audit's SCIM status/evidence.
- **Must not change:** U2 ERP implementation, metadata architecture, global RBAC fallback policy, other U3 defects,
  schemas/applied migrations, secrets, UAT data/services, deployment files, CMMS import/export, other agents' work
  or protected untracked material. No new external IdP/service-account integration in this slice.

## Read first

`.pi/NOW.md`; `.pi/PLAN.md` lifecycle; WI-OI-120's registry row; requirement IDs above; SDLC G3–G5 and DoD;
module-completeness DoD; `.pi/agents/tenant_identity_access/AGENT.md` and
`.pi/agents/agile_delivery_orchestrator/AGENT.md`; existing SCIM implementation, global auth/tenant/RBAC guards,
tenant-member DTOs and `TenancyService.updateMember`; WI-OI-119 P0-06 evidence.

## Steps

1. Reproduce missing permissions, fallback tenant and unrestricted create/PATCH role input with regression tests.
   Record the read/create/update/delete permission matrix using the existing tenant-administration policy.
2. Resolve tenant/actor exclusively from verified request context; require it for Users/Groups. Keep public SCIM
   schema/discovery endpoints separate. Caller identifiers may be checked for consistency, never used as authority.
3. Validate supported create/PATCH inputs and tenant-role assignments. Reject platform-only/unknown roles and
   malformed/unsupported mutation input. Enforce a named server permission on every Users/Groups action.
4. Reuse existing membership invariants: scoped writes, last-active-admin protection, suspension/removal and role
   change revocation, actor-attributed audit. Cover create-upsert, PATCH and DELETE so none bypasses the safeguards.
   Avoid global-user or other-tenant side effects for an existing multi-tenant user.
5. Test through the actual HTTP controller and guard chain, plus service regressions. Use an explicitly isolated
   database for persistence/concurrency proof; never default to the owner's database. Run `pnpm verify`, recording
   skipped infrastructure checks as NOT RUN. Hand off for independent review; no deployment or self-certification.

## Done when

- [x] Anonymous/missing-tenant requests fail; an ordinary member cannot mutate Users; read-only permission cannot write.
- [x] Spoofed header/query/body tenant and cross-tenant resource IDs fail without another tenant's data changing.
- [x] Create and each supported PATCH form reject prohibited roles; authorized tenant-role changes still work.
- [x] Provision/read/update/deprovision persists through reload; last-admin protection, affected-session revocation,
  actor audit and isolation of an existing user's other memberships have positive/negative evidence.
- [x] Concurrent admin removals cannot remove the last active administrator; repeated requests have documented safe results.
- [x] `pnpm verify` passes or reports only known drift; all unavailable integration checks remain explicit.
- [ ] Independent Security/QA review recorded before P0-06 is marked closed. Implementation alone returns to Review.
- [x] Evidence and NOW updated; no commit, deploy or production-gate upgrade without the required owner authority.

Evidence: `.pi/work/WI-OI-120.md` U3.1 section. Targeted tests 27/27; full verification passed with one known
deployment drift and eight unrelated isolated proofs NOT RUN. P0-06 remains pending independent review.

## Stop and ask if

A new role/provisioning policy is needed, a fix requires unrelated auth changes or a migration, or a check would
write to UAT. Missing isolated infrastructure is recorded honestly, not replaced by a database mock certificate.

## Report

At most five bullets: files/behavior changed, passing/NOT RUN evidence, remaining review/deployment, next slice
and any owner decision. This card does not claim all of U3 is complete.
