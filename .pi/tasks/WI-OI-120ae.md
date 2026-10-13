# WI-OI-120ae: Idempotency-Key answers belong to their caller, and are swept

- **Status:** Carded, not started (owner, 2026-10-13: "card I3/I4"). Shown to the owner before it starts.
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

- [ ] A replay answers only its own caller; the second caller with the same key gets 409.
- [ ] Each module that uses the store sweeps old answers, with the window configured.
- [ ] Tests and evidence recorded; Security review.
