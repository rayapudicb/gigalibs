# WI-OI-065 — People: job profiles, positions and engagements (roadmap P5, first half)

Status: In Progress (G0–G3 design, then bounded Local G4 Build)  
Owner: SDLC Orchestrator / Workforce Domain  
Requirements: FR-01, FR-02, FR-04, FR-05, FR-08, FR-11, FR-12; NFR-SEC-001–005, NFR-DATA-001–004,
NFR-REL-001–003, NFR-UX-001–004, NFR-OBS-001–004  
Independent reviewers: Solution Architecture, Security & Privacy, IAM/Tenancy, Backend/Data, API Contracts,
Web/Accessibility, QA/SDET, Product  
Execution: owner continuous mode (WI-OI-062); sole active Build item after WI-OI-038 entered Review
(2026-09-27). Availability and absence are WI-OI-066 (P5, second half).

## Outcome

A workforce manager describes the roles the organisation needs, the positions it holds at its sites and who
fills them, with dates. Examples: "Line technician, level 2, requires electrical certification"; "position
TECH-014 at the Osaka plant from 1 October"; "Aiko Tanaka engaged as an employee from 1 October". Changes take
effect on dates, history is kept, and nothing is double-filled. Value measure: positions filled versus open per
site.

## G0 — existing-code inventory

| Area | Finding |
| --- | --- |
| Canonical runtime | `gigalibs_workforce` migrations 000001–000004: resources (HUMAN/TEAM/POOL), capability definitions, resource qualifications; the foundation for signed context, revocation, audit, outbox and inbox. Only resources and capabilities are mounted (`gigaops.module.ts`). |
| Prototype | `modules/gigaops/db/migrations` (`gigalibs_gigaops`, uuid tenant ids) holds `roles`, `positions`, `agreements`, `workers`, payroll and time entries, plus unmounted controllers and services in `apps/api/src/{positions,agreements,workers,roles}`. It is never installed (roadmap rule 1), and it mixes pay and rates into positions (pay belongs to P8). |
| Web | GigaOps "Jobs & positions" section is `available: false` (planned). |
| Sites | Geospatial places (P2) give `site_ref`; CMMS uses the same plain-reference pattern (P4). |
| Configurable types | Industry packs (P3) carry job families and certifications as governed configuration; they are not consumed yet. |

## G1 — acceptance and negative cases

Accept:
- Create a job profile with required capabilities (from the Workforce capability catalogue) and a dated
  revision.
- Revise it from a future date: the old revision stays in force until then, and the history is readable
  "as of" any date.
- Create positions for a job profile at a site with an FTE and an effective window.
- Engage a person (a HUMAN resource) in a position from a start date, and end the engagement.
- Every change is audited and emitted to the outbox.

Negative cases:
- a revision starting on or before the current revision's start (corrections are a later, audited
  capability);
- a position outside its profile's life;
- two overlapping engagements in the same position;
- engaging a TEAM or POOL;
- an engagement outside the position window;
- an end date before the start;
- a stale version;
- a cross-tenant id;
- a user without `workforce.jobs.*` scopes.

### Rejected alternative

Adopting the prototype `positions`/`agreements` tables was rejected: they are uuid-keyed, carry pay rates (P8)
and lack effective dating.

## G2 — design

- **Schema, migration 000005 in `gigalibs_workforce` (forward-only, runtime foundation):**
  - `job_profiles`: stable identity with code and status.
  - `job_profile_revisions`: effective-dated with `[effective_from, effective_to)`; title, description,
    worker category (neutral lexicon: EMPLOYEE, CONTRACTOR, AGENCY, VOLUNTEER); required capabilities as
    `(capability_definition_id, minimum proficiency)`. An exclusion constraint prevents overlapping revisions
    of one profile (`btree_gist`).
  - `positions`: code, job profile, `site_ref` (Geospatial place id, plain reference), department, FTE,
    `[effective_from, effective_to)`, status OPEN/FROZEN/CLOSED.
  - `engagements`: resource (HUMAN only, enforced in the service), position, engagement type, FTE, dates, and
    status ACTIVE/ENDED/CANCELLED. An exclusion constraint prevents overlapping non-cancelled engagements in
    one position.
  - Forced RLS on every table; audit and outbox per change in the same transaction.
- **Authority:** the existing Workforce guard. New scopes are `workforce.jobs.read`, `workforce.jobs.manage`,
  `workforce.positions.read`, `workforce.positions.manage`, `workforce.engagements.read` and
  `workforce.engagements.manage`. Tenant Admin already holds `workforce:*`.
- **Dates:** calendar dates (`date`) in the site's local sense; an end is exclusive.
- **Out of scope for 065, registered:** tenant custom fields through the Configuration Studio adapter
  (065b), roster import as a durable job through Universal Data Studio (065c), availability and absence
  (WI-OI-066), pay (P8).

## G3 — API (`/v1` on the Workforce API, through `/api/workforce` on the BFF)

