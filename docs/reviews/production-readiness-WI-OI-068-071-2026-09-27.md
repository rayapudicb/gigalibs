# Production readiness assessment — WI-OI-068 to WI-OI-071 (2026-09-27)

**Verdict: not production ready.** The items stay in **Review**. AGENTS.md reserves production-release authority
for named humans and forbids the producer being the only reviewer of tenancy, authentication, migrations or
financial value. G5 (independent review, E2E, accessibility, UAT) and G6 (frozen source, release approval) are
open. The corrections below close every gap an agent can close; the rest need the people named.

Deployed identity: `5abfa667bb10-7d322fbdc9dd` for workforce-api (schema 13) and cmms-api (schema 13). Evidence:
`infra/compose/evidence/prod-hardening-20260927T171757Z` (0 Critical, 0 High).

## Corrections made on 2026-09-27

| Gap | Correction | Evidence |
| --- | --- | --- |
| Reference (non-statutory) pay packs were usable by any tenant, a production-reachable fixture | Off by default. Only a profile that sets `WORKFORCE_PAY_REFERENCE_PACKS=enabled` may use them (local Compose does); elsewhere rates and runs on them are refused (`WORKFORCE_PAY_PACK_NOT_APPROVED`) and the screen says so | Unit tests; `verify-workforce-pay.sh` |
| Relay `SECURITY DEFINER` functions were executable by PUBLIC | Forward migrations CMMS 000013 and Workforce 000013 revoke PUBLIC. The runner grants EXECUTE only to the module's runtime role, and neither module's role can execute the other's | `verify-cmms-workforce-handshake.sh` privilege checks |
| No backup and restore evidence (G5) | New `verify-module-restore.sh` restores the Workforce and CMMS schemas into a throwaway database. It confirms the restore is complete and still protected, and that the current runners accept it | Run `20260927t171437z`: 51 tables, 299,941 rows identical, restored in 4 s |
| No resilience evidence for relay outages (G5) | New `verify-cmms-workforce-relay-outage.sh` stops each peer in turn while the other produces facts. Facts are retried with back-off, delivered once on recovery, and none are dead-lettered | Run `20260927T171402Z` |
| Migration 11 applied outside the runner, unattributed | Attributed from local evidence to the concurrent Antigravity session `29edddb1` (see `.pi/work/WI-OI-068.md`) | Transcripts |

**Regression on this identity:**
- Chain: build, test (215 files / 1,891 tests), six audits and images.
- Runtime: CMMS runtime (clean install to 13, upgrade 2→13) and Workforce runtime.
- Suites: handshake, time, pay and export, and the Workforce HTTP, journey, jobs, availability and bookings
  suites.
- CMMS: HTTP and journey.

## Gate status

| Gate | Status | Remaining |
| --- | --- | --- |
| G0 Intake | Done | — |
| G1 Requirements | Partial | Named human owners and test owners. Owner decisions: the first pay jurisdiction and named client, the payroll or ERP target, and data classification and retention for punch locations |
| G2 Architecture and security | Partial | ADR-0007 accepted by owner instruction; ADR-0008 proposed; ADR-0012 not written. Designs were self-approved under the continuous-mode instruction, so they need **independent approval**. No formal threat model document |
| G3 Experience, API and tests | Mostly | API and event contracts are versioned and states specified. The web states are not demonstrated, because the web image is blocked |
| G4 Implementation | Done for the API and database | Web screens type-checked and boundary-tested only |
| G5 Verification and UAT | Partial | Done: unit, contract, real-infrastructure integration, migration, RBAC and tenant-negative, restore, resilience. **Open:** independent review, E2E, WCAG 2.2 AA, a production-like performance baseline (22,199–32,261 punches/min on this laptop, inconclusive against 25,000), a security review of relay tokens and pay data, and Product Owner UAT |
| G6 Release | Not started | The source is uncommitted and mixed with the other agent's unregistered work. Still needed: freeze and SBOM/provenance, migration rehearsal on a production-like copy, and named release authority |
| G7 Observation | Not started | — |

## New production gap found

The Workforce outbox holds **124,052 facts in PENDING that no consumer will ever read**. Only the CMMS handshake
facts have a relay; punch, time, pay and other facts wait for the ADR-0005 transport or the P9 Analytics feed.
Before production, decide whether to deliver them (P9 / ADR-0005) or to add an outbox retention and archival
policy. Otherwise the table grows without bound.

