# Customer Invoicing and Accounts Receivable

Lifecycle: G0–G3 design under `WI-OI-019`  
Runtime status: not implemented, not certified, and not included in the pnpm production workspace

This directory is the boundary of an independently deployable AR product. It will own a standalone
Next.js UI, NestJS API, worker, PostgreSQL schema and migrations, public contracts, deployment packages,
tests, operations, and release evidence.

It has no required GigaLibs business-module dependency. Suite identity, metering, ledger, and provider
integrations are optional contract-based connections. The module never reads or joins their databases.

## Planned user outcome

Finance users can create customers and drafts, issue immutable invoices, deliver them, receive and
allocate payments, issue credits, work exceptions, reconcile settlements, report aging, and audit every
material action using real persisted data.

## First implementation slice

The first G4 slice will be empty-system setup → customer → draft → issue → persisted issued invoice →
outbox/audit → standalone UI refresh. It begins only after the G1–G3 reviews and current Release 1 blocker
decision recorded in `.pi/work/WI-OI-019.md`.

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
