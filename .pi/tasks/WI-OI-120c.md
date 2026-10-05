# WI-OI-120c (U2): ERP module APIs accept, save and record real business data

- **Status:** Completed (committed, 2026-10-05)
- **Work item:** WI-OI-120 (UAT and production readiness programme). Evidence goes in `.pi/work/WI-OI-120.md`
  (section U2).
- **Size:** L

## Goal

Signed-in users can create and read real records in Product Catalogue, Inventory, Procurement, Orders and Finance
through the web app. Every command saves its data and its event in one transaction, exactly once. This is the backend
foundation every real business flow (U7–U18) needs.

Audit findings closed: P0-09, P1-02, P1-03, P1-09, P1-18 and P1-23 (`docs/audits/2026-10-04-production-readiness/README.md`).

## Scope

- **May change:**
  - new forward migrations for `gigalibs_inventory`, `gigalibs_orders`, `gigalibs_procurement` and
    `gigalibs_finance`, plus their runtime manifests and regenerated compose (versions bumped);
  - the API services of those four modules: `finance.service.ts`, `costing.service.ts`,
    `consolidation.service.ts`, `budgeting.service.ts`, `close.service.ts`, `orders.service.ts`;
  - `apps/workflow-platform/lib/signed-module-proxy.ts`;
  - tests, `.pi/work/WI-OI-120.md`, `.pi/NOW.md`, this card.
- **Must not change:** already-applied migrations, the screens (U7–U18 rebuild them), other modules, the running UAT
  instance (deploy waits for the owner).

## Steps

1. **Sign-in check (P1-02).** Forward migrations give the `auth_revocation_events` tables of Inventory, Orders,
   Procurement and Finance the columns the module SDK guard queries (`revocation_type`, `session_id`, `subject_id`,
   `invalid_through_auth_version`), keeping existing rows. Product Catalogue is the reference.
2. **One transaction per command (P0-09).** `postJournal` takes the caller's transaction, so costing and
   consolidation post the journal and write the event in the same transaction. A journal carries an idempotency key
   (a unique constraint per tenant and source document) so a retry never posts twice.
3. **Event writes (P1-03).**
   - Consolidation writes to `outbox_events`, not the missing `outbox` table.
   - Costing, budgeting and close inserts supply every required column (aggregate type, id and version, correlation
     id, schema version).
4. **Order allocation (P1-09).** Each allocation event gets its own aggregate version, so a second partial allocation
   of a line succeeds.
5. **Row-level security (P1-18).** A forward migration enables and forces RLS on Finance's three `org_replica_*`
   tables with tenant policies, like the other modules.
6. **Proxy (P1-23).** `signed-module-proxy.ts` forwards a valid `Idempotency-Key` (UUID) and `If-Match` header on
   writes and rejects malformed ones.
7. **Proof:**
   - real runner migrations on an isolated PostgreSQL 16;
   - HTTP tests per module through the module host with a signed context (read, create, retry the same key, second
     allocation, costing and consolidation commands, cross-tenant refusal);
   - `pnpm build`, `pnpm test` and the static audits.

## Done when

- [x] On an isolated PostgreSQL 16, every new migration applies on a fresh install and on a copy of the current UAT
  schema state
- [x] HTTP tests show signed-in reads and creates succeed for the five modules, a retried command is saved once, and
  another tenant's records are refused (retry proven on Product Catalogue, the only module with request-level
  idempotency today; the others gain it with F1)
- [x] Costing, consolidation, budgeting and close commands succeed, and a failed command leaves no journal behind
- [x] Creating a product works through the proxy (`Idempotency-Key` forwarded)
- [x] `pnpm build`, `pnpm test` and static audits pass; evidence recorded; deploy handed to the owner

## Stop and ask if

- a migration would need to edit an applied one, or drop data;
- a fix needs a screen change (that belongs to U7–U18).

## Report

At most five bullets: what changed, the evidence, what's next, and what the owner must decide.
