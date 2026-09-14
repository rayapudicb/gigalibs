# GigaLibs Operational Intelligence requirements baseline

Baseline: 2026-09-03  
Last additive change: 2026-09-10 (`FR-17-EB-01`–`FR-17-EB-15`)
Source: Operational Intelligence Blueprint v2.0, verified against the repository  
Change rule: retain stable IDs; revise acceptance and record the decision instead of silently renumbering.

## Functional requirements

| ID | Required outcome | Acceptance boundary | Current state |
| --- | --- | --- | --- |
| FR-01 | Outcome Catalog | Tenant activates a versioned outcome with no code edit | Designed; not implemented |
| FR-02 | Integration Hub | Authorized user receives real Ready/limited/not-ready evidence without secret disclosure | Implemented for Release 1 interfaces; G5 evidence partial |
| FR-03 | Connector Runtime | Checkpoint, duplicate, transient/permanent failure and no-data-loss tests pass | Bounded Release 1 interfaces implemented; scale/circuit evidence partial |
| FR-04 | Event Gateway | Versioned tenant/source/idempotent events never duplicate an external action | Implemented for current events; stream ingestion pending |
| FR-05 | Data Contract and Mapping | Breaking or invalid source content is rejected before outcome corruption | Release 1 versioning/validation implemented; full mapping lifecycle partial |
| FR-06 | Rule Engine | Human-readable deterministic rules pass boundary tests | AP rules implemented; generic temporal/unit rules pending |
| FR-07 | Knowledge and AI | Every answer cites authorized immutable evidence and usage/cost; unsupported claims abstain | Provider adapter only; governed RAG pending |
| FR-08 | Workflow Engine | Durable workflow resumes after worker/downstream failure | Core async/lease/checkpoint/retry/cancel implemented; wait/parallel/resume/compensation pending |
| FR-09 | Action Gateway | No write occurs without authorized policy; receipt and reconciliation are durable | Internal AP action implemented; external adapters/reconciliation pending |
| FR-10 | Exception Inbox | Operator recovers a failed case without database access | Implemented and locally certified |
| FR-11 | Command Center | Live state, SLA, affected cases, owners and next action meet latency target | Persisted views exist; real-time/SLA/performance evidence pending |
| FR-12 | Value Ledger | Every claimed benefit links to real source evidence and approved immutable formula | Implemented and locally certified; production acceptance pending |
| FR-13 | Demo Lab | Presenter runs isolated 12-minute demo and proves reset/deletion | Not implemented |
| FR-14 | Tenant Administration | Tenant admin performs routine setup without vendor support | Core tenant/environment/retention partial; SSO/admin/promotion/quotas/region pending |
| FR-15 | Audit and Evidence | Auditor reconstructs actor, event, reason, policy and evidence | Release 1 coverage implemented; export/access coverage and external review pending |
| FR-16 | Usage and Billing | Usage reconciles to runs/providers/storage; forecast, warning and cap work | Not implemented |
| FR-17 | Customer Invoicing and Accounts Receivable | A tenant can independently configure billing, maintain customers, issue immutable invoices, deliver them, apply/reconcile payments and credits, report aging, and audit every financial action using module-owned persistence | Bounded customer/draft/issue foundation exists under WI-OI-019; full outcome and G5 evidence remain incomplete |

### FR-17 event billing extension

These stable child IDs incorporate the event/work-source and supplemental-invoicing gaps from the
WhooCrew Invoicing BRD and the owner's 2026-09-10 requirement direction. They refine FR-17 without
renumbering the universal FR-01–FR-17 outcomes. Detailed acceptance, impact and rollout design is in
[`ar-event-billing-supplemental-invoicing-plan.md`](plans/ar-event-billing-supplemental-invoicing-plan.md).

| ID | Priority | Required outcome |
| --- | --- | --- |
| FR-17-EB-01 | P0 | Persisted event/work-source billing summary with total workers/records, approved, pending, previously invoiced and ready-to-bill counts; generation is rejected when none are eligible |
| FR-17-EB-02 | P0 | Repeated generation automatically classifies and creates the next supplemental draft for newly approved records, with no application-defined round limit |
| FR-17-EB-03 | P0 | Immutable invoice family linking original, supplemental sequence, work source, covered records, void and replacement |
| FR-17-EB-04 | P0 | Percentage/flat markup with line override → customer/category rule → customer default precedence |
| FR-17-EB-05 | P0 | Internal raw-cost, markup and billed-amount transparency with separately governed customer-document cost visibility |
| FR-17-EB-06 | P0 | Configurable missed-billing exception/report for approved records left unbilled beyond policy |
| FR-17-EB-07 | P0 | Void does not unlock source records; authorized Release for Rebilling and linked replacement are explicit |
| FR-17-EB-08 | P0 | Versioned billable-source contract with module-owned standalone entry, immutable lineage and governed pre/post-issue correction behavior; external client adapters are optional later implementations |
| FR-17-EB-09 | P1 | Multiple customer templates, generation-time selection, prefill and immutable issued-version snapshot |
| FR-17-EB-10 | P1 | Versioned numbering patterns with allowlisted customer/work/sequence/supplement tokens |
| FR-17-EB-11 | P1 | Accounting connection plus customer, item/category, invoice and correction mappings with actionable retry/reconciliation |
| FR-17-EB-12 | P1 | External paid/unknown invoice correction enters review and blocks automatic void/rebilling effects |
| FR-17-EB-13 | P1 | Explicit snapshotted Ready to Send versus Auto Send on Issue delivery policy |
| FR-17-EB-14 | P1 | Automated 26-approved-then-4-later acceptance scenario and a defined two-minute event-invoice user target |
| FR-17-EB-15 | P2 | Event-level invoice-family history with amount, issue, delivery, synchronization and correction states |

