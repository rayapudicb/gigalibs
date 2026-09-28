# WI-OI-066 — People: availability, absence and working calendars (roadmap P5, second half)

Status: Proposed (G0–G3 design ready; becomes the active Build item when WI-OI-065 enters Review)  
Owner: SDLC Orchestrator / Workforce Domain  
Requirements: FR-01, FR-02, FR-04, FR-05, FR-08, FR-11, FR-12; NFR-SEC-001–005, NFR-DATA-001–004,
NFR-REL-001–003, NFR-UX-001–004, NFR-OBS-001–004  
Independent reviewers: Solution Architecture, Security & Privacy, IAM/Tenancy, Backend/Data, API Contracts,
Web/Accessibility, QA/SDET, Product

## Outcome

A workforce manager records when each person can work and when they cannot. Examples: "Aiko works
Monday–Friday 08:00–16:30 at the Osaka plant from 1 October"; "Aiko is on approved annual leave 12–16
October"; "the Osaka plant is closed on these public holidays". P6 scheduling can then ask one question: who is
available at this site in this window. Value measure: bookings refused for unavailability rather than
discovered as no-shows.

## G0 — inventory

- **Canonical Workforce** (000001–000005): resources, capabilities, job profiles, positions and engagements.
  There is no availability or absence concept yet.
- **Prototype `gigalibs_gigaops`:** no availability tables; time entries and payroll belong to P7/P8.
- **Country packs (P3)** carry time zones, subdivisions and weekly overtime thresholds, but no public holidays.
  Calendars are therefore tenant-entered; no holiday list is invented.
- **GigaOps "Availability"** section: planned (`available: false`).

## G1 — acceptance and negative cases

Accept:
- An effective-dated weekly working pattern per person: day-of-week time ranges in a named IANA time zone,
  crossing midnight allowed.
- Absences with types from a tenant-managed list (paid or unpaid, needs approval or not). An absence moves
  REQUESTED → APPROVED or REJECTED, or CANCELLED, and is approved by someone other than the requester.
- Working calendars: dated non-working days, for the tenant or a Geospatial site.
- An availability query: for a person and window, the working intervals minus approved absences and calendar
  closures, with the reason for each gap.

Negative cases:
- overlapping patterns for one person;
- an invalid time zone or time range;
- an absence overlapping another non-cancelled absence of the same person;
- self-approval;
- approving a cancelled absence;
- a stale version;
- a cross-tenant id;
- a window longer than 93 days.

## G2 — design

- **Migration 000006, `gigalibs_workforce`:**
  - `availability_patterns`: resource, `[effective_from, effective_to)` dates, time zone, and weekly slots as a
    bounded JSON array of `{day, start, end}` validated by contract. An exclusion constraint prevents
    overlapping windows per resource.
  - `absence_types`: code, name, paid, requires approval, status.
  - `absences`: resource, type, `[starts_at, ends_at)` as timestamptz, status, requester, decider, decision
    reason, version. An exclusion constraint on non-cancelled, non-rejected absences prevents overlap per
    resource.
  - `working_calendars` (code, name, site_ref nullable meaning tenant-wide) and `calendar_closures` (date,
    label).
  - Forced RLS; audit and outbox per change.
- **Availability computation:** in the service, over at most 93 days. Each pattern slot is expanded in its own
  time zone (DST-correct through `AT TIME ZONE`); approved absences, and closures of the tenant calendar and
  of the site of the person's active position that day, are subtracted. It returns intervals and gap reasons.
- **Approval:** `workforce.absences.approve`. The decider must differ from the requester (four-eyes), and an
  audit fact is written.
- **Scopes:** `workforce.availability.read` / `.manage`, `workforce.absences.read` / `.request` / `.approve`,
  `workforce.calendars.read` / `.manage`. Tenant Admin already holds `workforce:*`.

## G3 — API (`/v1`)

| Route | Permission |
| --- | --- |
| `GET/POST /availability-patterns`, `POST /availability-patterns/:id/end` | availability read / manage |
| `GET/POST /absence-types`, `PATCH /absence-types/:id` | absences read / calendars manage |
| `GET/POST /absences`, `POST /absences/:id/approve`, `/reject`, `/cancel` | absences read / request / approve |
| `GET/POST /working-calendars`, `POST /working-calendars/:id/closures`, `DELETE`-free (closures end by a dated removal record) | calendars read / manage |
| `GET /availability?resourceId=&from=&to=` | availability read |

UI: the GigaOps "Availability" section, covering a person's pattern and time zone, the absence request and
decision queue, calendars by site, and an availability timeline for a window.

Tests:
- unit tests for the pattern expansion (including DST days and overnight slots) and the four-eyes rule;
- live `verify-workforce-availability.sh`: overlaps refused by the database, approval flow, the availability
  query across a DST change, restart, two-tenant denial, and evidence.

Out of scope, registered: roster import (065c), time and attendance (P7), accruals and entitlement balances
(P8), public-holiday feeds.

## Build and certification (2026-09-27)

- **Build:**
  - Migration 000006: `availability_patterns` (exclusion per resource), `absence_types`, `absences` (exclusion on
    requested or approved, decision check), `working_calendars` (one per site, one tenant-wide),
    `calendar_closures` (one active per day); forced RLS on all five.
  - Contracts: weekly slots, including overnight and week-wrap overlap refusal; IANA zone validation; 93-day
    availability window.
  - Service and controllers: patterns, absence types, absences with four-eyes approve/reject/cancel, calendars
    and closures.
  - Availability is computed in PostgreSQL in each pattern's time zone and subtracted in pure, unit-tested
    interval arithmetic.
  - BFF allow-list (the approval scope is separate) and client; the GigaOps "Availability" section is enabled.
- **Tests:** availability arithmetic and slot rules (7); BFF approval-scope boundary (1).
- **Live** (`verify-workforce-availability.sh` on `workforce-api:5abfa667bb10-123687d19b32`), all passing:
  - a Berlin week across the 25 October 2026 DST change (07:00Z → 08:00Z) and a Tokyo overnight slot;
  - database-refused overlaps;
  - requests do not block until approved; self-approval refused;
  - tenant and site calendars, with the site closure applying only through the person's position;
  - 80 h scheduled → 44 h available → 68 h after withdrawal and cancellation;
  - restart persistence; tenant B denied; 15 audit = outbox facts.
- **Open:** the same web-image blocker as WI-OI-065 (see its certification section).
