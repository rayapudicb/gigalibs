# GigaLibs SDLC plan

Status: active  
Canonical work status: `.pi/WORK_ITEMS.md`  
Requirements: `docs/REQUIREMENTS_BASELINE.md`

## Lifecycle and gates

```text
G0 Intake and discovery
→ G1 requirements baseline
→ G2 architecture, threat, data and migration design
→ G3 experience/API/test design
→ G4 implementation and module-completeness review
→ G5 integrated verification and UAT
→ G6 release authorization and cohort rollout
→ G7 production observation and proof
```

Gate passage requires repository evidence, not elapsed time or an agent statement.

## Current gate

The repository is between G4 and G5 for the Release 1 AP reference outcome. Its core vertical slice is
implemented and locally integration-tested, with authenticated aggregate metrics on both service planes;
G5 is not passed because distributed tracing and approved alert/SLO evidence,
security/supply-chain scanning, performance/resilience, accessibility/usability, clean migration/restore,
and independent acceptance evidence are incomplete.

Releases 2–4 remain at G0–G2 depending on the capability. They must not be treated as implemented merely
because their future package names exist.

WI-OI-039 and WI-OI-043 are in Review with named human acceptance and/or production-profile evidence
still open. On 2026-09-22 the repository owner directed the currently paused Phase 4 work to
remain undisturbed and prioritized the Delta 5 platform-foundation baseline before any continuation.
WI-OI-044 remains G0–G3 governance, requirements, architecture, contract and test design. WI-OI-047
completed the authorized bounded Local Development supply-chain remediation on 2026-09-23 and returned to
`Review`. On 2026-09-24 WI-OI-042 completed its bounded Department schema-contract correction and
replacement local certification, then returned to `Review`. WI-OI-046 completed its bounded Local Development
TP-1 implementation and 25-outcome exact-image certification in `infra/compose/evidence/wi-oi-046-tp1-20260924T131638Z/`,
then transitioned to `Review` for Gate G4 independent sign-offs. The exact replacement images are distroless/non-root,
have zero Critical/High findings under the recorded Trivy policy, and pass the affected local runtime, outage,
and clean-target restore matrix. Repository-wide Analytics/CMMS failures, manual accessibility review,
credential-owner rotation evidence and named independent decisions remain open. This does not close a production gate
or authorize production/cloud release. On 2026-09-25 WI-OI-059 completed its bounded technical implementation
and moved to Review. Exact Connector Hub and Analytics images pass ordered clean migrations, least-privilege
two-tenant RLS, live readiness, dependency-unavailable startup rejection, container hardening, focused tests and
the zero Critical/High Trivy policy. Reports stays contained and human acceptance, Analytics business completeness
and production/cloud/external release remain open.

On 2026-09-25 the repository owner requested an in-depth convergence assessment for GigaOps Workforce and
CMMS. `WI-OI-060` records the convergence. Its bounded Local Development runtime-foundation implementation
is technically complete and is now in Review; no implementation work item is active.
The audit found two competing workforce
owners, production-reachable GigaOps demo data, unsafe GigaOps trust/tenant paths, failed clean migration
replays for both modules and a failing CMMS typecheck. Neither module is authorized for enablement from
that evidence. The first WI-OI-060 slice delivered truthful containment and the canonical Workforce runtime
foundation with exact-image local evidence; `WI-OI-038` remains the separate proposed CMMS core owner, and
CMMS People/Dispatch depends on a future authoritative Workforce business vertical.

On 2026-09-26 the repository owner directed the visible business UI to proceed. `WI-OI-061` is the sole
active bounded Local Development G4 Build item for the Workforce resource/capability vertical. It replaces
the static GigaOps containment page with real PostgreSQL-backed resource, capability and qualification
journeys and groups GigaOps with CMMS in the left navigation. The complete future information architecture
may be visible, but scheduling, CMMS booking integration, time, pay, compliance and analytics data remain
explicitly unavailable until their own work items pass implementation and evidence gates.

