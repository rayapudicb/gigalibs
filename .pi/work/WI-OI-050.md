# WI-OI-050 — TP-4 Tenant Binding, Workload Pool & Admission Conformance

Status: Review
Gate: G4 Review; TP-4 Local Development implementation complete, ready for independent specialist review
Owner: Backend Domain / Infrastructure Observability / Solution Architecture
Requirements: FR-01, FR-05, FR-08, FR-14, FR-15, FR-16; NFR-GOV-001–003,
NFR-SEC-001–005, NFR-DATA-001–004, NFR-REL-001–003, NFR-PERF-002–003,
NFR-OBS-001–004, NFR-UX-001–002, NFR-OPS-001–004
Independent reviewers: Solution Architecture, Security & Privacy, IAM/Tenancy,
Infrastructure/SRE, API Contracts, QA/SDET, Product
Dependencies: WI-OI-046 TP-1 Review package, WI-OI-048 TP-2 Review package, WI-OI-049 TP-3 Review package
Design specification: `docs/architecture/TP4_BINDING_POOL_AND_ADMISSION_CONFORMANCE_DESIGN.md`

---

## 1. Single outcome

Establish tenant isolation binding validation, workload classification, and connection pool admission
control under the `configuration-local-development-v1` deployment profile, ensuring interactive APIs,
background export workers, outbox relays, and event listeners operate within certified connection budgets
and reject unready or suspended tenant workloads before database saturation.

---

## 2. Baseline capabilities to preserve

| Existing capability | Evidence | Disposition |
|---|---|---|
| PostgreSQL `tenant_isolation_bindings` | `packages/db/schema.prisma` | Extend validation to admission service |
| `TenantDataExportWorker` | `apps/playground-api` | Admitted under `BACKGROUND_WORKER` budget |
| `OutboxRelayProcessor` | `apps/playground-api` | Admitted under `OUTBOX_RELAY` budget |
| `ConfigurationInvalidationConsumer` | `apps/playground-api` | Admitted under `EVENT_LISTENER` budget |
| `ConfigurationStudioService` | `apps/playground-api` | Admitted under `INTERACTIVE` budget |

---

## 3. Bounded scope

### 3.1 Workload classification
- Classify control-plane workloads into 4 certified classes: `INTERACTIVE`, `BACKGROUND_WORKER`, `OUTBOX_RELAY`, `EVENT_LISTENER`.
- Define concurrency and latency budgets per workload class.

### 3.2 Binding validation
- Validate tenant status is not `SUSPENDED`.
- Validate `TenantIsolationBinding` is in `READY` status (or default RLS ready state).
- Fail closed with `TENANT_BINDING_NOT_READY` or `TENANT_SUSPENDED`.

### 3.3 Connection budget & admission control
- Implement `TenantWorkloadAdmissionService` with atomic admission tracking and RAII `withAdmittedWorkload` pattern.
- Fail fast with `WORKLOAD_CAPACITY_EXCEEDED` when a class budget is saturated.
- Provide real-time admission telemetry for observability.

### 3.4 Governance & Non-regression
- Keep 7 protected CMMS file hashes untouched.
- Maintain all 9 repository and SDLC governance audits green.
- Confine runtime profile to `configuration-local-development-v1`.

---

## 4. Gate G4 Implementation & Verification Evidence

| Evidence Item | Location / Command | Verification Outcome |
|---|---|---|
| Architecture Specification | `docs/architecture/TP4_BINDING_POOL_AND_ADMISSION_CONFORMANCE_DESIGN.md` | Formal design baseline for workload classification & pool admission |
| Workload Admission Service | `apps/playground-api/src/tenant-workload-admission.service.ts` | Complete workload admission control with RAII pattern & telemetry |
| App Module Registration | `apps/playground-api/src/app.module.ts` | Registered provider verified via `verify-api-module-boundary.mjs` |
| Unit Test Suite | `apps/playground-api/src/tenant-workload-admission.spec.ts` | 7/7 passing tests (89/89 total suite passing) |
| Protected File Hash Verification | `shasum -a 256 ...` (7 CMMS files) | 100% byte-for-byte identical; 0 files modified |
| SDLC Governance Audit | `pnpm audit:sdlc` | Passed (19 agents, 50 work items, 0 violations) |
| Runtime Data & Package Audits | `pnpm audit:*` | All audits pass cleanly |

