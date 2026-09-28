# WI-OI-060 - GigaOps Universal Workforce domain convergence

Status: Review  
Gate: Bounded Local G4 Review — runtime foundation  
Owner: SDLC Orchestrator / Solution Architecture / Workforce Domain  
Requirements: FR-01, FR-02, FR-04-FR-06, FR-08-FR-12, FR-14-FR-16;
NFR-GOV-001-003, NFR-SEC-001-005, NFR-DATA-001-004, NFR-REL-001-003,
NFR-PERF-001-003, NFR-OBS-001-004, NFR-UX-001-004, NFR-OPS-001-004

## Outcome

Establish GigaOps as the single tenant-scoped Workforce Operations owner and remove the current
split-brain workforce ownership between GigaOps and CMMS. Preserve the valuable CMMS allocation behavior,
but expose CMMS work as requirements consumed by Workforce rather than maintaining a CMMS worker master.

## Current evidence

- Audit: `docs/audits/2026-09-25-gigaops-cmms-readiness.md`
- Plan: `docs/plans/gigaops-workforce-cmms-convergence-implementation-plan.md`
- Ownership baseline: `docs/architecture/ADR-0003-cross-domain-identity-hierarchy-and-workforce-primitives.md`
- CMMS core remains owned by proposed `WI-OI-038`.
- Exact implementation and review packet:
  `docs/reviews/WI-OI-060-runtime-foundation-review-request-2026-09-25.md`
- Exact source state: `b72b93229d87a1493e597aa179a76fa1e9d35823844b1747e57a9909a13d78a6`.
- Exact image: `gigalibs/workforce-api:5abfa667bb10-b72b93229d87` /
  `sha256:12981f56db3a6490a9d4efc962b53abb320729645a749c25d80679e9b5f730f2`.

## Accepted architecture and later-slice scope

- Product boundary, user journeys, neutral workforce terminology and first representative use case.
- Single data owner for resources, relationships, capabilities, availability, requirements, bookings,
  time evidence and payroll-ready earning lines.
- Control Plane, CMMS, Configuration, Rules, Workflow, Connector, E-Sign, Communications, Geospatial and
  Analytics contracts.
- Permission/object-authorization matrix, tenant isolation, PII/compensation/location classification and
  retention design.
- Additive migration/convergence design for the currently uninstalled GigaOps schema and unapplied CMMS
  migrations 000003-000009.
- Versioned API/event/error/idempotency contracts and complete UX/test plan.
- Truthful containment of current GigaOps demo/runtime paths when this item is authorized for Build.

## Authorized first Build slice

The repository owner confirmed on 2026-09-25 that GigaOps is the shared Workforce Management domain for
CMMS and other modules and directed implementation to proceed. The sole active Build slice is limited to:

1. Contain production-reachable GigaOps demo data and unconditional entitlement bypasses.
2. Establish the canonical Workforce module key, audience and explicit Local Development runtime contract.
3. Replace raw bearer/header trust with signed `PlatformContextV1`, fail-closed scope checks and granular
   Workforce permissions.
4. Repair clean migration replay through additive migrations or an explicitly ordered fresh-install
   manifest without editing migrations already applied in any target.
5. Run under a dedicated non-superuser/non-BYPASSRLS role with `SET LOCAL app.tenant_id` transaction binding.
6. Separate liveness/readiness and add exact local image/runtime verification.

No worker, scheduling, time, pay or CMMS business screen is enabled by this slice.

## Explicit exclusions

- Worker/job/capability behavior until the runtime foundation exits its verification gate.
- Full statutory payroll, tax filing, remittance or universal legal-compliance claims.
- Production/cloud/public release or external provider credentials.
- Autonomous scheduling/pay decisions without approved human-control policy.
- Enabling CMMS People/Dispatch before Workforce is authoritative.

## Definition of Ready exit

1. Product accepts the exact first business journey, actors, jurisdiction and industry template.
2. ADR-0003 is accepted or superseded with one Workforce data owner.
3. Requirements and negative cases are testable and linked to stable IDs.
4. API/event/data contracts, migration path and CMMS compatibility window are reviewed.
5. Security, IAM/Tenancy, Backend/Data, API Contracts, Web/Accessibility, QA/SDET and Product reviewers
   are named.
6. `WI-OI-059` has left Build and the orchestrator explicitly authorizes the next single Build item.

## Definition of Ready decision — 2026-09-25

- Product/Solution Architecture direction: GigaOps is the one shared Workforce owner for CMMS and all other
  source modules; the repository owner directed implementation to proceed.
- The bounded runtime slice is source-, country- and industry-neutral. Jurisdiction selection is deliberately
  deferred to the later policy/pay-readiness slice and is not applicable to this empty-runtime foundation.
- Required reviewers are named by role in this record. Independent Security/IAM and Backend/Data review is
  required before this item can leave Review; no agent decision substitutes for those humans.
- `WI-OI-059` is in Review. `WI-OI-060` is the sole active implementation item.

## Technical result — 2026-09-25

- Truthful web/BFF containment, canonical module identity and signed-context authorization are implemented.
- Workforce migrations 1-2 replay cleanly under a dedicated least-privilege runtime role with forced RLS,
  append-only audit evidence, revocation, outbox and inbox foundations.
- The exact local image is healthy, non-root, read-only, capability-free and has no published host port.
- Repository build (106/106 tasks), repository tests (188 files / 1,707 tests plus 4 execution-plane tests),
  mandatory audits, clean replay, signed-context HTTP verification and runtime isolation checks pass.
- Exact-image Trivy evidence reports 0 Critical/High, 17 Medium and 7 Low findings. The CycloneDX SBOM has
  129 components; nine missing license fields remain a distribution disposition requirement.

## Current decision

The bounded runtime-foundation implementation is technically complete and has left Build for independent
human Review. GigaOps/CMMS business enablement remains prohibited until the relevant later vertical slice
passes its own completeness and human review gates. No production, cloud, external-provider or distribution
authority is granted.
