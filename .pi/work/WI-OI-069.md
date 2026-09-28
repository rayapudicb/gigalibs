# WI-OI-069 — Time and attendance (roadmap P7)

Status: Review — bounded Local G4 Build complete 2026-09-27; independent reviews, web image certification and
human acceptance open  
Owner: SDLC Orchestrator / Workforce Domain  
Execution: owner continuous mode (WI-OI-062); active after WI-OI-067 entered Review (2026-09-27). The slot was
lent to WI-OI-068 for the ADR-0007 build the same day and returned when it entered Review.  
Requirements: FR-01, FR-02, FR-04, FR-05, FR-08, FR-10, FR-11, FR-12; NFR-SEC-001–005, NFR-DATA-001–004,
NFR-REL-001–003, NFR-PERF-001–003, NFR-UX-001–004, NFR-OBS-001–004  
Independent reviewers: Solution Architecture, Security & Privacy, IAM/Tenancy, Backend/Data, API Contracts,
Web/Accessibility, QA/SDET, Product

## Outcome

Workers record time at the right place, managers approve it, and exceptions are resolved without database
access. Value measure: timesheets approved on first submission. Roadmap exit: duplicate, late and out-of-fence
punches handled; approved timesheets immutable; punches-per-minute baseline recorded.

## G0 — inventory

- Workforce has people (with an optional `platform_user_id`), positions at sites, availability and bookings; the
  canonical runtime has no punch or timesheet model.
- The prototype `gigalibs_gigaops.time_entries` is uuid-keyed and never installed (roadmap rule 1). It is not
  reused.
- The other stream's `PlantOperationsHub` "time" tab shows hard-coded sample shifts. It is not connected to any
  record and must not be presented as tenant facts; owner decision still open. This item adds a separate
  "Time & attendance" section and does not modify that tab.
- Geospatial places may carry a GeoJSON `boundary` (Polygon/MultiPolygon); there is no containment endpoint.
  Module APIs accept only BFF-signed contexts, so Workforce cannot call Geospatial itself.

## G1 — requirements and decisions

1. **Punch ingestion (the "PostgreSQL inbox"):** a worker records `CLOCK_IN`, `BREAK_START`, `BREAK_END`,
   `CLOCK_OUT` for their own Workforce person (resolved from `platform_user_id` = signed subject), with a device
   id, a device event id (UUID) and the device time and IANA time zone. `(tenant, device, event)` is unique: a
   resend returns the original punch (`200`, `Idempotency-Replayed: true`) and never creates a second one.
2. **Late and future punches:** accepted up to 31 days old; received more than 15 minutes after the device time
   → flagged `late` with a `LATE_PUNCH` exception. More than 2 minutes in the future → refused (clock skew).
3. **Geofence (decision, revised during G4: the BFF evaluates the boundary it reads through the Geospatial API).**
   The BFF strips any client `geofence` field, reads the punch site through the existing Geospatial
   `GET /v1/nodes/:id` as the same user (`maps.nodes.read`), and evaluates the boundary with the pure
   `evaluateGeofence` in `@gigalibs/contracts` (point-in-polygon with holes, MultiPolygon, distance to the edge).
   It forwards the result to Workforce. *Why revised:* a Geospatial image rebuild would ship the other stream's
   unreviewed `mobile/sync` and `lookup/tag` routes (in the tree since about 13:09 local, not in the certified
   `7507432cb066` image), so Geospatial stays unchanged. The same function can move behind a Geospatial
   endpoint later. Workforce records `INSIDE`, `OUTSIDE`, `UNKNOWN` (no boundary or no site), `NOT_CHECKED` (the
   check was refused or failed, or the evidence names another place) or `NO_LOCATION`. Exceptions:
   `OUT_OF_FENCE`, `GEOFENCE_UNVERIFIED`, `LOCATION_MISSING` (a site was given without a location). Punches are
   never refused for the fence; they are flagged.
4. **Admission control:** at most 64 punch transactions in flight per API process; beyond that `429` with
   `Retry-After: 1`. Devices keep the same event id when retrying, so retries are safe.
5. **Timesheets:** weekly (Monday period start) per person, computed from effective punches (voided punches
   excluded): shifts pair clock-in/out, breaks are subtracted, a shift may cross midnight and the period end.
   Issues (missing clock-out, clock-out without clock-in, unclosed break, shift over 24 h) block submission, as
   do open exceptions. Submission snapshots the lines; a punch arriving later for a submitted or approved period
   is kept and raises `AFTER_SUBMISSION`.
6. **Approval (decision):** in-module, four-eyes. The approver holds `workforce.timesheets.approve` and is
   neither the submitter nor the worker; rejection needs a reason and returns the week for correction and
   resubmission. **Workflow Studio routing and the Configuration Studio safety checklist are deferred** to the
   Workflow Studio adoption item (P9 integration); recorded as open for the owner.
7. **Immutability:** approved timesheets and their lines cannot be updated or deleted; database triggers enforce
   it for every role, and the API refuses changes with `409`.
