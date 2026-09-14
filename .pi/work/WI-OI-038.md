# WI-OI-038 — Physical Operations CMMS scope and completeness remediation

Status: Proposed  
Owner: SDLC Orchestrator / Requirements Spec with Maintenance Domain and Backend  
Requirements: proposed mapping FR-01–FR-06, FR-08–FR-12, FR-14–FR-16; NFR-GOV-001–003, NFR-SEC-001–005, NFR-DATA-001–004, NFR-REL-001–003, NFR-UX-001–004, NFR-OBS-001–004, NFR-OPS-001–004  
Independent reviewers: Maintenance Domain, Architecture, Security & Privacy, QA/SDET, Product  
Gate: G0 discovery; no Build, product acceptance or release authorization

## Outcome and ownership correction

An authorized maintenance team receives an attributable request or asset reading, assigns and performs work, evidences completion, accounts for parts/labour and verifies service restoration. Audit WI-OI-036 found a partial real module with seeded BFF fallback and disconnected automation. Further planning inspection found transaction/concurrency gaps in work orders and stock movements; those are source findings, not new runtime certifications.

The current CMMS manifest refers to WI-OI-031, whose canonical scope is solution packs. This proposed item separates CMMS discovery/acceptance without changing the manifest or silently treating its scope as approved. Correct the manifest and requirement trace within the reviewed implementation change. Existing FR IDs are retained; detailed maintenance acceptance requires Maintenance Domain/Product review.

## Proposed scope and exit criteria

CM-01–CM-07 in the [implementation plan](../../docs/plans/audit-remediation-implementation-plan.md): authoritative assets/locations; work orders; transactional stock/costs; governed meter-to-work automation; durable preventive schedules; scoped request/procurement handoffs; source-derived maintenance reporting.

Before Ready: accept customer/asset types, roles, completion/checklist policy, part units/valuation, integration boundaries, data sources, maintenance metrics, supported deployment and test profile. Full EAM parity, safety-critical control, predictive AI and native offline mobile are not silently added to this scope. One-module Build limit and current AR priority remain in force. No readiness claim follows from this work-item creation.
