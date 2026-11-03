# ADR-0040: Model-first entities and a service factory in the module SDK

- **Status:** Accepted by the owner, 2026-11-03 (decision 2 of the analysis §9). Independent Architecture review
  pending.
- **Date:** 2026-11-03
- **Work items:** WI-OI-159 (and WI-OI-158 as first user)
- **Reference:** MedusaJS v2 data model language and `MedusaService` (concepts only).

## Context

- One field is written by hand in six places in three naming styles (migration, domain SQL, record SQL, Zod contract,
  record adapter, window dictionary); the S16 audits exist mainly to keep the copies consistent; record adapters alone
  are about 6,300 lines.
- GigaLibs' strengths must stay: schema per module, row-level security, signed contexts, organization scope, the
  record dispatcher's rules (field policy, permissions, defaults, idempotency, versions, audit), governed windows.

## Decision

1. **`defineEntity`** in `@gigalibs/module-sdk` declares an entity once: fields (text, long text, number with scale,
   money with its currency field, integer, yes/no, date, date-time, value list, reference, extension), constraints
   (required, unique per tenant, default, index), ownership (organization-unit owned or shared), lifecycle
   (ACTIVE/ARCHIVED), labels and help.
2. **Generators** produce from it: an additive SQL migration (refusing destructive changes), the Zod contract, the
   record adapter (list, get, create, update, archive on the shared SQL layer with tenant transactions and
   organization scope), a code/name lookup, window field baselines, entity events (ADR-0039) and the reference replica
   consumer for `reference()` fields.
3. **A service factory** (`moduleRecords`) runs generated adapters through the existing record dispatcher, so every rule
   and audit still applies.
4. **Scope:** master-data-style entities first (new masters, then simple existing ones); domain services with business
   logic (posting, allocation, costing) stay hand-written; existing modules move over only through their own cards.
5. **Generated code must pass** `audit:layers`, S16 windows and conversions, the deployment profile and migration pins;
   a `--check` mode verifies committed generated files.

## Consequences

- A new master is one declaration plus its business rules; naming drift disappears.
- The generator becomes critical code: it is tested against the proof harnesses and reviewed like a security component.

## Alternatives considered

- Adopting Medusa: rejected — loses row-level security, signed per-module contexts, organization scope and governed
  metadata.
- Keeping hand-written adapters: rejected — cost and drift grow with every module.