Later on 2026-09-26 the owner approved renaming the `CREW` resource type to `TEAM` (ADR-0003 lexicon) and
granting `workforce:*` to `TENANT_ADMIN`; both are delivered inside WI-OI-061. The owner also directed that
the GigaOps vision be sequenced as the proposed `WI-OI-062` operations convergence programme in
`docs/plans/gigaops-convergence-roadmap.md`: P0 close WI-OI-061, P1 governance, P2 Place, P3 configurability
proof on isolated synthetic data, P4 CMMS core (WI-OI-038), P5 People, P6 Work, P7 Time, P8 Rules and pay
readiness, P9 live intelligence (G5), P10 industry suite, P11 scale and release. It adopts Delta 5 contracts,
adds no general ledger, and grants no Build authority; each phase needs its own registered item and handoff.
The owner then chose continuous execution: WI-OI-061 entered Review on 2026-09-26 with its full evidence
set, and the single Build slot passed to `WI-OI-063` (Geospatial runtime foundation, then sites, zones and
per-tenant opt-in spatial scope). Geospatial Studio is contained until WI-OI-063 certifies it.

## Delivery sequence

1. Close governance and traceability (`WI-OI-004`).
2. Complete threat, permission and data-flow design (`WI-OI-005`).
3. Add clean migration, backup/restore and DR evidence (`WI-OI-006`).
4. Add metrics, traces, SLOs, alerts and runbooks (`WI-OI-007`).
5. Add CI security/supply-chain gates (`WI-OI-008`).
6. Add accessibility, usability, performance and recovery evidence (`WI-OI-009`, `WI-OI-010`).
7. Obtain independent QA/security/product review for Release 1 (`WI-OI-003`).
8. Build Release 2 in vertical slices: expiring Demo Lab, governed Ask GigaLibs, Command Center and report.
9. Build Release 3 tenant productization and commercial controls.
10. Build Release 4 catalogue, connector SDK and two additional packs only from validated demand.

## Audit-derived implementation proposal — 2026-09-09

WI-OI-037 records the [module/submodule implementation proposal](../docs/plans/audit-remediation-implementation-plan.md)
derived from WI-OI-036. It separates repairs, missing outcome completion, unverified functionality and
demand-led extensions, with business acceptance and G0–G7 evidence. This is planning evidence, not an
approved replacement for the current product sequence or release authority. AR-first and one-module
Build remain in force. WI-OI-038 proposes a distinct CMMS discovery owner because its manifest currently
reuses the solution-pack item. WI-OI-039 now builds the versioned dynamic configuration/forms core and its
governed module-adoption architecture under the owner's 2026-09-13 priority decision. The
[zero-code configuration and module rollout plan](../docs/plans/zero-code-configuration-and-module-rollout-plan.md)
records the dependency order: metadata core, low-risk reference adapter, AR financial snapshot adapter, then
one accepted module at a time. The exhaustive audit and manual/UAT verification remain open.
WI-OI-040 separately baselines the WhooCrew-derived source-backed event billing and supplemental-invoice
extension to FR-17. It remains a proposed G0–G3 design and does not enter Build under the current Delta 5
foundation-design directive.

## Value-first all-module release directive — 2026-09-15

The repository owner directed the program to move every claimed module to a genuine `RELEASED` state for
both managed-cloud and customer-managed deployment. WI-OI-041 records the
[value-first all-module release program](../docs/plans/value-first-all-module-release-program.md). Modules
with verified cash, cost or worker-time outcomes are sequenced first; demand-led modules without a named
client baseline remain last and contained. This directive does not waive G0-G7, the IAM No-Go, independent
human acceptance or the one-module Build limit. This was the recorded state before the 2026-09-22 local
execution amendment. WI-OI-047 completed the first bounded Local Development Configuration certification
and its authorized supply-chain remediation, then returned to Review on 2026-09-23 with replacement
exact-image scan and affected-certification evidence. Product/Solution Architecture/Local Operator
accepted that bounded local profile with conditions on 2026-09-24; the named independent specialist
decisions remain open. Subsequent exact-image database verification passed an empty-database replay of
all 37 migrations and a representative 35→37 upgrade, including state preservation, tenant-safe
relationship behavior and idempotency. Both paths originally exposed a P1 physical-schema mismatch for
`departments.updatedAt`, owned by WI-OI-042. The separately authorized correction aligned the canonical
Prisma model to the intentional deployed default without editing applied migrations or targeting the live
database. Replacement clean replay and representative upgrade now match the canonical physical schema;
tenant isolation, runtime, restore and exact-image scan checks pass. WI-OI-042 returned to Review and
WI-OI-044 remains bounded G0–G3 design. The required WI-OI-046 entry decisions and evidence-backed
handoff were recorded on 2026-09-24; WI-OI-046 is the sole active bounded Local Development G4 item.

