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

Customer Invoicing and Accounts Receivable (`WI-OI-019`) is the selected next product module. Repository
structure and G0–G3 discovery/design may proceed without entering runtime Build. G4 implementation remains
blocked until the Release 1 P0/P1 evidence is independently closed or a named human authority records a
formal containment and reprioritization decision. This preserves the one-module Build limit.

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
