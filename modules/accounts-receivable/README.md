# Customer Invoicing and Accounts Receivable

Lifecycle: G4 implementation under `WI-OI-019`
Runtime status: foundation slice implemented and independently runnable; full AR product not certified

This directory is the boundary of an independently deployable AR product. It owns a standalone
Next.js UI, NestJS API, worker, PostgreSQL schema and migrations, public contracts, deployment packages,
tests, operations, and release evidence.

It has no required GigaLibs business-module dependency. Suite identity, metering, ledger, and provider
integrations are optional contract-based connections. The module never reads or joins their databases.

## Product outcome

Finance users can create customers and drafts, issue immutable invoices, deliver them, receive and
allocate payments, issue credits, work exceptions, reconcile settlements, report aging, and audit every
material action using real persisted data.

## Implemented foundation slice

The current G4 slice is empty-system setup → customer → draft → revision → atomic issue → immutable invoice
snapshot → audit/outbox → signed at-least-once webhook → standalone UI refresh. It includes generic OIDC,
forced tenant RLS, idempotency, optimistic concurrency, keyset pagination, OCI build definitions, Compose,
Helm, migration recovery instructions, and Playwright restart-persistence evidence.

This is not the full AR outcome. Document/PDF delivery, payments and allocation, credits/voids, hosted
payment-provider reconciliation, statements/aging/collections, portal, governed export, full accessibility,
load/chaos/restore evidence, independent review, and release artifacts remain open.

## Directory map

```text
apps/       Standalone web, API, and worker applications
domain/     Module-owned business rules (created during authorized Build)
contracts/  Draft OpenAPI, AsyncAPI, and schemas
db/         Data design, forward migrations, verification, test-only generators
deploy/     Docker, Compose, Helm, Terraform, and air-gap packaging
tests/      Cross-layer certification suites and evidence guidance
docs/       Requirements, architecture, product guides, and runbooks
release/    Exact artifact, compatibility, and evidence manifests
```

Do not copy Invoice Ninja source into this module. The local Invoice Ninja 5 reference is Elastic License
2.0 and is incompatible with providing its substantial functionality as GigaLibs hosted SaaS.
