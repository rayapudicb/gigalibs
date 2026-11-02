# WI-OI-142 evidence: M-LOTO digital lockout/tagout and permit-to-work

Card: `.pi/tasks/WI-OI-142.md`. Branch `feat/frontline-suite`; mobile in `/Users/rayapudi/dev/gigalibs_mobile`.

## 2026-11-02 — CMMS (M-CM2), admin web, mobile BFF and mobile app

**Ownership.** ADR-0035 assigns permits to CMMS M-CM2 with a work-order interlock; distinct from SPEED (laboratory
desk screening) and from Safety Operations (hazard reports).

**Contracts** (`packages/contracts/src/cmms/permits.ts`): energy types, permit types (`WorkPermitTypeV1`, named apart
from Workforce's), statuses, isolation points and procedures, request (≤ 12 h), lock (serial and photo), try step,
gas test input, decisions, cancel; `gasWithinLimits` (O₂ 19.5–23.5 %, LEL ≤ 10 %, CO ≤ 25 ppm, H₂S ≤ 5 ppm); permit
view with isolations, gas tests, personal locks and clashes. Mobile problem `MOBILE_PERMIT_CONFLICT`. 2 tests.

**CMMS migration 33** (`000033_lockout_permits`): `isolation_procedures` (revision per code; published by someone who
wrote none of it), `permit_counters`, `permits` (≤ 12 h; live only when authorized and countersigned; requester,
issuer and countersigner three different people; closing and cancelling whole), `permit_isolations` (each state with
its evidence; a witness is a second person), `permit_lock_photos`, `permit_lock_events` and `permit_gas_tests`
(append-only; the gas flag follows the limits, so no row can call a bad atmosphere safe). Forced tenant RLS; pins 32 →
33. Proof `db/proofs/000033_lockout_permits.sql` passed; down to 32 while empty and up to 33, passes again.

**Service** (`apps/api/src/permits/`): procedures (workspace-wide, four-eyes publish, revise); permits: request from a
published procedure (points copied, scope from work order or asset, replay), lock with a sniffed photo, try step,
witness by a second person, remove, gas tests (replay by operation), authorize (not the requester; not expired; a
recent in-limit gas test for hot work and confined space; refused while a permit sharing an isolation tag is
de-isolating), countersign (after the issuer, by a third person → LIVE), personal lock on/off (live and unexpired),
de-isolation (every personal lock off), close (every lock removed, by the issuer), cancel (before live, locks off);
the board lists active permits with clashes. **Work-order interlock** in `WorkOrdersService.changeStatus`: a work order
with an open permit starts only while one is LIVE (`CMMS_PERMIT_NOT_LIVE`) and completes only when every permit is
closed or cancelled (`CMMS_PERMIT_OPEN`). Tests: 5 on real PostgreSQL covering the whole journey and the interlock;
the CMMS suite (50 files, 365 tests) passes. Compiled `AppModule` loads.

**Manifest**: `cmms.permits.read|request|lock|authorize|countersign`, `cmms.isolations.manage`; technician read, request,
lock; planner read, procedures; viewer read; equipment operator read, lock; new roles Permit issuer and Area operations
lead (role reconciliation: 7 roles); 12 gateway routes; `/cmms/permits` "Permits & LOTO": live isolation board with
state counts and clashes, request form, permit detail (points with lock photos, try step, witness, remove; gas tests
with a live limit preview; personal locks; authorize, countersign, de-isolate, close, cancel), procedure library.

**Mobile BFF**: `MobilePermitsController` (mine, procedures, request, permit, lock/verify/remove a point, gas test,
lock on/off, de-isolate; approval stays on the web); session grant `permits` (request, lock; camera); BFF allowlist
with point keys; bounded parser on `/api/v1/mobile/permits`.

**Mobile app**: contracts mirror and `mobileGasFlags`; adapter (answers must be for the requested permit; point keys
checked); feature `@gigalibs/mobile-feature-permits` (my permits, request from a published procedure, permit screen
with status, expiry countdown, clash warning, next point cue, lock serial and lock photo, try step, gas test with live
flags, personal lock on/off, de-isolation and lock removal); routes `/permits`, `/permits/request`,
`/permits/[permitId]`; feature, binding, profiles, containment. Mobile lint, typecheck, 1,978 tests, profiles,
architecture pass.

**Gates still open**: cryptographic multi-party signatures (this build relies on authenticated people and database
four-eyes constraints); P&ID and single-line diagrams in procedures; lock hardware integration; push and vibration
expiry warnings; offline execution; device proof; owner UAT; Security review.

**Module gate (2026-11-02)**: `pnpm verify` build and every audit passed (design tokens, layers, manifests, migration
pins 33, navigation, API boundary, SDLC); test step 574 files passed, 4 failed (4,208 tests passed, 2 failed), the same
four pre-existing files (two control-plane suites needing `CONTROL_PAYLOAD_KEY_VERSION`, Project Operations module
spec, the signed-context synthetic worst case); 14 optional database proofs not run without `PROOF_DATABASE_URL`. Log:
`/var/folders/jp/fkzm1c3s1d52rj_9cvjv6kx00000gn/T/gigalibs-verify/verify-2026-11-02T03-12-01-040Z.log`. Deploy scope if
released: web, api (mobile BFF), module-host image unchanged, CMMS (migration 33, permits, work-order interlock).
