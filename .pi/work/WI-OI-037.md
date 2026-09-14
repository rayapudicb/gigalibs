# WI-OI-037 — Audit remediation and business-completeness implementation plan

Status: Review  
Owner: SDLC Orchestrator / Requirements Spec  
Requirements: FR-01–FR-16, FR-17; NFR-GOV-001–003, NFR-SEC-001–006, NFR-DATA-001–004, NFR-REL-001–003, NFR-UX-001–004, NFR-OBS-001–004, NFR-OPS-001–004  
Independent reviewers: Architecture, QA/SDET, Security & Privacy, Finance/Domain, Product  
Gate: G0–G3 planning; no Build or release authorization

## Outcome

On 2026-09-09 the owner requested a module/submodule implementation plan from WI-OI-036 covering missing functionality, justified extensions, completed business outcomes and production go-live evaluation. This item records that planning deliverable. Review status concerns the plan only; it does not change the implementation or readiness status of any module.

## Deliverables

- [Complete implementation plan](../../docs/plans/audit-remediation-implementation-plan.md).
- [Submodule backlog](../../docs/plans/audit-remediation-backlog.csv) with gap/evidence, implementation/result, acceptance, requirements, owning WI, dependencies and proposed sequencing.
- [All-package disposition](../../docs/plans/audit-remediation-package-disposition.csv), retaining quarantine and explicit consumer-discovery work.
- [Readable plan for all 206 package entries](../../docs/plans/audit-remediation-package-plan.md), including declared purpose, completion/discovery work and expected evidence.
- [Action/evidence template](../../docs/plans/audit-remediation-evidence-template.csv) for exhaustive verification under WI-OI-036 and module WIs.

## Planning decisions and open inputs

AR-first and one-module Build remain the existing constraints. The accepted suite ADR and proposed independent-product blueprint require explicit ownership reconciliation before migration. No new service/table owner is approved here. Required repairs, missing lifecycle completion, unverified capability and optional demand-led expansion are separate plan categories.

Initial customer segment, jurisdiction/currency scope, identity/email/storage/payment providers, hosting modes, workload/SLO/RPO/RTO, named reviewers and release dates remain open. Resolve only those required before the dependent slice enters Build; independent planning/audit continues. CMMS receives proposed WI-OI-038 instead of silently sharing WI-OI-031 solution-pack scope.

## Exit and handoff

The generated plan has 98 submodule slices across 18 business/platform groups. Planning validation confirms coverage of all 11 business modules, FR-01–FR-16 plus AR FR-17, valid requirement/work-item links, an acyclic proposed dependency graph, and all 206 inventory roots. The SDLC structural check passes with 38 registered items. Independent architecture review corrections were applied; final integrated finance/domain and named human review remain open. No product tests or readiness gates are passed by these document checks.

The orchestrator opens/reopens the existing owning implementation items one at a time after their Ready gate. WI-OI-036's exhaustive audit/UAT remains incomplete. Named humans retain scope acceptance, risk/domain/legal decisions and production release authority.
