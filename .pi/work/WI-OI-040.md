# WI-OI-040 — Source-backed event billing and supplemental invoicing

Status: Blocked (frozen by the owner 2026-09-28; matches the registry). Corrected by the WI-OI-119 audit (2026-10-05).  
Owner: SDLC Orchestrator / AR Backend & Data with Product and Finance/Payroll Domain  
Requirements: FR-17-EB-01–FR-17-EB-15; FR-04, FR-05, FR-09, FR-10, FR-14, FR-15; NFR-GOV-001–003,
NFR-SEC-001–005, NFR-DATA-001–004, NFR-REL-001–003, NFR-PERF-001–003, NFR-UX-001–004,
NFR-OBS-001–004, NFR-OPS-001–004  
Independent reviewers: Finance/Domain, Solution Architecture, Security & Privacy, Integration Engineering,
QA/SDET, SRE and Product; client source owners review only the later client-replica adapter  
Gate: G0–G3 requirements/design; no Build, production-provider connection or release authorization

## Outcome

An authorized billing user produces an original work-source invoice and any later supplements from
module-owned, approved, versioned billable records without duplicate or missed billing. The complete invoice family,
source/cost/markup calculation, correction, delivery and accounting-sync outcome remains persistent and
auditable.

## Source and design

The owner supplied `WhooCrew-Invoicing-BRD 1.docx`, version 1.0 dated 2026-08-10, and a prioritized gap
list on 2026-09-10. Source-document `FR-1`–`FR-21` identifiers remain local to that draft. The adopted
universal child requirements are `FR-17-EB-01`–`FR-17-EB-15` in
[`docs/REQUIREMENTS_BASELINE.md`](../../docs/REQUIREMENTS_BASELINE.md).

The full [implementation and impact plan](../../docs/plans/ar-event-billing-supplemental-invoicing-plan.md)
defines source ownership, eligibility, invoice families, unlimited supplemental rounds, markup precedence,
immutable snapshots, missed-billing control, authorized rebilling, templates, numbering, delivery,
accounting reconciliation, migrations, RBAC, telemetry, tests and staged activation.
The [universal invoice configuration guide](../../docs/plans/universal-invoice-dynamic-fields-and-templates-guide.md)
keeps WhooCrew event/worker/shift concepts in the source adapter and defines how tenants and customers receive
different fields, registered screen layouts and immutable document templates without developer intervention.
The [crewing event invoicing discovery brief](../../docs/plans/crewing-event-invoicing-discovery-brief.md)
reduces the later granular notes to the client problem, minimum event-to-invoice journey, explicit deferrals
and confirmed build/freeze/replicate/customize sequence. Those notes remain discovery input and are not
adopted wholesale as requirements.
The [portability and integration plan](../../docs/plans/universal-invoicing-portability-and-integration-plan.md)
defines the standalone-build, certified-freeze, Java/React replication and later client-adapter sequence.
The GigaLibs slice does not consume WhooCrew APIs.

## Existing capability and containment

- Extend the standalone `modules/accounts-receivable` owner. Preserve its real manual customer/draft/issue
  path, IDs, invoice numbers and `ar.invoice.issued.v1` contract.
- Do not connect the workflow-platform in-memory AR ledger. Its suite API remains explicitly unavailable
  until it can proxy the certified standalone API without a local data fallback.
- Migration 000004's billable-shift/payment/void tables are disconnected from the standalone service, and
  the current migration runner/E2E only apply 000001/000002. Reconcile 000003/000004 before any dependent
  feature and use new forward migrations; never rewrite migration history.
- The QuickBooks inventory is not a production adapter. A real provider sandbox, OAuth credential
  lifecycle, mappings, timeout/retry, receipts and reconciliation are required before enabling sync.

## Proposed slices

| Slice | Outcome | Exit condition |
| --- | --- | --- |
| EB-00 | Migration/runtime reconciliation and prototype containment | Supported upgrades, clean install, legacy regression and production-data audits pass |
| EB-01 | Persisted generic work-source/billable-record entry and summary | Real module APIs/storage prove configured categories, approval, restart, counts and tenant isolation without WhooCrew APIs |
| EB-02 | Markup policy, record reservation and source-backed draft | Deterministic calculation and concurrent no-duplicate/zero-eligible tests pass |
| EB-03 | Original/supplement family and atomic issue | 26-then-4, later-round, retry/restart/concurrency and immutable lineage evidence pass |
| EB-04 | Missed-billing, correction, void and Release for Rebilling | Exception SLA/dedup plus denied, paid, unknown, approval and linked-replacement tests pass |
| EB-05 | Templates, numbering and delivery policy | Legacy compatibility, immutable versions, collision/security and delivery-state tests pass |
| EB-06 | Accounting mapping and provider reconciliation | Real-provider sandbox and failure/recovery/reconciliation evidence pass |
| EB-07 | Integrated G5 verification/UAT | No P0/P1, independent reviews, two-minute role journey and named Product acceptance |

## Build entry blockers

1. WI-OI-013 clears its required IAM gate or a named human records a compliant sequence decision.
2. Product and Finance approve generic input ownership, allocation unit, flat-markup basis, customer-PDF
   cost visibility, draft reservation, void/rebill, delivery, tax, numbering and correction rules.
3. Architecture and Product approve the portable source-record semantics and standalone manual/configured
   adapter; client/WhooCrew integration remains outside this build.
4. Architecture/Data approve the 000003/000004 disposition, additive migration and compatibility plan.
5. Security approves raw-cost classification, permissions, provider secrets and tenant/object isolation.
6. QA/SRE approve representative volumes, two-minute measurement boundary, source/provider failure profile,
   RPO/RTO and evidence plan.

## Release boundary

This work item is not production ready. Build completion alone cannot certify it. G5 requires real
infrastructure/provider evidence, migration/restore, tenant/RBAC, concurrency, accessibility, performance,
resilience, reconciliation and human UAT. G6/G7 require release authority, cohort observation and business
proof. Any open P0/P1, fake provider success, unlocked void record, duplicate allocation or unreconciled
financial correction is `No-Go`.
