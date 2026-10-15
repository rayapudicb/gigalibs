# WI-OI-120as: Cross-module relays have delivered nothing since 2026-10-01

- **Status:** Carded, not started (found 2026-10-15 in WI-OI-120ar S2, read-only). Shown to the owner before it starts.
- **Plan v3:** belongs with step 0.8 (the journey follow-ups), before Phase 1. CMMS staffing (1.1, 1.3) depends on it.
- **Work item:** WI-OI-120. Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** S to M, depending on the cause.

## What UAT shows (read-only, 2026-10-15)

**Last delivery:** Geospatial, Workforce and CMMS all last published an outbox event at **2026-10-01 02:25Z**. Since
then every new event stays PENDING with 0 attempts:

| Module | Pending | Failed | Delivered | Newest pending |
| --- | --- | --- | --- | --- |
| Workforce | 5,025 | 122 | 190 | today |
| CMMS | 789 | — | 116 | today |
| Geospatial | 59 | 980 | 11,162 | 2026-10-01 |

**Workforce's pending events:**
- punches (2,849);
- resources (461);
- availability patterns (280);
- time corrections (243);
- bookings (210);
- time exceptions (94);
- capabilities (78);
- engagements (72).

**CMMS's pending events:**
- Workforce facts applied (191);
- work orders created (127);
- status changes (71);
- assets (70);
- notes (64);
- part issues (40);
- stock issues (40);
- spaces (38).

The CMMS staffing requests for Workforce are among them.

**The relays are configured but claim nothing.**
- Workforce, CMMS and Geospatial have their relay target URLs and keys set. None logs "not configured", and none
  logs an error.
- The SDK relay (`packages/module-sdk/src/outbox-relay.ts`) leases rows on every tick; here it leases none.
- Causes to test, in order:
  - the lease function's filter (route, topic or `available_at`) since a migration near 2026-10-01;
  - the relay timer not starting;
  - the release's relay configuration.

**The module host has no relay settings at all.** Finance (12), Inventory (10), Orders (10) and Procurement (1) have
outbox rows held LEASED since 2026-10-04, and never published.

**Dead letters (decision 0.7g):**
- **Geospatial, 980 failed:** all `SpatialNodeChangedV1`, all from 2026-09-26, refused by Analytics with HTTP 401
  after 1 attempt, in 6 workspaces. None is superseded by a later delivered event for the same node.
- **Workforce, 122 failed:** `WORKFORCE_POSITION_CREATED_V1` (61, 2026-09-27/28) and
  `WORKFORCE_POSITION_SNAPSHOT_V1` (61, 2026-10-02), refused with HTTP 400.
- **Control plane, 13 failed:**
  - 12 old supplier-invoice validation failures (2026-09-02/03);
  - 1 `party.created.v1` that the control outbox does not support (2026-10-06).

## Design (to be confirmed after the cause is found)

1. **Find the cause,** read-only first:
   - the lease function's SQL on UAT;
   - the migrations around 2026-10-01;
   - the relay start in each API.
2. **Fix it in code and release it.** A data change, if any, is an owner-run, backed-up step.
3. **The backlog:**
   - replay what a consumer still needs (CMMS staffing, Analytics facts);
   - let retention sweep what no consumer is routed for;
   - for the 980 and 122 dead letters, replay or discard by the owner's choice, once the cause of their 401 and 400
     is known.
4. **The module host:** relay settings, or a stated "no consumer yet" with its leases released.
5. **A check that a stalled relay is seen**, so it is not silent for two weeks again: a health or metric signal.
   This belongs to O3 observability (step 1.19).

## Done when

- [ ] The cause is known and fixed on UAT: new events are delivered.
- [ ] The backlog and dead letters are replayed or discarded by the owner's choice, with counts recorded.
- [ ] A stalled relay shows up in health or metrics.
- [ ] Journey rerun.
