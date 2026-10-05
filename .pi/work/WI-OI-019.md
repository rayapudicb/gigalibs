# WI-OI-019 — Standalone Customer Invoicing and Accounts Receivable product

Status: Blocked (frozen by the owner 2026-09-28; matches the registry). Corrected by the WI-OI-119 audit (2026-10-05).
Parent requirements: FR-17, FR-14, FR-15, FR-16 and applicable NFRs  
Producer: SDLC Orchestrator coordinating Product, Finance, Architecture, Backend, Web, Data, Security, QA,
SRE, Release, and Documentation roles  
Independent reviewers: Finance/Domain, Solution Architecture, Security & Privacy, QA/SDET, Product  
Current gate: G4 first vertical slice; no G5/G6 certification or release authorization

Prioritization record: on 2026-09-04, repository owner `rayapudicb` directed the team to publish the
proprietary repository and start product-level AR development. This authorizes Build prioritization; it is
not acceptance of security, finance, migration, QA, legal, or production-release risk.

## Outcome

A tenant can run Customer Invoicing and Accounts Receivable as a complete standalone product: configure
its billing entity, maintain customers, issue immutable invoices, deliver them, receive and allocate
payments, issue credits, manage overdue balances, reconcile external receipts, report aging, and prove all
financial actions. The module owns its PostgreSQL schema and can run without another GigaLibs business
module.

## Product boundary

The module owns customer billing profiles, invoice items, numbering, drafts, issued invoice snapshots,
documents, delivery attempts, payments and allocations, credit notes, receivable balances, exceptions,
outbox events, idempotency records, and module audit evidence.

It does not own subscription plan pricing, general-ledger accounting, supplier bills/AP, payment-card
storage, payroll, procurement, or customer identity-provider credentials. Those capabilities communicate
through contracts if installed and never through shared tables.

## First vertical slice after G4 authorization

1. A module administrator completes empty-system setup using OIDC and a module-owned PostgreSQL schema.
2. An AR clerk creates a real customer and draft invoice.
3. The API calculates integer-minor-unit totals and saves the draft with optimistic concurrency.
4. An authorized AR manager issues it once; numbering is allocated atomically.
5. The transaction persists the immutable invoice snapshot, audit evidence, and outbox event together.
6. The standalone UI refreshes from the API and displays the issued invoice; restart does not lose it.
7. Tenant-negative, duplicate/idempotency, concurrency, migration, accessibility, and E2E tests pass.

Delivery, payment providers, credits, reconciliation, aging, subscription metering, and exports follow as
separate vertical slices within the same module work item; no second module enters Build concurrently.

Source-backed event/work-source billing, markup, supplemental invoice families, missed-billing control,
authorized rebilling, customer template/numbering policy and accounting-system reconciliation are refined
under proposed WI-OI-040. Its [implementation and impact plan](../../docs/plans/ar-event-billing-supplemental-invoicing-plan.md)
preserves this manual foundation path and cannot enter Build while WI-OI-013 is active.
The [portability and integration plan](../../docs/plans/universal-invoicing-portability-and-integration-plan.md)
defines how this module becomes a language-neutral contract and conformance pack rather than requiring a
client to adopt the reference implementation's frameworks.

## Subscription-metering boundary

The plan concept “10,000 invoices per tenant per billing month” is usage metering under FR-16. The AR
module emits `ar.invoice.issued.v1` only after commit. A separate entitlement/metering owner counts unique
committed invoice IDs per tenant and billing period. Draft saves, previews, resends, retries, and webhook
redelivery do not increase usage.

Recommended commercial default: warnings at 80%, 90%, 99%, and 100%; 10,000 included invoices; and
explicit overage after 100% rather than blocking a tenant from collecting revenue. A hard cap is a
commercial/risk decision requiring human approval. At 99%, usage is 9,900 of 10,000.

## Acceptance and negative cases