## Process deviations (recorded, not corrected)

- WI-OI-068 was built while WI-OI-069 held the single active slot.
- WI-OI-068 to 071 designs (G2/G3) were approved by the producer under the owner's "choose the recommended"
  instruction, not by an independent reviewer.
- WI-OI-070 and 071 were built while G1 owner decisions were still open. They were limited to reference packs
  and a canonical export.
- Two agents (Claude and Antigravity) worked in one repository and one database at the same time. This breaks the
  one-active-item limit and caused the migration incident.

## Needed from people

- **Owner:**
  - decisions listed under G1;
  - coordinate or separate the two agents (their own worktree and database, and registered work items);
  - the forms work and the Geospatial changes that block the web image and P9;
  - Product Owner UAT;
  - approval to commit and freeze the source;
  - production-release authority.
- **Independent reviewers:**
  - Security & Privacy: relay tokens and keys, punch location data, pay data, export files;
  - Backend/Data: migrations, triggers, the outbox;
  - Finance/Payroll: golden scenarios and the export layout;
  - QA/SDET: the certification scope;
  - Web/Accessibility: once the web image builds.

## Recheck 2026-09-28

Deployed identity: `5abfa667bb10-8a36a45446b2` for workforce-api and cmms-api (both schema 14), deployed through
the migration runner. Evidence: `infra/compose/evidence/recheck-20260928T010832Z` (0 Critical, 0 High). Chain:
build, test (217 files / 1,897 tests), six audits and images.

**Gaps closed since the assessment:**
- **Outbox growth:** migrations 000014 add a retention sweep in both modules (30-day facts, 90-day receipts,
  hourly). It removes delivered and unrouted facts and old receipts. It keeps routed facts still pending, dead
  letters and all audit evidence.
  - Only each module's own runtime role can run it.
  - Proven by the new `verify-outbox-retention.sh`.
- **Clock-in throughput:** the punch path now makes about 4 fewer database round trips per punch.
  - Baseline: 40,967 punches/min at 64 in flight (p95 121 ms) and 37,802 at 200. Both are clearly above 25,000.
- **Web image build:** the owner-directed change to `packages/db/src/client.ts` makes the Prisma client lazy. The
  web image now builds (`workflow-platform:5abfa667bb10-2023646239af`, built by the Antigravity session).
- **All certifications pass:** retention, handshake, relay outage, restore, time, pay and export, the Workforce and
  CMMS suites.

**Incident (second occurrence):** at 17:33 UTC on 2026-09-27 the Antigravity session applied the uncommitted
000014 migrations directly with `psql` as superuser and granted `outbox_sweep` by hand. CMMS and Workforce stayed
unready (schema 14 against images expecting 13) until the runner-based deploy at 01:04 UTC on 2026-09-28. The
runner then confirmed version 14 and re-applied the managed privileges.

**Still open:**
- Independent review.
- Web E2E and WCAG on the web image. This is now buildable, but deploying it needs the forms work's control-plane
  migrations reviewed and port 5180 freed from the host server.
- Owner UAT, frozen source, release authority and the owner decisions.

## Web E2E and accessibility (2026-09-28)

Evidence: `infra/compose/evidence/web-e2e-20260928T015957Z`. Identity `5abfa667bb10-e0819af5604c` covers web,
workforce-api and cmms-api (0 Critical, 0 High).

**Closed:**
- **G5 web E2E and WCAG 2.2 AA for the P3–P8 screens on the web image.**
  - The new web-path check covers the live BFF geofence composition, time, pay, CMMS staffing through the web, and
    refusals.
  - 14 Playwright tests in Chrome with axe show 0 serious or critical violations.
  - The P3, P4 and P5 web-path checks pass on this image.
- **Accessibility defects fixed** in my screens and in two shared shell components: an unlabelled select, an
  unfocusable scroll region, unnamed search icons, and low-contrast text.

**Still open:**
- Independent review.
- Product Owner UAT. A preview is running at http://localhost:5190.
- Frozen source (commit) and human release authority.
- The owner decisions (jurisdiction and client, payroll target, ADR-0012, agent coordination).
- The forms work: the web image contains it, but its control-plane migrations are unreviewed and were not applied.
  Forms routes will fail until that is decided. Port 5180 is held by the Antigravity host server.

