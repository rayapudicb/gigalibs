# WI-OI-052 — TP-6 Integrated Reference Certification & Cohort Observation

Status: Review
Gate: G4 Review; implementation and end-to-end certification complete for bounded Local Development TP-6
Owner: Solution Architecture / Backend Domain / QA/SDET / Infrastructure Observability
Requirements: FR-01, FR-05, FR-08, FR-14, FR-15, FR-16; NFR-GOV-001–003,
NFR-SEC-001–005, NFR-DATA-001–004, NFR-REL-001–003, NFR-PERF-002–003,
NFR-OBS-001–004, NFR-UX-001–002, NFR-OPS-001–004
Independent reviewers: Solution Architecture, Security & Privacy, IAM/Tenancy,
Infrastructure/SRE, API Contracts, QA/SDET, Product
Dependencies: WI-OI-046 TP-1 Review package, WI-OI-048 TP-2 Review package, WI-OI-049 TP-3 Review package, WI-OI-050 TP-4 Review package, WI-OI-051 TP-5 Review package
Design specification: `docs/architecture/TP6_INTEGRATED_REFERENCE_CERTIFICATION_AND_COHORT_OBSERVATION_DESIGN.md`
Decision request: `docs/reviews/WI-OI-052-g3-decision-request.md`
Review package: `docs/reviews/WI-OI-052-review-and-acceptance-package.md`

---

## 1. Single outcome

Execute the complete end-to-end first-adopter Tenant Profile cohort journey under the `configuration-local-development-v1` deployment profile, integrating:
1. TP-1: Tenant Profile schema publication & adapter validation.
2. TP-2: Durable Tenant Export with transactional outbox event creation.
3. TP-3: Transactional Inbox ingestion with deduplication and cache invalidation.
4. TP-4: Workload admission control and tenant isolation enforcement.
5. TP-5: Transaction-safe audit log sequence allocation (`tenant_audit_chains`), schema-aware sensitive field redaction, and fail-closed discrete verification (`VALID`, `UNSEALED`, `INVALID`, `INCOMPLETE`).

Deliver an automated, executable certification harness (`scripts/verify-local-tp6-reference-cohort.mjs`) and comprehensive integration test suite.

---

## 2. Bounded Scope

### 2.1 End-to-End Orchestration Harness
- Develop `scripts/verify-local-tp6-reference-cohort.mjs` verifying the cohesive execution of the 5 foundation capabilities.
- Add integration test suite validating positive cohort progression and negative fault branches (suspended tenant, corrupted audit hash).

### 2.2 Observability & Telemetry Verification
- Validate workload metrics reporting before and after execution.
- Validate audit trail reconstruction and sealed evidence verification.

### 2.3 Governance & Non-regression
- Keep 7 protected CMMS file hashes untouched.
- Maintain all 9 repository and SDLC governance audits green.
- Confine runtime profile to `configuration-local-development-v1`.

---

## 3. Implementation & Verification Evidence

| Item | Component | Artifact / File | Status |
|---|---|---|---|
| Design | Architecture Specification | `docs/architecture/TP6_INTEGRATED_REFERENCE_CERTIFICATION_AND_COHORT_OBSERVATION_DESIGN.md` | Approved Baseline |
| Decision Request | Gate G3 Submission | `docs/reviews/WI-OI-052-g3-decision-request.md` | Published |
| Harness | Standalone Certification Script | `scripts/verify-local-tp6-reference-cohort.mjs` | Executed & Passing |
| Test Suite | Cohort Integration Vitest | `apps/playground-api/src/tp6-reference-cohort.spec.ts` | 4/4 Passing (7 scenarios) |
| Architecture Cohesion | Audit Re-export | `packages/audit-nest/src/index.ts` | Re-exports `@gigalibs/audit-core` |
| Extension | Admission DB Injection | `apps/playground-api/src/tenant-workload-admission.service.ts` | Implemented & Non-breaking |
| Full Test Matrix | Playground API Suites | `apps/playground-api/src/*.spec.ts` | 18 files / 93 tests passing |
| SDLC Audits | Governance Integrity | `pnpm audit:*` (6 scripts) | All Green |
| Protected Hashes | CMMS Frozen Files | 7 baseline files | 100% Matching |
| Review Package | G4 Evidence | `docs/reviews/WI-OI-052-review-and-acceptance-package.md` | Published |

