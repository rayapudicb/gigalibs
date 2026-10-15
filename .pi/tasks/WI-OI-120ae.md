# WI-OI-120ae: Idempotency-Key answers belong to their caller, and are swept

- **Status:** On UAT (release `d17db37`, owner deploy 2026-10-15; journey `9jh56k` passed; Security review approved,
  three Low follow-ups proposed). Owner decisions: 409 for another caller; a 7-day window, configurable per module.
- **Found by:** the independent Security review of WI-OI-120u Slices 1–2 (finding I3, informational).
- **Work item:** WI-OI-120. Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** S

## Why

The module SDK's record dispatcher runs a create or an action once per Idempotency-Key
(`packages/module-sdk/src/record-dispatcher.ts`, `once`; `record-idempotency.ts`). Two gaps:

- **Not tied to the caller.**
  - A claim is keyed by tenant and key. The operation names the record type and action, and the request hash covers
    the body. Neither includes the caller.
  - If a second user sends the same key with the same body, they get the first user's stored answer and nothing is
    created.
  - For per-user records, such as Workforce's My absences, that answer is someone else's record.
  - Keys are random UUIDs made by each browser, so this is not practical to exploit today. It is still a boundary the
    store should hold.
- **Never swept.**
  - `record_idempotency` (Inventory, Catalogue, Workforce, and every module that adopts the store) keeps every
    response for good.
  - Those responses include absence notes and decision reasons.
  - Only abandoned IN_PROGRESS claims are taken over, after 600 seconds; COMPLETED rows are never deleted.

## Design (to be confirmed with the owner)

1. Bind the subject into the claim (part of the operation or the request hash), so another caller's key is refused
   as a different request (409), never replayed.
2. A retention sweep per module: delete COMPLETED rows older than a set window (for example 7 days), run by each
   module's existing outbox-retention style job, with the window in its runtime configuration.
3. Tests: same key and body from two users answers 409 for the second; rows past the window are swept; a retry inside
   it still replays.

## Scope

- **May change:** `packages/module-sdk` (dispatcher and store), module runtime configuration and retention jobs.
- **Must not change:** applied migrations (forward only, if an index is needed), other agents' work.

## Done when

- [x] A replay answers only its own caller; the second caller with the same key gets 409.
- [x] Each module that uses the store sweeps old answers, with the window configured.
- [ ] Tests and evidence recorded; Security review.

## Built (2026-10-15)

- **Bound to the caller** (`packages/module-sdk/src/record-dispatcher.ts`, `once`): the request hash covers the
  operation, the caller's subject and the body. Another person's same key and body is a different request
  (`RECORD_IDEMPOTENCY_KEY_REUSED`, 409), never a replay; the first caller still gets their answer.
  - No migration: the hash column already exists.
  - At the deploy, a retry of a request made just before it gets a 409 instead of a replay, because the hash formula
    changes. Keys are per request, so this matters only for a retry spanning the deploy.
- **Swept** (`record-idempotency.ts`):
  - **Where:** each claim first deletes the claiming tenant's COMPLETED answers older than the window, at most 500,
    in the same tenant transaction and under the module's forced RLS. IN_PROGRESS claims and other tenants' rows
    are untouched.
  - **The window:** `<PREFIX>_IDEMPOTENCY_RETENTION_DAYS` (default 7, 1–365), read by
    `loadIdempotencyRetentionDays`. Workforce (`WORKFORCE`), Inventory (`UNIVERSAL_INVENTORY`), Catalogue
    (`PRODUCT_CATALOGUE`) and Finance (`FINANCIAL_OPERATIONS`) pass it to their store.
  - **Why not the design's outbox-style job:** the runtime role sees one tenant at a time, so a cross-tenant job
    would need a new definer function in four modules' migrations. The owner was told no migration should be
    needed.
  - **Limit:** a tenant that never writes again keeps its old answers until its next claim. They stay readable only
    by the same caller, with the same key and body.
- **Tests:**
  - dispatcher: a colleague's same key and body gets 409, the record is created once, and the first caller still
    replays;
  - `record-idempotency.test.ts`: the window's default and bounds; the sweep runs first, bounded, for the claiming
    tenant only;
  - `record-idempotency.integration.test.ts` on PostgreSQL 16, run against a throwaway local database (removed
    after):
    - an answer completed 8 days ago goes with the next claim;
    - a recent answer, an IN_PROGRESS claim and another tenant's old answer stay;
    - a 30-day store keeps an 8-day-old answer.

    6/6 pass.
- **Proof:** against HEAD's dispatcher the colleague gets 200, a replay of the first person's answer.
- **Verification:**
  - module SDK and the four modules type-check clean;
  - 339 tests pass in the SDK and the four modules;
  - lint: the same findings as HEAD on the touched files, with the new lines wrapped.

## Security review of release d17db37 (2026-10-15): approve

No High or Medium.
- **Verified:**
  - the subject comes from the signed context's required `sub`;
  - claims are tenant-scoped;
  - the sweep runs in the tenant transaction under forced RLS, deletes only COMPLETED rows past the window, bounded,
    and the runtime role may delete;
  - the bounds and the four modules' wiring are correct.
- **Low 3:** the sweep's subquery has no supporting index, so each claim scans about a window's worth of the tenant's
  rows; concurrent claims can wait on each other's row locks, and a deadlock is possible in theory (the claim fails
  once and can be retried). Fix: `FOR UPDATE SKIP LOCKED` in the subquery; later, if volume grows, a forward
  migration with a partial index on `(tenant_id, completed_at) WHERE state = 'COMPLETED'`.
- **Info:** at the deploy, a client that resubmits with a new key after a 409 could create a duplicate, for requests
  in flight across the deploy only.

## Step 0.5b, the review's Low 3 (2026-10-15; owner: "proceed"): built and verified locally

- The sweep's subquery takes `FOR UPDATE SKIP LOCKED`, so a claim never waits on rows another claim is removing.
- **New PostgreSQL test:** another transaction holds an expired answer. The claim returns at once (under 2 seconds)
  and the row goes with the next claim. Against the store without `SKIP LOCKED`, the same test waited until its
  8-second timeout. 7/7 pass on a throwaway database.
- The partial index (`(tenant_id, completed_at) WHERE state = 'COMPLETED'`) waits until volume needs it (about 24–66
  rows per module on UAT today), as a forward migration.
