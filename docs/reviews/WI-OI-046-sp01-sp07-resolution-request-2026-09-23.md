# WI-OI-046 SP-01–SP-07 resolution request

Date: 2026-09-23  
Status: Product/Solution Architecture amendment accepted; independent specialist decisions pending; no G4 authority

## Decision requested

Accept, conditionally accept, amend or reject the seven conditions found during specialist technical
pre-review. The detailed evidence is in
`docs/reviews/WI-OI-046-specialist-technical-pre-review-2026-09-23.md`.

## Recommended exact resolutions

### SP-01 — Entitlement authority

- Preserve the Configuration identity `(tenant-settings, tenant-profile, profile-extension)`.
- Add the code-owned authorization mapping `entitlementModuleKey: tenant-access` to the adapter policy.
- Resolve entitlement from the canonical durable `TenantModuleEntitlement` record.
- Require `status = ENABLED`, `startsAt <= now`, `endsAt IS NULL OR endsAt > now`, active tenant/user/
  membership and the required endpoint permission.
- Missing, disabled, future or expired entitlement returns the same sanitized denied contract.
- Keep the accepted policy name `ALL_ENTITLED_USERS_V1`; it is truthful only with this entitlement check.

This adds no entitlement table, duplicate registry or browser-supplied authority.

### SP-02 — Old/new wire contracts

- New `GET /configuration/runtime/manifest/current` returns a separately named strict v1 current-runtime
  response containing the existing manifest fields plus resolved environment, cohort and policy evidence.
- Legacy `GET /configuration/runtime/manifest` returns the exact existing strict response shape.
- Legacy environment/cohort parameters are optional assertions; if supplied, both must equal the server
  resolution or the request returns `CONFIGURATION_RUNTIME_SCOPE_DENIED` before cache/database access.
- Document deprecation and sunset metadata. Removal requires measured absence of legacy consumers and a
  separately accepted compatibility change.

No existing strict decoder is expected to accept new unknown fields.

### SP-03 — Preview

- Preview requires both `configuration-runtime:read` and `configuration:read`.
- It retains authenticated tenant isolation and records a sanitized administrative-read audit event.
- Preview scope never establishes normal cohort membership and never becomes a metrics label.

### SP-04 — Web states

Implement a typed `loading | absent | denied | invalid-scope | retryable-error | ready | saving | conflict |
saved` state machine with visible retry, live announcements, predictable focus and stale-request
cancellation. Never return a silent blank UI for a missing or failed runtime request.

### SP-05 — Errors

Use a strict versioned safe error envelope for the accepted stable codes. Tests must prove that adapter,
scope, entitlement and manifest failures reveal no other tenant, activation, role, permission or database
detail.

### SP-06 — Registry immutability

Return deeply immutable descriptors or defensive immutable copies. Reject duplicate canonical triple keys
during application startup before readiness. Mutation attempts, including nested arrays/objects, must fail
or leave stored registry state unchanged.

### SP-07 — Configuration profile

Validate required `CONFIGURATION_RUNTIME_ENVIRONMENT_KEY` through the existing fail-fast runtime config
grammar. Missing/invalid values prevent startup. Wire only the Local Development Compose profile and its
certification launcher. Helm/cloud/customer-managed files remain `DEFERRED_EXTERNAL`.

## Required decisions

| Human responsibility | Conditions requiring decision | Status |
| --- | --- | --- |
| Product / Solution Architecture | SP-01 and SP-02 amendment; SP-04 visible outcome | Accepted by Chinni babu Rayapudo on 2026-09-23; independent specialist decisions not waived |
| Security & Privacy | SP-01, SP-03, SP-05 and SP-07 | Pending |
| IAM/Tenancy | SP-01 and SP-03 | Pending |
| Infrastructure/SRE | SP-07 and exact local failure evidence | Pending |
| API Contracts | SP-01–SP-03, SP-05 and SP-06 | Pending |
| Web/Accessibility | SP-04 | Pending |
| QA/SDET | SP-01–SP-07 verification and evidence plan | Pending |

## Decision record

| Human name | Responsibility | Conditions reviewed | Evidence reviewed | Decision | Conditions/findings | Date |
| --- | --- | --- | --- | --- | --- | --- |
| Chinni babu Rayapudo | Product Owner / Solution Architecture | SP-01–SP-07 | WI-OI-046 amendment request and specialist technical pre-review | Accept | Bounded TP-1 Local Development slice only; independent specialist decisions not waived; no production, cloud or G4 authority | 2026-09-23 |
| _required_ | _role above_ | _SP IDs_ | _links/hash_ | Accept / Conditional / Reject | _text_ | YYYY-MM-DD |

Product/Solution Architecture may use this exact statement only after reviewing the amendment:

> I reviewed SP-01 through SP-07 and accept the recommended WI-OI-046 amendments for the bounded TP-1
> Local Development slice, including the `tenant-settings` to `tenant-access` entitlement mapping and the
> separate strict current-runtime response while preserving the exact legacy response. This does not waive
> independent specialist decisions or authorize production, cloud or G4 implementation.

### Recorded Product/Solution Architecture declaration

> I reviewed SP-01 through SP-07 and accept the recommended WI-OI-046 amendments for the bounded TP-1
> Local Development slice, including the `tenant-settings` to `tenant-access` entitlement mapping and the
> separate strict current-runtime response while preserving the exact legacy response. This does not waive
> independent specialist decisions or authorize production, cloud or G4 implementation.

Every specialist must record their own name, responsibility, decision and conditions. An agent-prepared
Conditional recommendation is not a human acceptance.

## Gate

The Product/Solution Architecture amendment is accepted. Until every applicable independent specialist
condition is accepted, WI-OI-046 remains `Proposed`. Even complete decisions do not start Build
automatically; the SDLC Orchestrator must separately move it to `Ready`, then `In Progress`, as the sole
active implementation item.
