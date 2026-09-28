# WI-OI-067 — Work: demand requirements, bookings and dispatch (roadmap P6)

Status: In Progress (G0–G3 design, then bounded Local G4 Build)  
Owner: SDLC Orchestrator / Workforce Domain  
Requirements: FR-01, FR-02, FR-04, FR-05, FR-08, FR-10, FR-11, FR-12; NFR-SEC-001–005, NFR-DATA-001–004,
NFR-REL-001–003, NFR-PERF-001–003, NFR-UX-001–004, NFR-OBS-001–004  
Independent reviewers: Solution Architecture, Security & Privacy, IAM/Tenancy, Backend/Data, API Contracts,
Web/Accessibility, QA/SDET, Product  
Related: WI-OI-068 (CMMS handshake, the second adopter of the events), ADR-0007 (reserved)  
Execution: owner continuous mode (WI-OI-062); active after WI-OI-065/066 entered Review (2026-09-27)

## Outcome

A dispatcher staffs work from any source with qualified, available people, and nobody is double-booked.
Sources include a CMMS work order (WI-OI-068), a manual request or a project. The value measure is demand
filled on time.

## G0 — inventory

| Area | Finding |
| --- | --- |
| People | Canonical Workforce has resources, capabilities with proficiency and expiry, positions at sites and engagements (065), and computed availability (066). |
| Prototype | CMMS migrations 000003/000004 (`resource_allocations`, `allocation_status_history`) are never installed. Their lifecycle and capability-check ideas are reused as design input, not as tables. `gigalibs_gigaops` has no booking model. |
| Events | The Workforce and CMMS outboxes use the Delta 5 envelope; no consumer or inbox processing exists yet. `inbox_receipts` exists in Workforce. |
| Web | GigaOps "Scheduling & dispatch" is planned (`available: false`). |
| Blocker (external) | The web image cannot build while unregistered forms work imports `@gigalibs/db` into the web app; screens are certifiable only once that is resolved. |

## G1 — acceptance and negative cases

Accept:
- A demand requirement has a site (`site_ref`), a window, required capabilities with a minimum proficiency, a
  headcount and a source reference (for example `CMMS_WORK_ORDER:<id>`).
- A booking assigns one person to one requirement for all or part of its window. It moves DRAFT → CONFIRMED →
  DISPATCHED → ON_SITE → COMPLETED, or to CANCELLED.
- A booking is refused when:
  - the person lacks an active, unexpired required capability at the minimum proficiency (422);
  - the person is not available (the 066 availability shows a gap), unless an override reason is given and
    audited;
  - the person already holds an overlapping non-cancelled booking (database exclusion);
  - the requirement is already fully staffed.
- A repeated request key returns the original booking.
- A booking does not survive the cancellation of its requirement.
- Facts in the Delta 5 envelope: `WorkRequirementRequestedV1`, `ResourceBookingCreatedV1`,
  `ResourceBookingStatusChangedV1`.

Negative cases: overlap, missing or expired capability, unavailable, over-staffing, a stale version, an invalid
transition, a cross-tenant id, and a place-scoped dispatcher outside their sites.

Exit: 1,000 concurrent booking attempts yield zero overlaps and zero over-staffing.

## G2 — design

- **Migration 000007 (`gigalibs_workforce`):**
  - `work_requirements`:
    - source type and reference, `site_ref`, window `[starts_at, ends_at)`, headcount;
    - required capabilities as JSON;
    - status OPEN/FILLED/CANCELLED; version; `request_key` unique.
  - `bookings`:
    - requirement, resource, window inside the requirement, status and history columns;
    - `override_reason`, version, `request_key` unique;
    - exclusion `(tenant, resource, tstzrange)` where status is not CANCELLED.
  - `booking_events` (append-only history).
  - Forced RLS on all three.
- **Staffing guard:** the requirement row is locked `FOR UPDATE` and the non-cancelled bookings are counted
  inside the same transaction, so concurrent bookers can never exceed the headcount. The exclusion constraint
  prevents double-booking a person across requirements.
- **Capability guard:** active qualification, `valid_from ≤ window start`, `expires_at ≥ window end`, and
  proficiency rank ≥ minimum.
