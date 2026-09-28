# WI-OI-046 IAM/Tenancy — Human Reviewer Checklist

**Date:** 2026-09-24  
**Reviewer role:** Independent IAM/Tenancy  
**Work item:** WI-OI-046 — Tenant Profile TP-1 Local Development  
**Scope:** SP-01 (entitlement authority) and SP-03 (privileged preview)  
**Preparation note:** Agent B produced the initial standalone draft under
`docs/plans/WI-OI-046-parallel-review-agent-b-prompt.md`; the primary agent subsequently reconciled its
commands and claims against the repository. It remains a human execution guide only. No implementation
was created and no status was changed.

---

## Before you begin

1. Confirm you are **not** a producer of WI-OI-046 implementation code.
2. Read `docs/reviews/WI-OI-046-iam-tenancy-decision-request-2026-09-24.md` in full before using
   this checklist.
3. Read the frozen design document `docs/reviews/WI-OI-046-sp01-sp07-resolution-request-2026-09-23.md`
   lines 14–44.
4. This checklist does not authorize G4 implementation, production, cloud, external release, or
   TP-2–TP-6. Your completed decision records the pre-Build IAM/Tenancy disposition only.

---

## Section 1 — Agent-verified baseline (confirm, do not re-run unless you choose to)

The IAM-specific results were revalidated by the primary agent on 2026-09-24. The separate broader
Configuration result is recorded in `docs/audits/2026-09-24-wi-oi-046-focused-prebuild-baseline.md`.
You may optionally re-run the commands from `/Users/rayapudi/dev/gigalibs` to independently confirm.

| # | Claimed result | Re-run command | Your independent result |
|---|----------------|----------------|------------------------|
| 1.1 | Ten IAM/tenancy test files: **86 tests PASS** | `pnpm --config.verify-deps-before-run=false exec vitest run --config vitest.config.ts packages/auth-nest/src/mfa-assisted-recovery.service.spec.ts packages/auth-nest/src/guards/jwt-auth.guard.spec.ts packages/auth-nest/src/guards/platform-context.guard.spec.ts packages/auth-nest/src/oidc-network-policy.test.ts packages/tenancy-nest/src/guards/tenant-boundary.guard.spec.ts packages/tenancy-nest/src/platform-module-catalog.spec.ts packages/tenancy-nest/src/departments.test.ts packages/tenancy-nest/src/domain-verification.test.ts packages/tenancy-nest/src/platform-authority.test.ts packages/tenancy-nest/src/guards/platform-authority.guard.spec.ts` | ☐ PASS / ☐ FAIL |
| 1.2 | `@gigalibs/rbac-nest` TypeScript build: **PASS** | `pnpm --config.verify-deps-before-run=false --filter @gigalibs/rbac-nest build` | ☐ PASS / ☐ FAIL |
| 1.3 | Broader focused baseline: **87 tests across 17 files PASS** | See `docs/audits/2026-09-24-wi-oi-046-focused-prebuild-baseline.md` | ☐ Confirmed / ☐ Discrepancy |

**Important:** These green results prove the existing authority foundation only. They do **not** prove
SP-01 or SP-03 is implemented; the decision request explicitly records both as future TP-1 gaps.

---

## Section 2 — Source code inspection

Run each `sed` command from `/Users/rayapudi/dev/gigalibs` and inspect the output:

### 2.1 — DB schema: TenantModuleEntitlement

```
sed -n '678,698p' packages/db/schema.prisma
```

Check that you see:
- [ ] A model named `TenantModuleEntitlement` (or equivalent canonical name)
- [ ] Fields: `tenantId`, `moduleKey`, `status` (ENABLED/DISABLED), `startsAt`, `endsAt`
- [ ] A unique constraint on `(tenantId, moduleKey)` or equivalent composite key
- [ ] No field that could allow a caller-supplied override of authority values

**Your finding:**

```
[paste output here]
```

### 2.2 — Contracts: platformModuleCatalog and tenant-access key

```
sed -n '1,115p' packages/contracts/src/modules/index.ts
```

