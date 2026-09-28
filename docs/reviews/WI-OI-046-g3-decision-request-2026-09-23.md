# WI-OI-046 TP-1 G3 decision request

Date: 2026-09-23  
Status: Product/Solution Architecture accepted D1–D6; independent specialist decisions required; no G4 authority  
Work item: WI-OI-046 — TP-1 Tenant Profile adapter conformance

## Decision requested

Accept, conditionally accept or reject the exact D1–D6 design in
`docs/audits/2026-09-22-wi-oi-046-g3-readiness.md`:

1. required server-owned `CONFIGURATION_RUNTIME_ENVIRONMENT_KEY`, with no default, supplied by the current
   Local Development Compose profile; external profiles remain deferred;
2. code-owned `ALL_ENTITLED_USERS_V1` cohort policy for the first Tenant Profile slice;
3. normal current-runtime, compatibility-assertion and privileged-preview HTTP boundaries;
4. explicit environment/cohort on administrative activation, with no schema defaults;
5. the bounded code-owned Tenant Profile adapter descriptor; and
6. one exact-key adapter registry that preserves existing serialized clients and service persistence.

This is a design decision only. It does not authorize code, a migration, a dependency, release or any
TP-2–TP-6 work.

## Evidence reviewers must use

- `docs/audits/2026-09-22-wi-oi-046-g3-readiness.md`;
- `.pi/work/WI-OI-046.md`;
- `docs/architecture/ADR-0005-delta-5-foundation-convergence.md`;
- `docs/contracts/delta-5-foundation-contracts-v1.md`;
- `docs/architecture/DELTA_5_SECURITY_DATA_MIGRATION_DESIGN.md`;
- `docs/plans/delta-5-foundation-acceptance-test-plan.md`;
- `docs/audits/2026-09-23-wi-oi-047-local-technical-closure.md`;
- `infra/compose/evidence/phase-a-20260923T103641Z/phase-a-closure.json`;
- `docs/audits/2026-09-23-wi-oi-046-prebuild-collision-audit.md`;
- `docs/reviews/WI-OI-046-g3-prebuild-candidate-manifest-2026-09-23.sha256`; and
- `docs/plans/WI-OI-046-tp1-verification-plan.md`; and
- `docs/audits/2026-09-23-wi-oi-046-focused-prebuild-baseline.md`; and
- `docs/reviews/WI-OI-046-specialist-technical-pre-review-2026-09-23.md`; and
- `docs/reviews/WI-OI-046-sp01-sp07-resolution-request-2026-09-23.md`;
- `docs/audits/2026-09-24-wi-oi-042-department-remediation-closure.md`;
- `docs/reviews/WI-OI-042-backend-data-decision-request-2026-09-24.md`;
- `docs/audits/2026-09-24-wi-oi-046-prebuild-collision-audit.md`;
- `docs/reviews/WI-OI-046-g3-prebuild-candidate-manifest-2026-09-24.sha256`; and
- `docs/audits/2026-09-24-wi-oi-046-focused-prebuild-baseline.md`.

The WI-OI-047/WI-OI-042 closure artifacts prove only the F2 local technical predecessor. The former
Department schema mismatch is technically resolved, and the refreshed TP-1 candidate hashes and focused
baseline pass. None of those artifacts supplies an independent specialist acceptance for D1–D6 or
SP-01–SP-07.

## Current blockers and required decisions

| Responsibility | Exact decision | Current state |
| --- | --- | --- |
| Solution Architecture | D1–D6, bounded transition, no-service/no-migration topology | Accepted by Chinni babu Rayapudo on 2026-09-23; independent specialist decisions not waived |
| Security & Privacy | Server-scope trust boundary, legacy assertions, preview permission, safe errors/metrics | Named decision pending |
| IAM/Tenancy | `ALL_ENTITLED_USERS_V1`, membership/entitlement authority and tenant-negative matrix | Named decision pending |
| Infrastructure/SRE | Fail-fast environment configuration, Local Development Compose wiring and operational evidence | Named decision pending |
| API Contracts | Strict schemas, camel-case compatibility, deprecation window and stable errors | Named decision pending |
| Web/Accessibility | Current-runtime UX plus loading/absent/denied/conflict/retry/error states | Named decision pending; manual accessibility also pending |
| QA/SDET | Focused commands, two-tenant/revocation/restart matrix and evidence paths | Named decision pending |
| Product | All-entitled-users-only normal cohort for TP-1; targeted cohorts deferred | Accepted by Chinni babu Rayapudo on 2026-09-23; no production/cloud authority |

WI-OI-047 also retains independent Security, Backend/Data, Web/Accessibility and QA review conditions.
Repository-wide Analytics/CMMS/quarantine failures are routed in
`infra/compose/evidence/phase-a-20260923T103641Z/gates-summary.json`; they are not hidden or relabeled as
TP-1 evidence.

The technical pre-review identifies SP-01–SP-07. Product/Solution Architecture accepted the recommended
canonical `tenant-settings` adapter to `tenant-access` entitlement mapping and strict old/new response
compatibility on 2026-09-23. Applicable independent specialists must still accept or condition those
resolutions and SP-03–SP-07 before G4 entry; the exact declaration is recorded in
`docs/reviews/WI-OI-046-sp01-sp07-resolution-request-2026-09-23.md`.

## Required response format

Each actual reviewer records one row. A role name without a human name is not a decision.

| Human name | Responsibility | D1–D6 reviewed | Evidence revision/hash reviewed | Decision | Conditions/findings | Date |
| --- | --- | --- | --- | --- | --- | --- |
| Chinni babu Rayapudo | Product Owner / Solution Architecture | D1–D6 | WI-OI-046 G3 packet and 2026-09-23 decision request | Accept | Bounded TP-1 Local Development slice only; named Security, IAM/Tenancy, API Contracts, Web/Accessibility and QA decisions are not waived; no production or cloud release | 2026-09-23 |
| _required_ | _role above_ | _IDs_ | _link/hash_ | Accept / Conditional / Reject | _text_ | YYYY-MM-DD |

For Product/Solution Architecture, a suitable exact statement is:

> I reviewed the WI-OI-046 G3 packet and accept D1–D6 for the bounded TP-1 Local Development slice. This
> does not waive the named Security, IAM/Tenancy, API Contracts, Web/Accessibility or QA decisions and does
> not authorize production or cloud release.

Other reviewers must state their own responsibility and any conditions; Product/Architecture cannot sign
for them.

### Recorded Product/Solution Architecture declaration

> I reviewed the WI-OI-046 G3 packet and accept D1–D6 for the bounded TP-1 Local Development slice. This
> does not waive the named Security, IAM/Tenancy, API Contracts, Web/Accessibility or QA decisions and does
> not authorize production or cloud release.

## Gate after decisions

The SDLC Orchestrator rechecks every WI-OI-046 pre-flight condition and the then-current dirty candidate
diffs. Only when all required decisions and conditions are resolved may it move WI-OI-046 from `Proposed`
to `Ready`, then to `In Progress`, and place it as the sole `activeImplementationWorkItems` entry. Until
that transition, product-code changes are forbidden.