| Route | Permission |
| --- | --- |
| `GET /job-profiles?asOf=`, `GET /job-profiles/:id` (with revision history) | `workforce.jobs.read` |
| `POST /job-profiles` (first revision), `POST /job-profiles/:id/revisions`, `PATCH /job-profiles/:id` (status) | `workforce.jobs.manage` |
| `GET /positions?asOf=&siteRef=&status=`, `GET /positions/:id` (with engagements) | `workforce.positions.read` |
| `POST /positions`, `PATCH /positions/:id` (FTE, window, status, site, department) | `workforce.positions.manage` |
| `GET /engagements?resourceId=&positionId=&asOf=` | `workforce.engagements.read` |
| `POST /engagements`, `POST /engagements/:id/end`, `POST /engagements/:id/cancel` | `workforce.engagements.manage` |

UI: the GigaOps "Jobs & positions" section becomes available (Medusa UI). It lists job profiles with revision
history and required capabilities, and lists positions by site with their incumbent, open and filled state.
Users can engage a person and end an engagement. The screen covers loading, empty, denied, validation,
conflict and failure states.

Tests:
- unit tests for the rules;
- live `verify-workforce-jobs.sh`: effective-dated revisions and as-of reads, the overlap refusals from the
  constraint and service, two-tenant denial, restart, and evidence;
- a web path for a Tenant Admin.

## Build (2026-09-27)

- **Schema:**
  - `gigalibs_workforce` migration 000005 adds `job_profiles`, `job_profile_revisions` (exclusion
    `job_profile_revisions_no_overlap`), `positions` and `engagements` (exclusion `engagements_one_incumbent`,
    ignoring cancelled engagements). `btree_gist` is enabled, and every table has forced RLS.
  - Schema contract 5: runtime config, compose overlay, runtime and concurrent-migration scripts.
- **Contracts:** Workforce V1 additions in `packages/contracts/src/workforce/index.ts`:
  - `WorkforceDateSchema` (real calendar dates);
  - job profile, revision, position and engagement schemas and types;
  - the neutral worker category lexicon;
  - codes normalised to upper case.
- **API:** `jobs.service.ts` with controllers `v1/job-profiles`, `v1/positions` and `v1/engagements`.
  - As-of reads (today by default); a revision closes the open one on the day it starts, and back-dating is
    refused.
  - Position windows are bounded by the profile's life; an end date or FTE change that would strand an
    engagement is refused.
  - Engagements are for HUMAN resources only, must fit inside the position window and FTE, can be ended with a
    reason, and can be withdrawn only before they start.
  - Every command writes audit and outbox in the same transaction.
  - Department and exact place scope apply; the Workforce principal now carries `spatialScope`.
  - SQL `DATE` values stay calendar strings.
- **Web:**
  - BFF allow-list for the new routes (read and manage scopes); the Workforce client surfaces field issues.
  - The GigaOps "Jobs & positions" section is enabled (`JobsAndPositions.tsx`, Medusa UI): as-of view, profile
    history and change-from-a-date, positions by site with filled/vacant state, engage, end and withdraw.
  - The Geospatial site picker moved to `components/geospatial/SitePicker.tsx` (CMMS re-exports it).
- **Tests:** job rule tests (3); Workforce BFF boundary for the job routes (1 more test); live
  `verify-workforce-jobs.sh` (+ `workforce-jobs.mjs`) and `verify:workforce-jobs-web-path`.
- **Carried over from P4:** the CMMS README is rewritten for the canonical runtime.

## Certification (2026-09-27) — Workforce image `gigalibs/workforce-api:5abfa667bb10-123687d19b32`

- **Repository:**
  - The first chain passed build 106/106, tests and all six audits with the job code.
  - Its image step failed in `next build` on **unregistered forms work that appeared in the tree around
    13:50** and is not part of this item: `app/api/forms/*`, `lib/forms-engine-service.ts`, a new Prisma
    `FormSchema`/`FormSubmission` model and control-plane migrations `20260927000000_ledger_genesis_records` and
    `20260927100000_phase2_dual_mode_forms`. The forms engine imports `@gigalibs/db` into the web app, and that
    client requires `DATABASE_URL` at build time.
  - That work was not modified. Because a full deploy would also apply its unreviewed migrations to the local
    database, only the Workforce image was built and deployed (`--no-deps`). The control-plane migrations,
    web and every other service stay on the certified P4 identity `7507432cb066`.
- **Live:** the local `gigalibs_workforce` schema upgraded from 4 to 6 (000005 jobs, 000006 availability).
  Runtime (clean replay, least privilege, RLS, append-only), HTTP matrix, the WI-OI-061 journey,
  `verify-workforce-jobs.sh` and `verify-workforce-availability.sh` all pass on the final image.
- **Fixes found live and made:**
  - an absence insert reused `$9` with two types → a separate decision-time parameter;
  - `absences` has no `updated_by` → a dedicated version statement.

  Migration 000006 was already applied and stays unchanged.
- **Image policy:** Workforce image 0 Critical, 0 High (24 total) —
  `infra/compose/evidence/wi-oi-065-066-20260927T091400Z`.
- **Open until the forms work builds:**
  - the full image chain for the web image (Jobs & positions and Availability screens, BFF allow-list);
  - `verify:workforce-jobs-web-path`;
  - the page routes.

  These screens are type-checked and unit-tested; they are not live-certified.