Check that you see:
- [ ] `platformModuleCatalog` export containing `tenant-access` as a canonical entry
- [ ] No second entitlement key or duplicate registry for the Configuration identity
- [ ] The Configuration adapter identity (`tenant-settings`, `tenant-profile`, `profile-extension`)
      is NOT in this module catalog (it is a surface-level identity, not a module key)

**Your finding:**

```
[paste output here]
```

### 2.3 — TenantBoundaryGuard tests

```
sed -n '1,115p' packages/tenancy-nest/src/guards/tenant-boundary.guard.spec.ts
```

Verify the following behavior is tested:
- [ ] Public routes bypass tenant enforcement (no DB call)
- [ ] A conflicting `x-tenant-id` header that differs from the authenticated token `tid` is **rejected** (ForbiddenException)
- [ ] Inactive tenant status (PROVISIONING by default, TRIAL with expired date) is rejected
- [ ] Only the minimal required fields are selected from the DB (no credential or secret fields)
- [ ] `skipTenantBoundary` metadata exists for user-scoped discovery only (must not be misused)

**Your finding (check all that apply):**
- [ ] Header/query/body tenant override → rejected
- [ ] Inactive membership → rejected  
- [ ] Expired trial → rejected
- [ ] Provisioning tenant blocked by default
- [ ] Minimal DB select confirmed

### 2.4 — RbacService

```
sed -n '1,90p' packages/rbac-nest/src/rbac.service.ts
```

Verify:
- [ ] Token roles (`_fallbackRoles`) are **not** used as a permission source
- [ ] Permissions are always reloaded from the database with current `ACTIVE` membership and user status
- [ ] `status === 'ACTIVE'` check exists for both `member.status` and `member.user.status`
- [ ] Custom role permissions pass through a regex filter (no arbitrary strings)
- [ ] The `platform:` permission namespace is excluded from standard grants

**Your finding:**

```
[paste key lines here]
```

### 2.5 — AuthService: session entitlement projection

```
sed -n '280,390p' packages/auth-nest/src/auth.service.ts
```

Verify:
- [ ] Session entitlement projection loads only `ENABLED` entitlements
- [ ] Entitlements with `startsAt > now` are excluded (future entitlements not yet active)
- [ ] Entitlements with `endsAt IS NOT NULL AND endsAt <= now` are excluded (expired)
- [ ] The session projection is noted as **not sufficient** as TP-1 request authority
  (i.e., runtime resolution must query durable `TenantModuleEntitlement`, not rely on session data)

**Your finding:**

```
[paste key lines here]
```

### 2.6 — Configuration Studio controller: current runtime gap

```
sed -n '390,415p' apps/playground-api/src/configuration-studio.controller.ts
```

Verify you can observe:
- [ ] The current endpoint requires `configuration-runtime:read` permission
- [ ] The current endpoint does **not** query `TenantModuleEntitlement` (this is the explicit TP-1 gap)
- [ ] No privileged-preview boundary exists yet (expected — TP-1 gap)

**Your finding:**

```
[paste key lines here]
```

### 2.7 — Configuration Studio service: current runtime behavior

```
sed -n '1796,1840p' apps/playground-api/src/configuration-studio.service.ts
```

Verify:
- [ ] The service resolves the manifest without a durable entitlement query (confirming the TP-1 gap)
- [ ] The service receives environment/cohort strings already parsed upstream and uses them directly in
      the manifest scope; the current Zod query schema, not this method, applies silent defaults
- [ ] No credential or secret field is accessed

**Your finding:**

```
[paste key lines here]
```

---

## Section 3 — SP-01 authority rules decision

For each rule below, mark **Accept**, **Conditional** (note your condition), or **Reject** (note your reason):

| Rule | Your decision |
|------|---------------|
| 3.1 Preserve adapter identity `(tenant-settings, tenant-profile, profile-extension)` | ☐ Accept / ☐ Conditional / ☐ Reject |
| 3.2 Map that identity to canonical entitlement key `tenant-access`; no second entitlement or registry | ☐ Accept / ☐ Conditional / ☐ Reject |
| 3.3 Before runtime resolution: require active tenant, user, membership, required permission, **and** durable entitlement (`moduleKey=tenant-access`, `status=ENABLED`, `startsAt<=now`, `endsAt IS NULL OR endsAt>now`) | ☐ Accept / ☐ Conditional / ☐ Reject |
| 3.4 Evaluate authority from current server state; browser/session projections inform presentation only | ☐ Accept / ☐ Conditional / ☐ Reject |
| 3.5 Missing, disabled, future, and expired entitlement states return the same sanitized denial contract | ☐ Accept / ☐ Conditional / ☐ Reject |
| 3.6 `ALL_ENTITLED_USERS_V1` flag remains truthful only after the durable entitlement check | ☐ Accept / ☐ Conditional / ☐ Reject |
| 3.7 Revocation must affect the next request without service restart | ☐ Accept / ☐ Conditional / ☐ Reject |

