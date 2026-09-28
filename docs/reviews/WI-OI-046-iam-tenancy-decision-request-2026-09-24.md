# WI-OI-046 IAM/Tenancy decision request

Date: 2026-09-24  
Scope: SP-01 and SP-03 for bounded TP-1 Local Development  
Status: agent-executable precheck complete; named human decision pending

## Decision boundary

This is a pre-implementation architecture decision. It asks a named IAM/Tenancy reviewer to accept,
condition or reject the authority model that TP-1 must implement and prove. It does not claim TP-1 exists,
authorize G4 implementation, or authorize production, cloud, external release or TP-2–TP-6.

The Security & Privacy decision remains separate and pending. IAM acceptance cannot waive it.

## Current foundation verified

| Foundation | Current evidence | Disposition |
| --- | --- | --- |
| Authenticated tenant boundary | `TenantBoundaryGuard` derives the tenant from authenticated token/session state and rejects conflicting header, parameter, query or body tenant identifiers | Suitable foundation |
| Current tenant/member state | The guard reloads membership and tenant status and rejects inactive membership, invalid tenant state and expired trial state | Suitable foundation |
| Current user/permission state | `RbacService` reloads membership, user status, role and direct/custom permissions; token roles cannot grant permissions | Suitable foundation |
| Durable entitlement authority | Canonical `TenantModuleEntitlement` has tenant/module uniqueness, `ENABLED`/`DISABLED`, `startsAt` and `endsAt` | Suitable foundation |
| Session entitlement projection | Auth session context loads only enabled, started and unexpired entitlements | Useful projection, not sufficient as TP-1 request authority |
| Canonical catalogue key | `platformModuleCatalog` contains `tenant-access` | Correct authority key |
| Configuration runtime today | Existing endpoint requires `configuration-runtime:read` and authenticated tenant state but does not query durable `tenant-access` entitlement | Explicit TP-1 gap |
| Privileged preview today | No TP-1 privileged-preview endpoint/boundary exists | Explicit TP-1 gap |

The existing green baseline is therefore evidence of safe foundations only. It is not evidence that SP-01
or SP-03 is already implemented.

## Agent-executable baseline

- Ten authentication and tenancy test files passed: 86 tests.
- `@gigalibs/rbac-nest` TypeScript build passed.
- The previously recorded focused TP-1 pre-Build baseline remains PASS: 87 tests across 17 files plus
  builds, workflow typecheck and Configuration audits.
- Package-local `test` commands for `auth-nest`, `tenancy-nest` and `rbac-nest` are not valid evidence
  commands because the shared Vitest include paths are repository-root-relative. The 86 tests above were
  invoked from the repository root against their exact paths.

## SP-01 decision — entitlement authority

The reviewer must accept, amend or reject all of these rules:

1. Preserve the Configuration adapter identity
   `(tenant-settings, tenant-profile, profile-extension)`.
2. Map that identity in code to canonical entitlement key `tenant-access`; do not create a second
   entitlement or registry.
3. Before runtime resolution, require current active tenant, user and membership, required endpoint
   permission, and a durable entitlement satisfying:
   - `moduleKey = tenant-access`;
   - `status = ENABLED`;
   - `startsAt <= now`; and
   - `endsAt IS NULL OR endsAt > now`.
4. Evaluate authority from current server state. Browser/session projections may inform presentation but
   cannot be the sole authorization source.
5. Missing, disabled, future and expired entitlement states return the same sanitized denial contract.
6. `ALL_ENTITLED_USERS_V1` remains truthful only after this durable entitlement check.
7. Revocation must affect the next request without service restart.

## SP-03 decision — privileged preview

The reviewer must accept, amend or reject all of these rules:

1. Preview requires both `configuration-runtime:read` and `configuration:read`.
2. Preview remains bound to the authenticated tenant and current active user/membership.
3. Preview creates a durable, sanitized administrative-read audit event.
4. Preview never establishes normal cohort membership or bypasses the SP-01 entitlement boundary.
5. Environment, cohort, tenant and entitlement values are not accepted from the browser as authority.
6. Preview scope is excluded from metrics labels and safe errors.
7. Revocation must affect the next request without service restart.

## Required TP-1 verification

After Build, acceptance requires tests for:

- enabled, missing, disabled, future and expired `tenant-access` entitlement;
- suspended user, membership and tenant;
- missing each required permission and missing both permissions for preview;
- tenant/header/query/body tampering and cross-tenant identifiers;
- revocation after a successful request, without restart;
- safe indistinguishable denials before cache/manifest/database-detail disclosure;
- audit event creation for preview without sensitive fields; and
- proof that preview never grants normal cohort access or creates identity-bearing metric labels.

## Reviewer inspection commands

Run from `/Users/rayapudi/dev/gigalibs`:

```text
sed -n '678,698p' packages/db/schema.prisma
sed -n '1,115p' packages/contracts/src/modules/index.ts
sed -n '1,115p' packages/tenancy-nest/src/guards/tenant-boundary.guard.ts
sed -n '1,90p' packages/rbac-nest/src/rbac.service.ts
sed -n '280,390p' packages/auth-nest/src/auth.service.ts
sed -n '390,415p' apps/playground-api/src/configuration-studio.controller.ts
sed -n '1796,1840p' apps/playground-api/src/configuration-studio.service.ts
sed -n '14,44p' docs/reviews/WI-OI-046-sp01-sp07-resolution-request-2026-09-23.md
```

The reviewer should observe that the canonical primitives exist, while the current runtime service still
lacks the required durable entitlement query and the preview boundary remains future TP-1 work.

## Human decision form

```text
I, [full human name], reviewed WI-OI-046 as the independent IAM/Tenancy reviewer against
docs/reviews/WI-OI-046-iam-tenancy-decision-request-2026-09-24.md and the frozen WI-OI-046 design evidence.
My decision for SP-01 and SP-03 in the bounded Local Development TP-1 slice is
[Accept / Conditional / Reject]. I confirm that the current green tests prove only the existing authority
foundation and do not claim TP-1 is implemented. Conditions/findings: [exact text]. This does not waive
Security review or authorize G4 implementation, production, cloud, external release or TP-2–TP-6.
I am [independent / not independent] from the implementation producer. Date: [YYYY-MM-DD].
```

The reviewer must provide their professional responsibility and may not replace implementation evidence
with this design decision.