- Tenant identity comes from a verified token, never a request body or trusted browser flag.
- Users cannot view, infer, export, change, issue, pay, credit, or void another tenant's records.
- Issued invoices are immutable; corrections use credit notes or governed voids.
- Invoice numbers are unique within billing entity and series, with no duplicate under concurrency.
- Monetary values use integer minor units plus ISO currency and explicit rounding/tax rules.
- Duplicate issue, delivery, payment, allocation, webhook, and event requests are idempotent.
- Payment data is accepted only through approved hosted/tokenized providers; card data is never stored.
- Failed providers produce visible, durable exceptions, not fake success.
- Every financial transition records actor, tenant, reason, prior/new state, correlation, and time.
- Data persists across refresh/restart and passes clean install, upgrade, restore, and reconciliation tests.
- The module builds and starts independently; required module dependencies remain empty.

## Gate evidence and handoff

| Gate | Evidence required | Status / next owner |
| --- | --- | --- |
| G0 | Existing-code inventory, AP/AR separation, Invoice Ninja license boundary, outcome/non-goals | Drafted; Product and Finance review |
| G1 | Approved FR-17 stories, roles, policies, classifications, SLO/RPO/RTO and 10k-meter policy | Open; Product/Finance/SRE decision |
| G2 | ADR, threat model, permission matrix, data ownership/schema, migrations/recovery, deployment modes | Draft structure only; Architecture/Security/Data review |
| G3 | OpenAPI/AsyncAPI, UI states, test matrix, representative 10k+ tenant volume | Draft contracts pending independent review |
| G4 | UI/API/domain/PostgreSQL/outbox/audit/telemetry vertical slice, no mocks | Foundation implementation and local verification complete on `feat/WI-OI-019-ar-foundation`; independent review remains open |
| G5 | Full independent integration/security/E2E/load/accessibility/recovery/UAT evidence | Not started |
| G6 | Immutable images/charts/SBOM/signatures/provenance, rollout and human release approval | Not started |
| G7 | Production SLO, incident, cost and business-outcome observation | Not started |

## Current G4 implementation evidence

- Domain, API, worker, and production Next.js builds pass locally (100/100 Turbo tasks).
- PostgreSQL 16 forward migrations 000001 through 000013 applied cleanly with zero schema drift.
- Migration 000013 repaired schema_migrations ledger (backfilled version 6) and verified all 28 tenant tables have row-level security enabled (`rowsecurity=t`).
- DatabaseService upgraded with `bootstrapCheck()` enforcing exactly 13 applied migrations, rejection of superuser / BYPASSRLS roles, and added `queryWithTenant()` and `withTenantTransaction()` setting `app.tenant_id` before all queries.
- Truth-boundary tests (`ar-truth-boundary.test.ts`) and expanded runtime-config tests (`runtime-config.test.ts`) added and passing.
- AR-03: S3/MinIO Object Storage adapter for invoice PDF renders with presigned time-limited download URLs and database bytea fallback.
- AR-04: Hosted payment checkout sessions (Stripe/Adyen) with overpayment prevention and outbox publication; inbound HMAC webhook verification with timing-safe digest comparison and idempotent deduplication via `payment_webhook_events`.
- FR-17-EB: Universal work-source event billing foundation with summary calculations (EB-01), markup engine (EB-04), supplemental invoice family generation (EB-02/03), and 30-record partial-billing lifecycle verification (EB-14).
- BFF route boundary in `workflow-platform` whitelists and enforces server-side permissions across all AR lifecycle actions.
- 86 test files, 753 automated tests passing with 100% pass rate.
- Customer-managed turnkey Compose suite (`check-prerequisites.sh`, `generate-credentials.sh`, `backup.sh`, `restore.sh`) verified.

## Human decisions required before G5 and release

- Approve customer segment, countries/tax scope, invoice/credit/void legal policy, and system of record.
- Approve invoice-meter overage versus hard-cap behavior and price/period semantics.
- Name independent Finance, Security, QA, Architecture, and Release reviewers.
- Resolve or formally contain Release 1 P0/P1 blockers.
- Maintain the approved proprietary public-source license and contribution policy; review any future
  license change separately.
- Select supported OIDC, email, object-storage, and first payment-provider production profiles.