**Conditions or findings for SP-01:**

```
[your text here]
```

---

## Section 4 — SP-03 privilege preview rules decision

| Rule | Your decision |
|------|---------------|
| 4.1 Preview requires both `configuration-runtime:read` AND `configuration:read` | ☐ Accept / ☐ Conditional / ☐ Reject |
| 4.2 Preview remains bound to authenticated tenant and current active user/membership | ☐ Accept / ☐ Conditional / ☐ Reject |
| 4.3 Preview creates a durable, sanitized administrative-read audit event | ☐ Accept / ☐ Conditional / ☐ Reject |
| 4.4 Preview never establishes normal cohort membership or bypasses the SP-01 entitlement boundary | ☐ Accept / ☐ Conditional / ☐ Reject |
| 4.5 Environment, cohort, tenant and entitlement values are never accepted from the browser as authority | ☐ Accept / ☐ Conditional / ☐ Reject |
| 4.6 Preview scope is excluded from metrics labels and safe errors | ☐ Accept / ☐ Conditional / ☐ Reject |
| 4.7 Revocation must affect the next request without service restart | ☐ Accept / ☐ Conditional / ☐ Reject |

**Conditions or findings for SP-03:**

```
[your text here]
```

---

## Section 5 — Post-Build evidence requirements

After an authorized Build, confirm you will require the following before closing this workstream:

- [ ] Test for **enabled** `tenant-access` entitlement (success path)
- [ ] Test for **missing** `tenant-access` entitlement → sanitized denial
- [ ] Test for **disabled** entitlement → same sanitized denial as missing
- [ ] Test for **future** entitlement (`startsAt > now`) → same sanitized denial
- [ ] Test for **expired** entitlement (`endsAt <= now`) → same sanitized denial
- [ ] Test for suspended user → denial without revealing other user state
- [ ] Test for suspended membership → denial
- [ ] Test for suspended/inactive tenant → denial
- [ ] Test for missing `configuration-runtime:read` permission
- [ ] Test for missing `configuration:read` permission (preview path)
- [ ] Test for missing both permissions (preview path)
- [ ] Test for tenant/header/query/body tampering with cross-tenant identifiers
- [ ] Test for revocation after a successful request, without service restart
- [ ] Test for safe indistinguishable denials before any cache, manifest, or database detail disclosure
- [ ] Test for audit event creation on preview without sensitive fields
- [ ] Test proving preview never grants normal cohort access
- [ ] Test proving preview never creates identity-bearing metric labels

---

## Section 6 — Human decision

Complete this form and provide it to the primary agent for attachment to the WI-OI-046 decision record.
**Do not modify the form text; fill in only the bracketed fields.**

```
I, [full human name], reviewed WI-OI-046 as the independent IAM/Tenancy reviewer against
docs/reviews/WI-OI-046-iam-tenancy-decision-request-2026-09-24.md and the frozen WI-OI-046 design evidence.
My decision for SP-01 and SP-03 in the bounded Local Development TP-1 slice is
[Accept / Conditional / Reject]. I confirm that the current green tests prove only the existing authority
foundation and do not claim TP-1 is implemented. Conditions/findings: [exact text or "None"]. This does
not waive Security review or authorize G4 implementation, production, cloud, external release or TP-2–TP-6.
I am [independent / not independent] from the implementation producer. Date: [YYYY-MM-DD].
```

---

*Initially drafted by Agent B and reconciled by the primary agent on 2026-09-24. Neither agent has
authority to close this review or mark human acceptance. WI-OI-046 remains Proposed and no implementation
was created by this checklist work.*