8. **Corrections with reason codes:** `ADD` (missed punch), `VOID`, `REPLACE`; reason codes `MISSED_PUNCH`,
   `DEVICE_FAULT`, `WRONG_KIND`, `WRONG_TIME`, `WRONG_SITE`, `SUPERVISOR_ADJUSTMENT`, with a note. Needs
   `workforce.time.manage`, never for one's own time, and never inside a submitted or approved week (reject
   first). Punches, voids and corrections are append-only.
9. **Exception inbox:** open exceptions across people (spatially scoped), resolved as `ACCEPTED`, `CORRECTED` or
   `DISMISSED` with a note, never by the worker themselves.
10. **Scope:** reads and decisions for other people's time follow the Workforce spatial scope (punch sites;
    approval needs every line's site in scope). Workers always see their own time.
11. **Baseline:** a load certification records punches per minute (concurrent waves, with resends), the input to
    the roadmap's "Redis Streams only if below 25,000 per minute" decision.

## G2 — design

- **Contracts** (`@gigalibs/contracts` workforce): `RecordPunchV1`, `PunchV1`, `GeofenceEvidenceV1`,
  `TimesheetPreviewV1`, `TimesheetV1` (+ lines), `SubmitTimesheetV1`, approve/reject, `RecordTimeCorrectionV1`,
  `TimeExceptionV1`, `ResolveTimeExceptionV1` and query schemas; Geospatial `evaluateGeofence`.
- **Migration** `000009_workforce_time_and_attendance` (contract 9): `punches`, `punch_voids`,
  `time_corrections` (append-only through the runner), `time_exceptions`, `timesheets`, `timesheet_lines`; forced
  RLS on all; immutability triggers; unique device key; one timesheet per person and week.
- **Permissions:** `workforce.time.punch` (own time), `workforce.time.read`, `workforce.time.manage`
  (corrections, exceptions, submission for others), `workforce.timesheets.approve`. A worker role also needs
  `workforce:read` (GigaOps module access) and `maps.nodes.read` for the site check. Tenant Administrators hold
  `workforce:*` and `maps:*`.
- **Routes (Workforce `/v1`):** `punches` (POST, GET), `punches/me` (GET), `timesheets/preview` (GET),
  `timesheets` (POST submit, GET list), `timesheets/:id` (GET), `timesheets/:id/approve|reject` (POST),
  `time-corrections` (POST), `time-exceptions` (GET), `time-exceptions/:id/resolve` (POST).
- **Evidence:** every change writes audit and outbox facts in its transaction (`WORKFORCE_PUNCH_RECORDED`,
  `WORKFORCE_TIME_CORRECTED`, `WORKFORCE_TIME_EXCEPTION_RAISED|RESOLVED`,
  `WORKFORCE_TIMESHEET_SUBMITTED|APPROVED|REJECTED`).
- **Screen:** GigaOps → Time & attendance (Medusa UI): my clock (site, optional device location, an offline
  queue that resends with the same event id), weekly timesheet preview and submission, approvals, exception
  inbox and corrections.

## G3 — verification plan

- Unit: shift pairing (midnight and period boundaries, breaks, issues), point-in-polygon (holes, MultiPolygon,
  edge distance), punch timing, admission gate, any-of permission guard, BFF time routes and punch composition
  (client geofence discarded, boundary evaluated, no-permission and missing-place paths).
- Live `verify-workforce-time.sh`: duplicate resend, late and future punches, fence evidence recorded and
  exceptions raised, admission `429`, timesheet preview/submit/approve with four-eyes and self-approval refused,
  immutability by API and by a runtime-role UPDATE, correction rules, exception resolution, restart
  persistence, tenant B denied. The live BFF composition runs once the web image builds.
- Live `verify-workforce-punch-load.sh`: punches per minute baseline with resends and zero duplicates.
- Chain, six audits, exact images, image policy 0 Critical/High.

## G4 — built

- **Workforce** migration `000009_workforce_time_and_attendance` (contract 9, then 10 with the relay ordering
  fix): `punches` (unique device key), `punch_voids`, `time_corrections` (append-only through the runner),
  `time_exceptions`, `timesheets`, `timesheet_lines`. Forced RLS; immutability triggers for approved timesheets and
  their lines; four-eyes `decided_by <> submitted_by` in the database.
- **API** `time/`: pure rules (`time.rules.ts`: timing, local dates, weeks, shift pairing, admission gate) and
  `TimeService`. Routes: `punches`, `timesheets` (preview, submit, list, detail, approve, reject),
  `time-corrections`, `time-exceptions` (list, resolve). Per-person, per-week advisory lock orders punches,
  corrections and submission. `RequireAnyPermission` guard metadata for routes that serve a worker's own time and a
  manager's view.
- **Contracts:** Workforce time contracts; `evaluateGeofence` in Geospatial contracts.
- **BFF:** time routes allow-listed (any-of permissions); `transformBody` hook in the signed proxy;
  `lib/punch-geofence.ts` discards client evidence and composes it from the place boundary read as the same
  user.
