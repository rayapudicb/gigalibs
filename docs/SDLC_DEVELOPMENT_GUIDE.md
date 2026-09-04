# GigaLibs SDLC development guide

Status: adopted engineering operating model  
Lifecycle: gated, iterative, security/data/operations integrated

## Required trace

Every work item must maintain this chain:

```text
Outcome
→ WI-OI work item
→ FR/NFR requirement
→ architecture/threat/data/API design
→ code and forward migration
→ unit/contract/integration/security/E2E evidence
→ release evidence and known limitations
→ human authorization
→ production SLO and value observation
```

## Gates

### G0 — Intake and discovery

Define outcome, human owner, users, current system, data sources, product boundary, assumptions,
dependencies, risks and non-goals. Inventory existing code before proposing a new service or table.

Exit: no duplicate capability, unresolved authoritative data owner or hidden production mock path.

### G1 — Requirements baseline

Define stable FR/NFR IDs, acceptance and negative cases, value measurement, roles, data classifications,
availability/performance/recovery targets and release priority.

Exit: P0/P1 requirements are testable and have human owners plus test owners.

### G2 — Architecture, security, data and migration design

Approve service/data ownership, contracts, threat model, permissions, tenant isolation, secret handling,
classification/retention, migrations, rollback/roll-forward, observability and provider boundaries.

Exit: no unresolved critical threat/data-loss risk; ADRs and control designs exist.

### G3 — Experience, API and test design

Specify success, empty, loading, partial/stale, validation, denied, conflict, dependency-failure, retry and
recovery states. Version API/event schemas, error contracts and idempotency rules. Define test layers and
representative volume.

Exit: a vertical slice is independently demonstrable and every promised state has acceptance evidence.

### G4 — Implementation and module completeness

Implement UI, API, domain rules, persistence, migrations, worker/event paths, authorization, audit,
telemetry and operator diagnostics together. Provider calls use real adapters. Production failure never
returns fixture success.

Exit: the module-completeness standard passes and no production-reachable mock/fake/stub remains.

### G5 — Verification and UAT

Run unit, schema/consumer-contract, real-infrastructure integration, migration, E2E, RBAC/tenant negative,
security, performance, resilience, accessibility, backup/restore, and rollback/recovery tests as applicable.
Use an independent reviewer for high-risk changes.

Exit: every P0 requirement traces to passing evidence; no open P0/P1 defect; human Product Owner accepts
the integrated journey.

### G6 — Release and cohort rollout

Freeze source and lockfiles; produce SBOM/provenance and immutable artifacts; rehearse migrations; approve
known issues, rollout, halt and recovery; deploy internal/canary/cohort stages; activate support/on-call.

Exit: named human release authority approves and the canary satisfies halt/observation criteria.

### G7 — Production observation

Observe availability, latency, errors, saturation, queues, jobs, source freshness, action reconciliation,
security events, costs and verified value. Run restore, credential, isolation and incident drills.

Exit: the release meets its SLO through the agreed observation window with no unresolved critical incident.

## Definition of Ready

- Outcome, actor, non-goals and acceptance/negative examples are explicit.
- Work item and requirement IDs exist.
- Source, API, data, classification, permission and audit ownership is known.
- Migration, concurrency, retry/recovery, observability and operational impacts are designed.
- Dependencies and external/human decisions are identified.
- The slice can be implemented and verified independently.

## Definition of Done

- Intended user outcome works end to end through real persistence/infrastructure.
- Production behavior contains no mock data, fake provider success, silent fallback or local-only truth.
- Server authentication, authorization, object scope and tenant isolation are positively and negatively tested.
- Inputs/outputs are bounded, versioned and validated; conflicts and concurrent writes are deliberate.
- Multi-step state is transactional/idempotent and external effects have retry, receipt and reconciliation.
- Forward migrations, compatibility and recovery/roll-forward have executable evidence.
- Logs, metrics, traces, health, alerts, audit and runbooks exist for operational paths.
- Loading/empty/stale/denied/error/retry/success states and WCAG 2.2 AA are verified when user-facing.
- Unit, contract, integration, E2E, security, performance/resilience and recovery tests pass as applicable.
- Documentation, known limitations, release notes and traceability are current.
- Required independent reviewers and named human acceptance are recorded.

## Stop-ship conditions

Any production-reachable fake success, cross-tenant exposure, unbounded sensitive endpoint, unsafe
migration, unreconciled financial/external write, missing recovery for acknowledged data, critical security
finding, or unowned P0/P1 gap makes the release `No-Go`.

## Environment policy

Developer/CI/integration certification may use generated isolated test records and provider sandboxes.
Staging may use synthetic or formally anonymized/restored data under approval. Production contains only
authorized tenant data. No test/certification record contributes to a customer value claim.

