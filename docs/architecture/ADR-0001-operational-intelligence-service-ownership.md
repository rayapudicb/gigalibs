# ADR-0001: Operational intelligence service ownership

- Status: Accepted
- Date: 2026-09-02
- Owners: GigaLibs architecture and platform engineering

## Context

The repository contains two overlapping application paths:

- a NestJS and Prisma control plane built from the reusable `packages/*` modules; and
- a Next.js, FastAPI, Celery, Redis, and SQLAlchemy workflow platform.

Both paths currently model authentication, tenants, workflows, runs, and audit records. Allowing both representations to remain authoritative would create inconsistent authorization, migrations, audit histories, and recovery behavior.

The operational-intelligence product must extend the existing platform without a rewrite and must not depend on embedded tenant identifiers, static business data, simulated provider responses, or in-memory production state.

## Decision

1. `apps/playground-api` and `packages/db` are the authoritative control plane until the application is renamed. They own global users, sessions, tenants, memberships, roles, settings, outcomes, connections, policies, workflow definitions, workflow versions, and the audit stream.
2. `apps/workflow-api` is the execution plane. It owns execution leases, step attempts, durable idempotency records, timers, action attempts, exceptions, and recovery state.
3. `apps/workflow-platform` remains the primary web experience. Its server-side routes call the control plane for authentication and proxy authenticated requests without exposing access or refresh tokens to browser JavaScript.
4. The execution plane accepts only authenticated control-plane identities or separately scoped service credentials. It does not maintain an independent end-user password or session store.
5. A workflow version is compiled and signed by the control plane. The execution plane receives the immutable version identifier, checksum, graph, tenant context, and correlation identifier through a versioned command contract.
6. PostgreSQL remains the durable system of record. Control-plane and execution-plane tables may use separate schemas or migration owners, but a business concept has exactly one authoritative owner.
7. Audit events from the execution plane are delivered to the authoritative audit stream through a transactional outbox. They are not maintained as an unrelated second audit chain.
8. Redis and Celery transport work; they are not systems of record. Acknowledged work, idempotency checkpoints, and recoverable failures are persisted in PostgreSQL.
9. Provider credentials are stored by reference in an approved secret manager. Database records and workflow graphs never contain recoverable credential values.

## Migration rules

- Use expand, backfill, switch, and contract migrations.
- Do not delete legacy tables until record counts, checksums, and tenant ownership have been reconciled and rollback evidence exists.
- Convert the current workflow API `orgs`, `members`, and `sessions` ownership to control-plane identity references.
- Reconcile Prisma `WorkflowPipeline` and `WorkflowRun` with the richer versioned execution model before introducing any additional workflow or run table.
- Accounts-receivable invoices remain distinct from supplier invoices and accounts-payable match cases.

## Production invariants

- Authentication and authorization fail closed.
- Tenant context comes from a validated session or service credential, never a request body or untrusted tenant header alone.
- Missing configuration produces an explicit unavailable state; it never activates a local success fallback.
- Runtime code does not synthesize provider, workflow, run, usage, value, or recovery results.
- Release certification uses real PostgreSQL, Redis, and Qdrant services and authorized provider test accounts.

## Consequences

The first delivery increment changes authentication behavior and service boundaries before adding outcome features. Existing prototype routes that relied on fabricated sessions, static tenant identifiers, or simulated workflow results will stop reporting success. This is intentional and required before production data or external write actions can be enabled.
