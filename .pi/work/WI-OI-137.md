# WI-OI-137 evidence: M-LOG shift logbook, bypass register and two-person handover

Card: `.pi/tasks/WI-OI-137.md`. Branch `feat/frontline-suite`; mobile in `/Users/rayapudi/dev/gigalibs_mobile`.

## 2026-11-02 — backend, admin web, mobile BFF and mobile app

**Ownership (agent decision under the owner's directive; for Architecture review).** Workforce writes logbooks,
entries, bypasses and handovers. ADR-0035 assigns handovers to Workforce M-WF3 and forbids a second handover store;
entries and bypasses are shift-bound, so one owner keeps every write local. Assets are plain CMMS references.
Workforce had no handover implementation (the old prototype `handovers`/`permits` gateway paths stay contained as
unavailable); the new routes are `v1/logbook…`.

**Contracts** (`packages/contracts/src/workforce/logbook.ts`): logbook with IANA zone and shift windows, entries with
categories and corrections, bypass request/decision/clear with overdue flag (48 h or past planned removal), handover
submit/refreeze/accept/countersign with fixed statements and a frozen package, board. Mobile problem
`MOBILE_LOGBOOK_CONFLICT`.

**Workforce migration 29** (`000029_workforce_shift_logbook`, runtime-foundation): `logbooks`, `logbook_entries`
(append-only for the runtime role; unique operation; corrections reference an existing entry), `logbook_bypasses`
(lifecycle shape, four eyes), `logbook_handovers` (one per shift, two people, third-person countersign, a trigger
freezing content after acceptance and refusing deletes). Forced tenant RLS. Pins 28 → 29; append-only list gains
`logbook_entries` in compose and `verify-workforce-runtime.sh`. Proof `db/proofs/000029_workforce_shift_logbook.sql` on
disposable PostgreSQL 16 (Workforce migrations 1–29, non-superuser non-owner, rolled back) passed; down to 28 while empty
and up to 29, proof passes again.

**Service** (`apps/api/src/logbook/`): `shiftAt` places an instant in the shift that last started in the logbook's zone
(overnight shifts, daylight-saving changes, gaps); logbooks (unit and place scope through the organization replica and
place list; writes need write scope); entries (replay by operation id and hash; 5-minute future skew and 72-hour late
limits; corrections are new entries); bypasses (request with future planned removal; authorize/reject by someone else;
clear); register across visible logbooks; handovers (current or previous shift only; frozen package of entry counts,
high-priority entries, active and pending bypasses; refreeze by the outgoing operator; acceptance by someone else only
when the active bypasses equal the frozen set and all are acknowledged; countersign by a third person). Tests: 3 unit
(shift calculation incl. Europe/London fall-back) and 6 on real PostgreSQL (`logbook.pg.test.ts`). Compiled
`GigaOpsModule` loads.

**Manifest** (Workforce): `workforce.logbook.read|write|authorize|manage` (member read+write; supervisor all four);
11 gateway routes; `/gigaops/logbook`. **Web**: Shift logbook — board with current shift, quick-log pills, entries with
corrections, bypass request/authorize/reject/clear with overdue flags, handover submit/accept with bypass
acknowledgement and countersign, bypass register, new logbook form. `next build` passes; token audit clean.

**Mobile BFF**: the shared forwarder now takes a module target (CMMS and Workforce); logbook adapter (logbooks, board,
entries, bypass request, handover submit and accept) with a Workforce-signed context; web `/mobile/v1` allowlist;
session grant of module `logbook`; compose, deployment profile and `.env.example` pass `WORKFORCE_API_URL` and the
Workforce key (optional) to the control plane.

**Mobile app**: contracts mirror, API adapter (answers must belong to the requested logbook or handover), feature
`@gigalibs/mobile-feature-logbook` (logbooks, board with quick log, bypass request, handover submit or accept with bypass
acknowledgement; resend keeps the operation id and event time), routes `/logbook`, `/logbook/[logbookId]`, feature,
binding, profiles and containment.

**Tests and gates**: platform targeted suites (Workforce, equivalence, auth-nest mobile 50); mobile lint, typecheck,
1,951 tests, profiles, architecture.

**Gates still open**: voice-to-structured logging and photo evidence; PIN/biometric step-up; composed turnover roll-up
from CMMS work orders, Rounds exceptions and IoT alarms; offline persistence; device proof; owner UAT; Architecture review
of the ownership decision.

**Module gate (2026-11-02).** `pnpm verify`: everything passes except the test step's four known pre-existing suites;
14 optional isolated-database proofs not run. Log:
`/var/folders/jp/fkzm1c3s1d52rj_9cvjv6kx00000gn/T/gigalibs-verify/verify-2026-11-02T00-54-53-163Z.log`. The synthetic
worst signed-context configuration is now 15,884 characters (refused at minting with a reason; realistic members
pass); the platform decision in WI-OI-134 remains open.
