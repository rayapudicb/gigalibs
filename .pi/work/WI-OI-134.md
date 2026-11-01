# WI-OI-134 evidence: M-CAL field instrument calibration

Card: `.pi/tasks/WI-OI-134.md`. Branch `feat/frontline-suite` (worktree `/Users/rayapudi/dev/gigalibs-rounds`, from the
deployed release tip `ffd969cc`); mobile in `/Users/rayapudi/dev/gigalibs_mobile`.

## 2026-11-01 — backend, admin web, mobile BFF and mobile app

**Ownership.** CMMS writes everything (instruments are CMMS assets). Reconciliation found only a `CALIBRATION` job-plan
task type in CMMS; no calibration tables, routes or contracts. The `esignature` module is a frozen prototype and is not
used. No new module, catalogue entry or entitlement.

**Contracts** (`packages/contracts/src/cmms/calibration.ts`): definition, profile, standard, record, submit, decision,
instrument, bundle, certificate, drift; fixed technician/approval/rejection statements; the shared math
(`calibrationNominal`, `evaluateCalibrationPoint`, `evaluateCalibration`: linear and square-root transfer, percent of
span or absolute tolerance, applied-input override, reverse-acting output, 6-decimal rounding). New mobile problem
`MOBILE_CALIBRATION_CONFLICT`. Work-order origin `CALIBRATION`.

**CMMS migration 27** (`000027_instrument_calibration`, additive): `calibration_standards`, `calibration_profiles`
(one draft and one published per asset; publisher wrote none of the draft), `calibration_records` (immutable profile
snapshot, result consistency, containment and decision constraints; a trigger lets only the one decision change a
record and refuses deletes), `calibration_record_standards`, `calibration_points` (both append-only for the runtime
role), forced tenant RLS on all five, `CALIBRATION` work-order origin. Pins 26 → 27 (code, compose job and API,
runtime manifest); `verify-migration-pins` agrees for 7 modules. Append-only list updated in compose and
`verify-cmms-runtime.sh`. Roll-forward: additive; the down migration runs only while empty.

**Proofs on disposable PostgreSQL 16** (no network; manifest migrations 1, 2, 10–27): `db/proofs/000027_instrument_calibration.sql`
as a non-superuser, non-owner role with the runtime grants, rolled back — standard validity and unique code; profile
ranges, points, one draft/one published, four eyes against author and editor; `CALIBRATION` origin; record result,
containment and unique operation; points and standard snapshots refuse UPDATE/DELETE (42501); technician cannot
decide; rejection needs a note; content immutable and records undeletable (trigger); a second decision refused;
tenant B sees nothing and cannot insert for A; an unbound session sees nothing. Down to 26 while empty (0 calibration
tables), reapply 27, proof passes again.

**Service** (`apps/api/src/calibration/`): standards, profiles (draft → publish by another person, supersedes the
previous revision), instruments (due state from the last approved PASS/ADJUSTED + interval; a later FAIL is OVERDUE),
bundle, drift (approved as-found errors, 5 years), submit (replay by client operation id and request hash; reused id
refused; stale profile revision, withdrawn/expired standard, future or 30-day-old capture refused as conflicts; server
recomputes every point; FAIL raises one HIGH corrective work order through a frozen `calibration:containment`
principal with a deterministic request key and takes an OPERATIONAL asset OFFLINE in the same transaction), decision
(four eyes, once, version check), certificate (APPROVED only; disclaimer: not a 21 CFR Part 11 signature). Scope:
organization and place predicates on assets, standards and records; writes checked with the calibration permission.
Real-PostgreSQL service test (`calibration.pg.test.ts`, opt-in `CMMS_CALIBRATION_PG_URL`, LOGIN role neither superuser
nor BYPASSRLS with append-only grants): 10/10 — it caught a `GROUP BY` bug in drift (fixed). Compiled `AppModule`
loads under Node.