- **Screen:** GigaOps → Clock & timesheets (`/gigaops/attendance`, Medusa UI): my clock with site, optional
  location and an offline queue that resends with the same event id; weekly timesheet preview and submission;
  approvals; exception inbox with resolve and void; missed-punch correction. The other stream's "Time &
  attendance" tab (`PlantOperationsHub`, sample data) is untouched.

## Certification — identity `5abfa667bb10-811bff4d48da`

- Chain: build, test (213 files / 1,871 tests), six audits, identity, Workforce and module images — exit 0.
- Deployed `workforce-migrations`/`workforce-api` (schema 10) and `cmms-migrations`/`cmms-api` (schema 12).
- `verify-workforce-time.sh` (new) passed. It covers:
  - device resend replay and cross-person reuse refused;
  - fence evidence with exceptions;
  - late, future and stale punches, and unlinked users;
  - a 300-punch burst admitted exactly once, with refusals retried after `Retry-After: 1`;
  - exceptions blocking submission and approval;
  - self resolution, self correction and submitter approval refused;
  - an after-submission punch, and the locked week;
  - return, replace and resubmit;
  - scope and tenant B;
  - restart;
  - append-only rows;
  - an approved timesheet that cannot change, for both the runtime role and the schema owner.
- **Baseline** (`verify-workforce-punch-load.sh`, 12,000 punches + 1,200 resends, 100 workers, exactly once), over
  six runs on this laptop's Docker:
  - 24,685–30,652 punches/min at 200 in flight;
  - 25,693–32,261 punches/min at 64 in flight, with p95 131–177 ms and no refusals.

  This is at or just above the roadmap's 25,000/min threshold, and it drifts down as the punch table grows. The
  PostgreSQL inbox stays for now. Recommendation: re-measure on production-like hardware before the roadmap
  decision on Redis Streams or Kafka is final.
- Regression passed: Workforce runtime, HTTP, journey, jobs, availability and bookings; CMMS runtime, HTTP and
  journey; handshake ×3.
- Unit: time rules (11), geofence (6), guard any-of (1), BFF time routes and punch composition (2).
- Image policy `infra/compose/evidence/wi-oi-069-20260927T145011Z`: 0 Critical, 0 High.

## Defect found and fixed during certification (WI-OI-068 relay)

On `7b6b48ef1121` the handshake certification failed. A staffing withdrawal reached Workforce before its request
(`UPDATE … RETURNING` does not keep the lease order, and one transaction's facts shared `now()`), which left an
open Workforce requirement for withdrawn staffing. The fix:

- forward migrations CMMS `000012` and Workforce `000010`;
- per-work-order leasing: at most one pending fact per work order, strictly in order;
- `clock_timestamp()` for outbox rows, and a partial index;
- relays sort each batch.

The handshake certification now also asserts delivery order and zero orphaned requirements. It passed three
consecutive runs. The two failed runs left test-tenant data only (`wi-oi-068-cert-a-20260927T1439*`/`T1440*`).

## Open

- **Web image certification** of the Clock & timesheets screen and the live BFF geofence composition. This is
  blocked by the unregistered forms work; the screen is type-checked and its BFF paths are unit-tested.
- **Deferred to the Workflow Studio adoption item:** Workflow Studio approval routing and the Configuration
  Studio safety checklist.
- **Worker roles.** A worker role needs `workforce:read`, `workforce.time.punch` and `maps.nodes.read`. Custom roles
  are P1 work, so today only Tenant Administrators hold them all.
- **Geospatial.** A server-side geofence endpoint waits until the other stream's Geospatial changes are reviewed.

## Product Owner acceptance run

1. Resources: link a person to your test user (platform user id), and another person to a second user.
2. GigaOps → Clock & timesheets as the worker. Pick a site and allow location, then clock in, start a break, end
   it and clock out. Punches outside the site boundary show "outside".
3. Turn the network off, clock in, turn it back on: the queued punch is sent once, with its original time.
4. Timesheet: the week shows the shift and any open exceptions; submission is refused until they are resolved.
5. As the manager, open Time exceptions: resolve one and void a punch with a reason. Then, as the worker, submit
   the week.
6. As a second manager, approve it; it then cannot change. As the submitter, approval is refused.

## Production readiness (2026-09-27)

Not production ready; still in Review. See `docs/reviews/production-readiness-WI-OI-068-071-2026-09-27.md`.
Production hardening was re-certified on `5abfa667bb10-7d322fbdc9dd` (CMMS and Workforce schema 13):

- reference pay packs are off unless a profile enables them;
- relay functions are executable only by their own module's runtime role;
- the backup/restore drill passed (`verify-module-restore.sh`);
- the relay-outage drill passed (`verify-cmms-workforce-relay-outage.sh`);
- the full regression passed.

Open: independent review, E2E/WCAG (web image), UAT, frozen source, release authority and the owner decisions.

