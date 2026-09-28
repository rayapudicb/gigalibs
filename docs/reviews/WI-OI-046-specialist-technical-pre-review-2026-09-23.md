# WI-OI-046 specialist technical pre-review

Date: 2026-09-23  
Status: Agent-prepared findings; not human acceptance  
Scope: Security, IAM/Tenancy, API Contracts, Web/Accessibility and QA/SDET review of D1–D6

## Conclusion

The bounded TP-1 direction is sound, but the packet is not ready for specialist acceptance without seven
explicit conditions below. Two are material architecture/API clarifications: the adapter's
`tenant-settings` identity does not match the canonical entitlement key `tenant-access`, and adding scope
fields to the existing strict response would break strict v1 decoders. These must be resolved before G4
entry rather than improvised during implementation.

This review does not change Product/Solution Architecture's recorded D1–D6 acceptance and does not supply
any missing human specialist decision.

## Evidence inspected

- current strict activation/runtime schemas and response schemas;
- current runtime controller permissions and service cache/database path;
- tenant-boundary and RBAC guards plus live membership permission resolution;
- the canonical module catalogue and durable tenant-module entitlement model;
- generic authenticated BFF forwarding and bounded request behavior;
- `ConfiguredTenantFields` and Tenant Settings permission projection;
- eager fail-fast runtime configuration; and
- the 87-test focused pre-Build baseline and Configuration audits.

## Mandatory specialist conditions

### SP-01 — Canonical entitlement mapping

The accepted adapter identity is `tenant-settings`, but the canonical entitlement catalogue key for the
Settings journey is `tenant-access`. No `tenant-settings` entitlement exists. The current Configuration
runtime endpoint proves active tenant membership/status and `configuration-runtime:read`; it does not
perform a durable module-entitlement check.

Recommended decision:

- preserve `(tenant-settings, tenant-profile, profile-extension)` for Configuration compatibility;
- add a code-owned adapter field or policy mapping `entitlementModuleKey: tenant-access`;
- require a currently enabled, in-window `TenantModuleEntitlement` for `tenant-access`, active tenant/user/
  membership and the endpoint permission before resolving `ALL_ENTITLED_USERS_V1`; and
- return the same safe denied result for disabled/missing/expired entitlement and unauthorized scope.

If Product intends permission-only access, rename the policy to `ALL_AUTHORIZED_TENANT_USERS_V1` and obtain
new Product/Architecture acceptance. Do not call a permission-only policy "entitled".

Required humans: IAM/Tenancy, Security, API Contracts and Product/Architecture for any amended name/model.

### SP-02 — Strict wire compatibility

`ConfigurationRuntimeManifestResponseSchema` is strict and contains only activation/version/time,
manifest and checksum. Adding resolved environment/cohort/policy fields to that response is not backward
compatible for strict v1 decoders.

Recommended decision:

- `/runtime/manifest/current` uses a separately named/versioned strict response that includes resolved
  scope evidence;
- legacy `/runtime/manifest` returns the exact existing response shape during the compatibility window;
- legacy environment/cohort values are optional assertions only, and a mismatch denies before cache/DB
  lookup;
- add documented `Deprecation` and `Sunset` behavior plus a measurable removal condition; and
- prove both old strict fixtures and the new strict fixture.

Required humans: API Contracts, Architecture and QA/SDET.

### SP-03 — Preview authority and evidence

Privileged preview must require both `configuration-runtime:read` and `configuration:read`; the RBAC guard
already supports all-required permission checks. It must retain the authenticated tenant boundary, record
a durable sanitized administrative-read audit event, and never establish normal cohort membership.
Environment/cohort values must not appear in metrics labels or unsafe errors.

Required humans: Security, IAM/Tenancy and API Contracts.

### SP-04 — Visible web state machine

The current `ConfiguredTenantFields` returns `null` whenever no runtime is loaded. A 404 also returns
without setting an explicit state. More importantly, a load error sets `status`, but the early
`if (!runtime) return null` prevents that error from rendering. The current UI therefore hides absent,
denied and dependency-failure states.

Require a typed state machine covering `loading`, `absent`, `denied`, `invalid-scope`, `retryable-error`,
`ready`, `saving`, `conflict` and `saved`. Provide visible retry, accessible live announcements, predictable
focus, cancellation/stale-response protection and no fabricated empty manifest/value fallback.

Required humans: Web/Accessibility, Product and QA/SDET.

### SP-05 — Stable safe errors

The current service often throws string-only Nest exceptions. TP-1's five stable error codes require a
versioned error envelope and contract tests. Unknown adapter, entitlement denial, legacy assertion mismatch
and missing manifest must not reveal whether another tenant, activation, permission or entitlement exists.

Required humans: Security, API Contracts and QA/SDET.

### SP-06 — Deep descriptor immutability and registry startup failure

A shallow frozen descriptor still permits mutation of nested permission maps, capabilities, core fields and
slots. Require deep immutable construction or defensive immutable copies, mutation-attempt tests, exact
canonical triple keys and duplicate rejection during application startup before readiness.

Required humans: Architecture, API Contracts and QA/SDET.

### SP-07 — Fail-fast configuration and local-only deployment

Add `CONFIGURATION_RUNTIME_ENVIRONMENT_KEY` through the existing fail-fast runtime configuration path and
validate it with the existing key grammar. Prove missing/invalid values prevent startup/readiness and that
the Local Development Compose profile supplies the explicit value. Do not edit or claim Helm, cloud or
customer-managed profiles in TP-1.

Required humans: Security, Infrastructure/SRE, Backend and QA/SDET.

## Role recommendations

| Responsibility | Agent recommendation | Conditions |
| --- | --- | --- |
| Security & Privacy | Conditional | SP-01, SP-03, SP-05 and SP-07 accepted; credential/vulnerability actions from WI-OI-047 remain visible |
| IAM/Tenancy | Conditional | SP-01 canonical entitlement mapping and SP-03 preview authority accepted |
| API Contracts | Conditional | SP-02 versioned response/legacy shape, SP-03 permissions and SP-05 envelope accepted |
| Web/Accessibility | Conditional | SP-04 complete state machine and manual assistive-technology evidence accepted |
| QA/SDET | Conditional | SP-01–SP-07 mapped into the proposed verification plan; zero-test invocation remains invalid evidence |

These are technical recommendations only. Named humans must independently record `Accept`, `Conditional`
or `Reject` and their reviewed evidence identity.

## Gate result

**NO-GO for G4 entry today.** Product/Solution Architecture acceptance is recorded and the focused baseline
passes, but SP-01 and SP-02 need explicit architecture/specialist resolution and all required specialist
decisions remain absent. WI-OI-046 stays `Proposed` with no active implementation work item.
