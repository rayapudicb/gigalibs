# T9b — Retention classes and legal hold

- **Status:** Core built 2026-10-26 (local). Plan item 3.8. Independent review before deploy.

## What existed

Retention enforcement was coarse: each `TenantEnvironment` carried a single `retentionDays`, and the
`DataRetentionWorker` (playground-api) purged OI `source_events` payloads older than `now − retentionDays`, per
environment, unless an **environment-wide legal hold** (`DataRetentionHold`, ACTIVE/RELEASED) blocked it. Legal hold
already worked; there was no concept of a named, reusable retention policy.

## What T9b adds — named retention classes

A tenant can now define **retention classes**: named policies with their own period and a legal basis, that an
environment adopts so the purge uses the class's period. A legal hold still overrides any class.

- **Schema** (`packages/db/schema.prisma`, migration `20261026000000_retention_classes`): new `RetentionBasis` enum
  (REGULATORY | LEGAL | CONTRACTUAL | OPERATIONAL) and `retention_classes` table (tenant-scoped; `key` slug unique per
  tenant; `name`, `description?`, `retentionDays`, `basis`, `isDefault`, `createdById`, timestamps, soft `archivedAt`).
  A **partial unique index** enforces at most one live default class per tenant. `tenant_environments` gains a nullable
  `retentionClassId` FK (onDelete SET NULL) — null keeps the bare `retentionDays`, so pre-T9b environments are
  unaffected. Additive; generated Prisma client is regenerated at build (not committed).
- **Contracts** (`operational-intelligence/index.ts`): `RetentionBasisSchema`, `RetentionClassKeySchema`,
  `Create/Update/AssignRetentionClassSchema`, pure helpers `retentionCutoff`, `effectiveRetentionDays`,
  `legalHoldBlocksPurge`, and `RETENTION_CLASS_PRESETS` (five sensible starting classes — telemetry 90d, security-audit
  365d, personal-data 1095d, contracts 3650d, financial 2555d — offered as data, not auto-created).
- **Service** (`retention-class.service.ts`): list / create / update / archive / assign-to-environment, each in a
  Serializable transaction with an audit log. Invariants held in code **and** the DB: creating/updating a default
  clears any other default; archiving is soft, detaches adopting environments (so they fall back to their bare period)
  and clears the default flag; an archived class cannot be adopted; a duplicate key or default is a clean 409.
- **Endpoints** (`operational-intelligence.controller.ts`, gated `retention:read` / `retention:manage`):
  `GET/POST retention-classes`, `PATCH/DELETE retention-classes/:classId`, `POST retention-classes/assign`.
- **Purge wiring** (`data-retention.worker.ts`): the worker loads each environment's adopted class and uses
  `effectiveRetentionDays` (class period, else the environment's) through the shared `retentionCutoff`; the legal-hold
  block is unchanged.

## Proof

- Pure logic + schemas + presets: `operational-intelligence/retention-class.test.ts` (7).
- Service invariants (default clearing, archive-detaches-environments, archived-not-adoptable), mocked Prisma per the
  repo's worker-spec pattern: `retention-class.service.spec.ts` (5).
- Contracts + playground-api typecheck green; new files lint clean.

## Deferred (flagged)

- **Per-record classification across modules** — assigning module record kinds to retention classes and purging each
  module's data by its class. This needs a product decision on the classification taxonomy and a per-module purge
  surface; T9b lands the class model, the OI source-events purge, and legal hold.
- A **DB integration test** against a throwaway control Postgres (the mocked-Prisma service spec covers the control
  flow; a real-DB test would also exercise the partial-unique-index default invariant end to end).
- A **retention-classes admin screen** (pairs with the S17 console).