This remains long-term product direction only. The 2026-09-22 owner amendment below pauses production and
cloud certification in favor of the Local Development profile.

## Integrated certification commands

The commands require explicitly configured local or integration endpoints and credentials:

```text
pnpm --dir apps/playground-api verify:e2e
pnpm --dir apps/playground-api verify:operational-intelligence
pnpm --dir apps/playground-api verify:connector-interfaces
pnpm --dir apps/playground-api verify:ap-outcome
pnpm --dir apps/playground-api verify:workflow
pnpm --dir apps/playground-api verify:retention
pnpm --dir apps/playground-api verify:observability
pnpm --dir apps/playground-api verify:execution-observability
pnpm --dir apps/workflow-platform verify:bff
```

Certification scripts create isolated evidence records. They never provide runtime fallback data.

## Analytics review and Delta 5 foundation directive — 2026-09-22

WI-OI-043 (External Data Analytics & Reporting Studio) is in Review. Its detailed record contains G4
implementation evidence, but independent human review and contained P0 replacements remain open; no
production or release claim is accepted. ADR-0004 continues to govern the Analytics visualization choice.

The owner subsequently directed the paused Phase 4/import-extension work to remain untouched until the
shared foundations are complete. CMMS import/export files and migrations carrying WI-OI-043 annotations
are outside the Analytics work item's product boundary. They are frozen as provenance evidence and are not
silently reattributed, edited or resumed by the foundation baseline.

WI-OI-044 is the bounded Delta 5 foundation governance and contract baseline. It covers F0 governance and
inventory plus F1 requirements/ADR/contract/test design only. It is not an active G4 Build stream and does
not authorize a new metadata engine, product service, migration, dependency or module adapter. Each later
behavior-changing foundation slice requires its own Ready work item and explicit sole-Build handoff.

Current sequence: F0 governance reconciliation and protected-code checkpoint → F1 contracts/ADRs/threats
and acceptance design → Tenant Profile reference-adopter design (WI-OI-045) → Configuration deployment-
profile contract repair and certification (WI-OI-047) → WI-OI-047 named independent review and routed
conditions → TP-1 proposed adapter work (WI-OI-046) → human gate decision → one separately authorized
Build slice at a time. Tenant Profile reuses the existing WI-OI-039 surface and is not a greenfield rebuild.
WI-OI-044, WI-OI-045 and WI-OI-047 are in Review; WI-OI-046 is the sole active G4 Build item. WI-OI-047 completed its
bounded supply-chain remediation and returned to Review on 2026-09-23. Its bounded local Product,
Solution Architecture and Local Operator decision is recorded on 2026-09-24, subject to the remaining
independent specialist and credential conditions. Exact-image clean replay and representative upgrade
now pass. The resulting WI-OI-042-owned P1 `departments.updatedAt` mismatch was corrected and recertified
without editing applied migrations; the replacement clean and upgrade paths match the canonical physical
schema. WI-OI-042 and WI-OI-047 are in Review, the independent Backend/Data decision remains pending,
WI-OI-046 entered bounded Local Development G4 Build after the required pre-Build decisions and explicit
owner handoff were recorded on 2026-09-24.
The first local technical closure remains historical evidence; the replacement evidence resolves the
image Critical/High policy but does not pass repository-wide routed gates or any G5–G7 human gate. No
agent may mark human acceptance.

On 2026-09-22 the Product Owner/Solution Architecture reviewer narrowed current execution to
`configuration-local-development-v1`, reusing Docker 29.0.1, Compose 2.40.3, PostgreSQL 16 and the existing
digest-pinned MinIO. Customer-Managed production, public/external infrastructure and cloud certification
are deferred without being counted as passes; HostingRaja and DigitalOcean remain unselected candidates.
The local milestone certifies Configuration Studio deployment/lifecycle for continued development/demo,
while F3/TP-1 owns authoritative Tenant Profile runtime values. Production and cloud require separate
evidence and authority.
