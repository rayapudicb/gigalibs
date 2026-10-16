# WI-OI-120as: Cross-module relays: no stall found; make their health visible

- **Status:** Approved (owner, 2026-10-15: "approved 120as", then "approved A, B, C"). Investigated: no stall. A built
  locally; B in plan v3; C carded as WI-OI-120aw.
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

## Investigation (2026-10-15, read-only): the relays are not stalled

The first reading ("delivered nothing since 2026-10-01", WI-OI-120ar S2) was wrong about the cause.

- **Each relay leases only the event types routed to its peer.** The rules are in its definer function on UAT:

  | Relay | Function | Leases |
  | --- | --- | --- |
  | Workforce → CMMS | `relay_lease_cmms_events` | Work-requirement and booking events whose `sourceType` is `CMMS_WORK_ORDER` |
  | Workforce → Analytics | `relay_lease_analytics_positions` | Position facts |
  | CMMS → Workforce | `relay_lease_workforce_events` | `CMMS_STAFFING_REQUESTED_V1` and `CMMS_STAFFING_CANCELLED_V1` |
  | Geospatial → Analytics | `relay_lease_analytics_places` | `SpatialNodeChangedV1` |

- **Routed and pending right now: 0 for every relay.** Nothing routed has happened since 2026-10-01:
  - 22 CMMS work orders were created, but no staffing requests;
  - no node changes and no positions.
- **The thousands of PENDING rows are unrouted facts, by design:**
  - punches, resources and time events;
  - the 210 bookings, all `MANUAL`;
  - CMMS work-order events;
  - Geospatial node-type events.

  No consumer is routed for them. The retention sweeper deletes them after 30 days (from about 2026-10-26).
- **The dead letters are certification test data, so none is to be replayed (zero mock):**
  - **Geospatial 980** (HTTP 401, 2026-09-26): tenant IDs `wi-oi-063-cert-a-20260926T…`, which have no workspace
    row.
  - **Workforce 122:**
    - 114 belong to tenants that no longer exist;
    - 8 belong to `wi-oi-065-web-…` test workspaces.
    - The 61 `…POSITION_CREATED_V1` also have a pre-2026-10-02 shape that Analytics' strict schema refuses.
  - They stay as dead letters (retention keeps dead letters), or go with the proof-data clean-up below.
- **The module host has no relay configured on UAT** (Finance, Inventory, Orders, Procurement). 33 leased and 18
  pending rows date from 2026-10-04 to 10-06, before the cutover. Their leases have expired, so a configured relay
  would pick them up. This matters when those modules are released; it is noted for M-FIN1, M-INV1, M-ORD and M-PROC.
- **What is really missing:** a relay logs nothing on an empty pass, so "running with nothing to do" cannot be told
  from "not running". That is how this looked like a stall.
- **Wider finding, for the owner's proof-data decision:** UAT has 329 workspaces. 57 certification workspaces are
  still ACTIVE: `wi-oi-038` (6), `wi-oi-063` (22), `wi-oi-064` (8), `wi-oi-064c` (10), `wi-oi-064e` (4), `wi-oi-065`
  (7). Many trial and journey workspaces are active as well.

## Re-scoped work (for the owner)

1. **Relay health (code, small).** Each relay records its last pass and its last delivery, and a routed backlog
   older than a threshold shows in `/health` or the metrics (O3, step 1.19, can alert on it). This also proves the
   relays run.
2. **Module-host relays:** configured when those modules are released, as a condition on their cards.
3. **Dead letters:** none replayed; they go with the proof-data clean-up.
4. **New card, if the owner wants it:** an owner-run, backed-up clean-up of certification and old test workspaces on
   UAT. Suspend or cancel them, as for the brand workspaces; the old decision D5 on historical proof data.

## A, relay health (2026-10-15): built and verified locally

- **Module SDK** (`relay-health.ts`):
  - each `OutboxRelay` registers itself on start-up and records its last finished pass (also when it leased
    nothing), what it leased, its deliveries and its last failure (code and time);
  - its state is `not-configured`, `starting`, `running`, or `stalled` (no finished pass for three intervals plus a
    30-second grace);
  - `createRelayHealthController(basePath)` answers `GET <basePath>/relays` with every relay in the process, and 503
    when any configured relay is stalled;
  - it carries no tenant data, and readiness is unchanged, so the deploy smoke test is unaffected.
- **Mounted in:**
  - Workforce, CMMS and Geospatial at `v1/health/relays`;
  - Connector Hub at `api/connectors/v1/health/relays`, beside its own health routes.

  The module host runs no relay yet (B).
- **Tests:**
  - `relay-health.test.ts` (5): the state rules; real passes (an empty pass reads as running, a delivery counts, a
    400 is recorded); a missing target is not-configured, not a fault; 503 when stalled;
  - the hub's HTTP test (`relay-health-route.spec.ts`): 200 with the relays, and 503 when one is stalled.
- **Verification:**
  - type-checks clean (SDK and the four services);
  - 649 tests pass across them;
  - whole repository: 2,972 tests passed, 234 skipped, none failed (381 files); the audits and the pin check pass.

## B, release condition (2026-10-15)

Plan v3 Phase 5 states it: a module-host module that publishes facts is released only with its relay built on
`OutboxRelay`, configured on UAT and visible in `v1/health/relays`, or with a recorded "no consumer yet".

## C (2026-10-15)

Carded as [WI-OI-120aw](WI-OI-120aw.md): clean up certification and test workspaces on UAT. The dead letters go with
it.

## Security review of release b7632d6 (2026-10-16): approve with conditions

- **M1, operational:** until the post-deploy clean-up runs, Platform Control Tower cannot save entitlements for the
  17 workspaces with an ENABLED `master-data` row.
  - `PlatformTenantControl.tsx` seeds the edit list from every ENABLED row, including the hidden `master-data`.
  - `assertEligibleModuleKeys` then answers 400.
  - `updateEntitlements` only upserts catalogue keys, so it cannot disable the stale row itself.

  **Condition:** the owner-run clean-up runs right after the deploy. It disables the 17 rows and removes the key from
  the 121 workspaces. Every other path (session context, plan page, window baselines, entitlement events, the signed
  proxy) ignores the stale key.
- **Follow-up hardening (small, carded later):**
  - the Control Tower filters its edit list to catalogue modules;
  - `updateEntitlements` disables ENABLED rows whose key is not in the catalogue.
- **Info, relay health:**
  - a slow but progressing pass (20 rows at the 5-second timeout) can read as stalled for a while;
  - a relay whose every delivery fails still reads as running, and only `lastFailureCode` shows it;
  - the registry keeps entries after shutdown (tests only).

  Follow-up: track the start of a pass, and let monitoring (O3) alert on failures too.
- **Verified:**
  - 0.5b: the constructor check breaks no module; the `SKIP LOCKED` sweep is valid under forced RLS; the method rule
    is sound;
  - relay health is reachable only inside the compose network (the gateways are allow-lists), has no route clash and
    does not affect readiness;
  - the package removal: nothing still imports them, the docker workspace resolves, and the lockfile change is pure
    deletion;
  - the Master Data Hub retirement is complete; roles that still hold `master-data:*` do not fail validation;
  - release parity: 144 files, with 5 expected differences;
  - no migration, compose or env change.

