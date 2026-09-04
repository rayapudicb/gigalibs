# Release 0 current-state and gap map

- Assessment date: 2026-09-02
- Scope: GigaLibs Operational Intelligence and Action Platform
- Technical assessment: complete
- Product/architecture gate: approval remains an organizational decision

## Production deployment boundary

Only the following applications form the current operational-intelligence production path:

| Runtime | Responsibility | Authoritative data |
| --- | --- | --- |
| `apps/workflow-platform` | Next.js business experience and authenticated browser-facing routes | No independent business store; secure HTTP-only session cookies |
| `apps/playground-api` | NestJS control plane and policy boundary | Prisma control database: identity, tenant, workflow definition/version and audit |
| `apps/workflow-api` | FastAPI execution API | SQLAlchemy execution database: runs, attempts, checkpoints and outbox |
| `apps/workflow-api/workers` | Celery execution and outbox workers | Uses execution database; Redis is transport only |

`apps/playground-web` is an existing demonstration/prototype application. It contains hard-coded display records, simulation controls and fallback data and is not certified or included in the operational-intelligence production experience. Legacy FastAPI routers other than `routers/runs.py` are not registered by `main.py`; they are retained for later reconciliation and cannot be treated as implemented product APIs.

This deployment boundary prevents prototype behavior from being mistaken for production behavior while preserving the existing code for deliberate migration rather than destructive rewrite.

## Repository inventory

- 191 package manifests: 5 JavaScript applications, 129 top-level packages and 56 integration packages.
- Web applications: the existing Vite playground, the Next.js workflow platform, documentation and Storybook scaffolds.
- APIs: the NestJS control plane and FastAPI execution plane.
- Durable stores: Prisma/PostgreSQL for control data; SQLAlchemy/PostgreSQL for execution data.
- Work transport: Celery with a dedicated Redis broker/result backend and PostgreSQL transactional outbox.
- Supporting development services: control Redis, MinIO and Meilisearch.
- Migrations: three Prisma control-plane migrations and one Alembic execution-plane head at the assessment date.
- Existing role model: `SUPER_ADMIN`, `TENANT_ADMIN`, `MANAGER`, `MEMBER`, `VIEWER`, and `GUEST`, with custom member permissions. The blueprint's business-role vocabulary still requires productization rather than a duplicate authorization system.

## Existing route and screen map

### Certified operational workflow screens

- login and tenant selection;
- workflow list, create and visual draft/version canvas;
- run list and run evidence/detail;
- dashboard shell.

### Certified operational workflow API surface

- authentication: register, login, refresh, select tenant, context and logout;
- tenancy: list, create, current tenant and controlled status transition;
- authorization context;
- workflow draft, detail, version publish/list and execution specification;
- durable run create/list/detail/cancel;
- internal signed execution-audit ingestion and tenant-scoped audit read.

### Existing reusable modules

The repository already contains reusable packages for approvals, audit, billing, forms, invoices, knowledge, reports, rules, storage, tenancy, tickets, workflow and many provider adapters. Package presence is not certification: several are type/domain libraries, stubs or demonstration implementations. They must be reused only after their persistence, tenant boundary, error behavior and tests satisfy the blueprint Definition of Done.

## Security and credential map

Implemented on the certified path:

- JWT validation backed by an active server-side session;
- active tenant membership and tenant-status validation;
- explicit public and tenant-boundary exceptions;
- permission checks on workflow endpoints;
- HTTP-only browser cookies with token rotation;
- signed service-to-service audit delivery;
- encrypted execution payloads;
- HTTP egress allowlist, private-network policy, timeout and response-size limits;
- workflow secret-pattern rejection and credential references rather than recoverable values;
- cross-tenant API denial tests.

Confirmed gaps:

- enterprise SSO and MFA policy;
- external credential-vault integration and credential revocation propagation tests;
- object-store, cache and vector-layer tenant-isolation certification;
- break-glass support access;
- export reason/scope controls;
- dependency, image and infrastructure scanning gates;
- backup/restore and disaster-recovery evidence.

## Mock, fallback and hard-coded behavior audit

### Removed from the certified path