- **Availability guard:** reuses `AvailabilityService` arithmetic. The booking window must be inside the
  available intervals; an override needs `workforce.bookings.override` and a reason.
- **Scopes:** `workforce.demand.read` / `.manage`, `workforce.bookings.read` / `.manage` / `.override`.
  Tenant Admin already holds `workforce:*`.

## G3 — API (`/v1`)

| Route | Permission |
| --- | --- |
| `GET /work-requirements?status=&siteRef=&from=&to=`, `GET /work-requirements/:id` (with bookings) | demand read |
| `POST /work-requirements` (requestKey), `POST /work-requirements/:id/cancel` | demand manage |
| `GET /work-requirements/:id/candidates` (qualified and available people, ranked) | bookings read |
| `GET /bookings?resourceId=&from=&to=` | bookings read |
| `POST /bookings` (requestKey, optional override reason), `POST /bookings/:id/status` | bookings manage (override needs `.override`) |

Tests:
- unit tests for the capability and proficiency rules and the transition table;
- live `verify-workforce-bookings.sh`: guards, the lifecycle, idempotency, 1,000 concurrent attempts, restart,
  two-tenant denial and evidence;
- the dispatch board web path once the web image builds.

## Build and certification (2026-09-27) — Workforce image `gigalibs/workforce-api:5abfa667bb10-4205c578e648`

- **Build:**
  - Migration 000007 (contract 7):
    - `work_requirements`: request key; one live requirement per external source record; 31-day window.
    - `bookings`: exclusion `bookings_no_double_booking`, cancel reason tied to status.
    - `booking_events`: append-only for the runtime role.
    - Forced RLS on all three.
  - Contracts: requirements, bookings, candidates, `BOOKING_TRANSITIONS`, `PROFICIENCY_RANK`.
  - `BookingsService`: four guards in one transaction — locked headcount, qualification by proficiency for the
    whole window (422), availability via the WI-OI-066 computation with an audited override behind
    `workforce.bookings.override`, and the database exclusion. Also covers the lifecycle, cancellation cascades,
    reopening a filled requirement, request-key replay and ranked candidates.
  - Facts: `WORKFORCE_WORK_REQUIREMENT_REQUESTED_V1` and `WORKFORCE_RESOURCE_BOOKING_CREATED_V1` / `…STATUS_CHANGED_V1`,
    with logical ids only.
  - Web: BFF allow-list and client, and the GigaOps "Scheduling & dispatch" `DispatchBoard` (Medusa UI).
- **Conflict resolved:** the other stream's `PlantOperationsHub` (hard-coded sample shifts and workers) had also
  been routed to `scheduling`, which made the real board unreachable (a type error). The real board renders
  `scheduling`; their component remains on `time` and was not otherwise modified. Sample people and shifts must
  not be shown as tenant facts (convergence plan §acceptance); that is for the owner to settle for `time`.
- **Tests:** booking rules (3); BFF booking scope (1).
- **Live** (`verify-workforce-bookings.sh`), all passing:
  - ranked candidates; missing or insufficient capability 422;
  - replay; unavailable refused, override accepted and audited;
  - headcount filled then refused; double booking refused by the database;
  - lifecycle to COMPLETED; on-site cancellation refused;
  - cancellation reopens a requirement, and a requirement cancel cascades;
  - one live requirement per CMMS work order;
  - **1,000 attempts in concurrent waves of 100: 20 booked, 980 refused (all 409, no 5xx) in 2.6 s**, with zero
    overlaps and zero over-staffing in the database;
  - restart persistence; tenant B denied; 39 audit = outbox facts; one created fact per booking;
  - booking history append-only.
- **Re-certified on the same image:** Workforce runtime, HTTP, journey, jobs and availability. Image 0
  Critical, 0 High (`infra/compose/evidence/wi-oi-067-20260927T092709Z`).
- **Honest scope note:** the Workforce pool (10 connections, 5 s connection timeout) was tested with waves of
  100. A single burst of 1,000 simultaneous requests would queue on the pool; admission control is P7
  (roadmap).
- **Open:** the web image, the dispatch-board web path and the page routes are blocked by the same unregistered
  forms work as WI-OI-065/066.
