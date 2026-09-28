# WI-OI-069 Time and attendance review request (roadmap P7)

Date: 2026-09-27  
Profiles: `configuration-local-development-v1` with the Workforce, Geospatial and modules overlays  
Decision requested: bounded Local Development G4 review; Product Owner acceptance (below)

## Implemented outcome

Workers record time at the right place, managers approve it, and exceptions are resolved without database
access:

- **Punches** (clock in, break start, break end, clock out):
  - A worker punches for their own linked person from a device. Each tap has an event id, and a resend returns the
    original punch.
  - The browser keeps an offline queue and resends with the same id and the original time.
  - Punches over 15 minutes late are flagged; punches in the future or over 31 days old are refused.
- **Site check:**
  - The BFF reads the site boundary through the Geospatial API as the same user and evaluates the device
    position against it. Punches are recorded as inside, outside (with the distance), unknown, unverified, or
    without a location.
  - Punches are never refused for the site check. Outside, unverified and missing-location punches raise
    exceptions.
- **Admission control:** at most 64 punch transactions in flight per API process; beyond that the API answers 429
  with `Retry-After: 1`.
- **Weekly timesheets:**
  - Computed from punches, with breaks subtracted and shifts across midnight and week ends handled.
  - Missing clock-outs and similar problems, and any open exception, block submission.
  - A submitted week is snapshotted. A punch that arrives later is kept and flagged.
- **Four-eyes approval:** another manager approves or returns the week, never the worker or the submitter.
  Approved weeks cannot change: database triggers refuse it for every role.
- **Corrections:** add, void or replace a punch, with a reason code and a note. Corrections are never made to one's
  own time or inside a submitted or approved week, and they are append-only.
- **Exception inbox:** accept, dismiss or mark corrected, with a note; never on one's own time.
- **Screen:** GigaOps → Clock & timesheets (`/gigaops/attendance`, Medusa UI).

## Exact evidence identity

| Artifact | Identity |
| --- | --- |
| Workforce image | `gigalibs/workforce-api:5abfa667bb10-811bff4d48da` (schema contract 10) |
| CMMS image | `gigalibs/cmms-api:5abfa667bb10-811bff4d48da` (schema contract 12, relay ordering fix) |
| Other services | unchanged at `5abfa667bb10-7507432cb066` |
| Image policy | `infra/compose/evidence/wi-oi-069-20260927T145011Z`: 0 Critical, 0 High |

## Measured result

- **Chain:** build; tests (213 files, 1,871 tests); the six audits; identity; Workforce and module images. All
  pass.
- **`verify-workforce-time.sh`** passes. It covers:
  - duplicate, late, future, stale and out-of-fence punches;
  - a 300-punch burst admitted exactly once through 429 retries;
  - the four-eyes and self-service refusals;
  - after-submission punches and locked weeks;
  - return, replace and resubmit;
  - spatial scope and tenant B;
  - restart persistence;
  - append-only rows and immutable approved timesheets, checked in the database as the runtime role and as the
    schema owner.
- **Punch baseline** (12,000 punches plus 1,200 resends from 100 workers, stored exactly once):

  | In flight | Punches/min | p50 | p95 | Refusals |
  | --- | --- | --- | --- | --- |
  | 200 | 24,685–30,652 | — | 226–292 ms | ~2,000, all retried |
  | 64 | 25,693–32,261 | 104–133 ms | 131–177 ms | 0 |

  The roadmap threshold is 25,000/min. The result is at or just above it and drifts down as the punch table
  grows, so ingestion stays on the PostgreSQL inbox pending a re-measure on production-like hardware.
- **Regression:** the Workforce and CMMS certifications and the CMMS ↔ Workforce handshake (three consecutive
  runs) pass.

## Defect found and fixed

During regression, a staffing withdrawal reached Workforce ahead of its request and left an open requirement. The
fix:

- forward migrations CMMS 000012 and Workforce 000010;
- per-work-order FIFO leasing;
- insertion-time outbox stamps.

The handshake certification now asserts delivery order. See `.pi/work/WI-OI-068.md`.

## Decisions taken (please confirm)

1. **Geofence evaluation.** The BFF evaluates the boundary it reads through the existing Geospatial API. The
   reason: rebuilding Geospatial would ship the other stream's unreviewed `mobile/sync` and `lookup/tag` routes.
   A worker therefore needs `maps.nodes.read`.
2. **Approval.** Approval is in-module and four-eyes. Workflow Studio routing and the Configuration Studio safety
   checklist move to the Workflow Studio adoption item.
3. **Worker experience.** Worker time is its own "Clock & timesheets" section. The existing "Time & attendance"
   tab (sample data from the other stream) is unchanged and awaits your decision.

## Open items

- Web image certification of the screen and of the live BFF geofence composition. It is blocked by the
  unregistered forms work; the screen is type-checked and its BFF paths are unit-tested.
- Worker roles with `workforce:read`, `workforce.time.punch` and `maps.nodes.read` arrive with custom roles
  (P1).

## Product Owner acceptance run

1. Resources: link a person to your user id, and another person to a second user.
2. As the worker, open Clock & timesheets. Pick a site, allow location, and clock in, start a break, end it and
   clock out. A punch outside the site shows as "outside".
3. Go offline and clock in, then come back online. The queued punch is sent once, with its original time.
4. Timesheet: submission is refused while exceptions are open.
5. As the manager, open Time exceptions. Resolve one and void a punch with a reason. Then submit the week as the
   worker.
6. As a second manager, approve the week; it can no longer change. Approval by the submitter is refused.

## Review decisions required

1. **Solution Architecture / Product:** the decisions above, and the 64-in-flight admission limit.
2. **Security & Privacy / IAM:**
   - the new `workforce.time.*` and `workforce.timesheets.approve` scopes;
   - `RequireAnyPermission`;
   - the BFF `transformBody` hook and the rule that client geofence values are discarded;
   - storing device positions (latitude, longitude and accuracy per punch).
3. **Backend/Data:** the immutability triggers, the advisory week lock, and relay FIFO ordering.
4. **QA/SDET:** the time and baseline certifications.