- client-side authentication fallback;
- simulated workflow/run states in the Next.js workflow experience;
- embedded control database connection fallback;
- unvalidated tenant headers as identity;
- unsupported node success responses;
- duplicate execution-start ownership.

### Quarantined outside the certified path

- prototype workflow, trigger, usage and AI modules under unregistered FastAPI routes;
- the Vite playground's static tenant, sample records and simulation actions;
- placeholder integration packages and UI packages with unimplemented exports;
- provider demonstrations that return constructed URLs or success objects without performing the external operation.

These modules remain source assets, not production capabilities. They must not be imported into the certified applications until remediated and tested.

### Shared-library risks to remediate when activated

- Redis helpers currently allow a localhost fallback;
- the legacy chat gateway has a fallback signing key, wildcard CORS and default tenant behavior;
- the legacy storage service constructs URLs without persisting objects;
- base configuration contains development defaults;
- several prototype React packages recover to local demo state when APIs fail.

## Migration map

1. Preserve existing control tables and add fields/tables through Prisma migrations.
2. Preserve execution ownership in its separate Alembic migration chain.
3. Extend existing `WorkflowPipeline`, `WorkflowVersion`, `AuditLog`, tenant, billing, rule and invoice concepts; do not create same-concept aliases.
4. Keep accounts-receivable `Invoice` separate from new supplier/AP documents.
5. Reconcile legacy `WorkflowRun` rows before any contract migration removes that table.
6. Migrate reusable prototype UI behavior into `workflow-platform`; do not deploy the prototype application as the new product.

## Requirement and epic disposition

| Requirement / epic | Reuse | Gap / action |
| --- | --- | --- |
| FR-01 / Outcome Catalog | Workflow and tenant ownership | Add outcome template, activated tenant outcome, metrics and value assumptions |
| FR-02 / GL-EP03 | Integration packages and egress policy | Add registry, vault reference, readiness checks, profiling, masking and health |
| FR-03 / GL-EP04 | Celery, Redis, PostgreSQL outbox/checkpoints | Add connector-specific paging, rate limits, circuit breaker and DLQ |
| FR-04 | Durable command idempotency | Add common source-event envelope and webhook/file/database ingestion |
| FR-05 | Published JSON Schema/checksum | Add source schema versions, mappings and breaking-change detection |
| FR-06 | Rule-engine packages and persisted rules | Certify deterministic AP rules and boundary cases |
| FR-07 / GL-EP06 | Knowledge/AI packages | Add evidence authorization, citations, model policy, validation and cost record |
| FR-08 | Certified workflow foundation | Add wait, approval, real parallel scheduling, compensation and recovery certification |
| FR-09 | HTTP idempotency and egress controls | Add action catalogue, dry run, policy, approval and reconciliation |
| FR-10 / GL-EP07 | Persisted failed/DLQ attempts | Add operator inbox, assignment, retry/replay/edit-and-replay and reconciliation |
| FR-11 / GL-EP08 | Run list/detail | Add live business cases, SLA, impact, ownership and event latency |
| FR-12 | Billing and audit foundations | Add value formulas, value events, cost, evidence and approval |
| FR-13 / GL-EP09 | No reusable certified module | Add isolated expiring demo workspace and reset/deletion evidence |
| FR-14 / GL-EP10 | Tenant/RBAC/settings foundations | Add business roles, environments, SSO, quotas, branding, retention and region controls |
| FR-15 / GL-EP11 | Append-only audit foundation | Extend coverage to configuration, decision, approval, action and export |
| FR-16 / GL-EP12 | Existing billing models | Add execution/AI/storage/connector meters, forecast, warning and cap |

## Release 0 exit evidence

- [ADR-0001](architecture/ADR-0001-operational-intelligence-service-ownership.md) defines authoritative service and migration ownership.
- [Implementation status](operational-intelligence-implementation-status.md) tracks current blueprint coverage.
- Production and prototype paths are explicitly separated above.
- Existing screens, routes, persistence, workers, roles, integrations, credentials, isolation, tests and known risks have been mapped.
- The smallest next vertical slice is the Release 1 AP flow; no platform rewrite is required.

The technical discovery deliverable is complete. Formal sign-off by a named architecture and product owner should be recorded through the organization's change-control system before an external production release.