**Manifest**: permissions `cmms.calibration.read|execute|approve|manage|publish`; technician read+execute, planner
read+manage, viewer read, new role Metrology lead (read, manage, publish, approve); 11 gateway routes; `/cmms/calibration`
page (session permissions) and menu item gated on read. Tenant Admin holds `cmms:*`.

**Web** (`modules/physical-operations-cmms/web`): Calibration section — instruments due with drift table; capture with
live per-point result from the shared math, standards, as-left after a failing as-found, statement; records with
approval queue, decision with statement and note, certificate (printable); profiles (draft, edit, publish); master
standards (add, withdraw). `next build` passes (`/cmms/calibration`).

**Mobile BFF**: control-plane `MobileCalibrationController` (`mobile/calibration/instruments`, `instruments/:id/bundle`,
`records` POST, `records/:id`): live session, CMMS (`asset-maintenance`) enabled, `cmms.calibration.execute`; 60-second
context signed for `gigalibs-cmms-api`; 409 → `MOBILE_CALIBRATION_CONFLICT`. Web `/mobile/v1` allowlist (UUID-bound).
Session projection grants module `calibration` (capability `cmms.calibration.execute`) only with the entitlement and
the permission. Compose passes `CMMS_API_URL` and the CMMS signing key (optional) to the control plane.

**Mobile app** (`gigalibs_mobile`): contracts and math mirrored (`mobile-contracts/src/calibration.ts`, same test
vectors as the platform); API adapter (receipt must match the capture); feature `@gigalibs/mobile-feature-calibration`
(instrument list, capture with live results, standards by list or scan, as-left, statement; outcomes accepted /
unconfirmed (resend the same capture) / conflict (download again, new capture) / refused); capability pack
`@gigalibs/mobile-capability-calibration` (camera scanner for standard barcodes); routes `/calibration`,
`/calibration/[assetId]`; feature, binding, both profiles and containment approvals updated.

**Tests and gates**: contracts math 9; CMMS service on PostgreSQL 10; web gateway/screens 15 + equivalence (97);
mobile adapter 4, BFF 10, session projection; CMMS + contracts suites 1,036 passed (3 pinned-list tests updated).
Mobile: lint (586 files, 3 pre-existing warnings), typecheck, 1,934 tests, 2 profiles, architecture — all pass.

**Gates still open**: offline capture persistence on the phone (needs the shared encrypted journal; the mobile offline
runtime is contained by design — today a lost answer is resent with the same id while the app is open); step-up
re-authentication and any regulated e-signature claim; physical device proof (scan, capture); UAT deploy and journey.

**Module gate (2026-11-01).** `pnpm verify`: build, all audits, module manifests, migration pins, module windows and
conversions, deployment profile pass; the test step fails only with the four known pre-existing suites
(`execution-events.controller.spec`, `operational-intelligence.pull-retired.spec`, Project Operations `module.spec`,
auth-core `platform-context-assignments.test`); 14 optional isolated-database proofs not run. Log:
`/var/folders/jp/fkzm1c3s1d52rj_9cvjv6kx00000gn/T/gigalibs-verify/verify-2026-11-01T18-12-52-776Z.log`. The first run
found a stale permission catalogue (the control plane now also checks `cmms.calibration.execute`) and the new
control-plane keys missing from the deployment profile and `.env.example`; both fixed.

**Platform decision needed (signed-context size).** The synthetic worst configuration in
`platform-context-assignments.test` (maximum roles, 100-character names, slices of the whole permission catalogue) was
already above its 14 KiB target (15,234 characters). The five calibration codes raise it to 15,431, above the hard
15,360 limit, so that configuration is now refused at minting with "ask an administrator to combine their roles"
(fails closed). The realistic-member test (Manager with 20 module roles) still passes. Every further module adds codes;
the durable fix is a platform change (e.g. each module context carries only that module's permission family), which
is an ADR-level auth-core decision for the owner and Security.