## Non-functional requirements

| ID | Requirement | Acceptance evidence |
| --- | --- | --- |
| NFR-GOV-001 | Requirement-to-release traceability | Every active work item links requirements, design/code, tests and release evidence |
| NFR-GOV-002 | Independent high-risk review | Producer is not the only reviewer for security, tenancy, data, AI, finance, migrations or release |
| NFR-GOV-003 | Truthful lifecycle state | Only evidence-backed states are shown; quarantine/prototype cannot appear certified |
| NFR-SEC-001 | Deny-by-default tenant/RBAC/object authorization | Positive and negative API/database/object/cache/vector/export tests as applicable |
| NFR-SEC-002 | Secrets and credential lifecycle | Non-returning references, least privilege, rotation/revocation propagation evidence |
| NFR-SEC-003 | Encryption and sensitive-data minimization | In-transit/at-rest controls, redaction, no sensitive logs, key-rotation design |
| NFR-SEC-004 | Application and supply-chain security | Secret/SAST/dependency/container/IaC scans, SBOM, provenance, critical finding policy |
| NFR-SEC-005 | External action safety | Allowlist, limits, policy/approval, idempotency, durable receipt and reconciliation |
| NFR-SEC-006 | AI evidence authorization | Retrieval cannot exceed caller purpose, tenant or classification; prompt injection is tested |
| NFR-DATA-001 | Classification and lineage | Source-to-derived/action/value lineage and highest-classification inheritance |
| NFR-DATA-002 | Retention and legal hold | Configurable erasure, hold, immutable evidence and deletion verification |
| NFR-DATA-003 | Migration integrity | Clean install, supported upgrade, compatibility/backfill and recovery/roll-forward evidence |
| NFR-DATA-004 | No fabricated runtime data | Automated production/all-active-runtime scans and explicit quarantine boundary pass |
| NFR-REL-001 | Event/action durability and idempotency | Acknowledged events durable; retry/replay cannot duplicate external outcomes |
| NFR-REL-002 | Failure recovery | Backoff, circuit/DLQ, replay, poison handling and reconciliation evidence |
| NFR-REL-003 | Backup and disaster recovery | Approved RPO/RTO, restore drill, DR/failover and data-integrity evidence |
| NFR-PERF-001 | Event-to-decision latency | p95 under 5 seconds for agreed representative profile, excluding declared slow dependencies |
| NFR-PERF-002 | Cached interaction latency | p95 under 2 seconds for agreed tenant volume |
| NFR-PERF-003 | Multi-tenant resilience | Load, noisy-neighbor, worker-loss and downstream-failure tests satisfy resource envelope |
| NFR-OBS-001 | Correlated structured logs | Tenant/workflow/run/event/action correlation without secret/sensitive payload leakage |
| NFR-OBS-002 | Metrics | Traffic, latency, errors, saturation, queues, retries, source freshness and business outcomes |
| NFR-OBS-003 | Distributed traces | Control/BFF/execution/worker/provider flow traceable across service boundaries |
| NFR-OBS-004 | SLOs, alerts and runbooks | 99.9% target evaluated; alerts and operator procedures exercised |
| NFR-UX-001 | Complete UI states | Loading, empty, partial/stale, validation, denied, retryable/terminal error and success |
| NFR-UX-002 | Accessibility | WCAG 2.2 AA automated plus keyboard/screen-reader review for critical journeys |
| NFR-UX-003 | Zero-training-first | At least 80% representative first-time completion without facilitator assistance |
| NFR-UX-004 | Zero-handover dependency | Uninvolved trained operator completes the seven-step handover-readiness test |
| NFR-OPS-001 | Configured environment boundary | Missing/invalid required configuration fails startup or the dependent operation explicitly |
| NFR-OPS-002 | Reproducible release | Locked dependencies, immutable artifacts, versioned contracts and environment manifest |
| NFR-OPS-003 | Safe rollout | Migration rehearsal, canary, halt thresholds, rollback/roll-forward and on-call ready |
| NFR-OPS-004 | Production observation | SLO, incident, cost, security and verified-value review through agreed observation window |

## Release acceptance

Release 1 cannot pass G5/G6 until `WI-OI-003` and its dependent P0/P1 controls have independent evidence.
Releases 2–4 cannot borrow Release 1 certification; every new module, adapter and pack must run its own
affected gates.
