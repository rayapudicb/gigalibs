# End-to-end module delivery plan

Work item: WI-OI-019  
Rule: one product module in Build at a time

| Phase | Work | Deliverable artifacts | Exit evidence |
| --- | --- | --- | --- |
| G0 Discovery | Users, outcomes, AP/AR split, existing code/data inventory, reference-license review, system of record | Gap inventory, product boundary, non-goals, risks | No duplicate owner, hidden mock, or unresolved source-of-truth decision |
| G1 Requirements | Journeys, roles, finance policies, 10k meter, tax/country scope, SLO/RPO/RTO, acceptance/negative cases | Approved FR-17 stories, permission/value/test ownership | P0/P1 requirements are testable with named owners/reviewers |
| G2 Architecture | Standalone identity, data model, transactions, outbox, threats, provider boundaries, migrations, DR, deployment modes | ADRs, threat/data-flow model, schema and migration/recovery design | No unresolved critical security, financial, or data-loss risk |
| G3 Experience/contracts | Page/state designs, OpenAPI, AsyncAPI, errors, idempotency, ETags, test/load profiles | Reviewed contracts, UI state map, test plan | First vertical slice independently demonstrable by specification |
| G4 Build | UI + API + domain + PostgreSQL + worker/outbox + auth/RBAC + audit/telemetry, one vertical slice at a time | Source, forward migrations, generated SDK, container builds, implementation record | Module-completeness gate; zero production mocks/fake success |
| G5 Verify/UAT | Unit, contract, DB, migration, tenant/RBAC, E2E, accessibility, load, chaos, backup/restore, reconciliation | Signed QA/security/finance evidence and defect closure | No P0/P1; human Product acceptance |
| G6 Release | Lock/sign artifacts, SBOM/provenance, migration rehearsal, canary/cohort plan, support/on-call | OCI images, Helm/Compose/migration bundles, docs, immutable manifest | Named human release approval and canary thresholds pass |
| G7 Observe | SLO/errors/queues/security/cost/usage/value review, restore and incident drills | Production observation report and improvement backlog | Observation window passes with no critical incident |

## G4 vertical-slice order

1. Standalone empty-system setup, OIDC, tenant mapping, module roles, readiness.
2. Customer + draft + atomic issue + immutable snapshot + audit/outbox + UI refresh.
3. Reconcile migrations 000003/000004 with the runtime/deployment path before depending on their schema.
4. Versioned timesheet/payroll source ingestion + event billing summary and freshness evidence.
5. Markup policies + source-record reservation + original/supplemental draft generation.
6. Atomic invoice-family issue + missed-billing exceptions + controlled void/Release for Rebilling.
7. Immutable customer template versions + safe numbering tokens + explicit delivery policy.
8. PDF/object storage + email delivery + receipt/retry/exception UI.
9. Accounting-system mapping + provider sync receipts, retry and reconciliation.
10. Manual receipt + payment allocation + partial/full balance invariants.
11. Hosted payment provider webhook + settlement reconciliation.
12. Credit notes, refunds/disputes, on-account balance policy and post-issue source corrections.
13. Aging, statements, collections/reminders, reports and governed exports.
14. Subscription-metering integration through events; no AR database access by metering.
15. Standalone deployment profiles, upgrades, backup/restore, performance/resilience hardening.

Steps 3–9 are specified by WI-OI-040 in
[`../../../docs/plans/ar-event-billing-supplemental-invoicing-plan.md`](../../../docs/plans/ar-event-billing-supplemental-invoicing-plan.md).
They are additive to the existing manual invoice foundation and remain outside Build until the active IAM
gate and WI-OI-040 Definition of Ready blockers are closed.

Every slice includes frontend, API, persistence, migration, permissions, audit, telemetry, failure/recovery,
tests, docs, and evidence. A later slice cannot hide a P0/P1 from an earlier slice.
