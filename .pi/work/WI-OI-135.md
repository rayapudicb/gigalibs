# WI-OI-135 evidence: M-TAG asset tagging, field commissioning and floor-walk audits

Card: `.pi/tasks/WI-OI-135.md`. Branch `feat/frontline-suite`; mobile in `/Users/rayapudi/dev/gigalibs_mobile`.

## 2026-11-02 — backend, admin web, mobile BFF and mobile app

**Ownership.** CMMS writes everything. CMMS assets already carry the business `asset_tag`, serial, manufacturer, model,
parent, site, space, classification and specs; no physical-tag binding, commissioning intake or audit walk existed.
`AssetsService.createWithClient` now lets an approval create the asset inside its own transaction with the same checks
(`create` delegates to it unchanged).

**Contracts** (`packages/contracts/src/cmms/commissioning.ts`): tag kinds and normalisation (NFC/RFID UIDs upper-case
hex without separators), tag binding and resolution, commissioning submit/request/decision/context, floor-walk start,
sighting and report. Mobile problem `MOBILE_COMMISSIONING_CONFLICT`.

**CMMS migration 28** (`000028_asset_tagging_commissioning`, additive): `asset_physical_tags` (one active binding per
kind and value, UID format, complete retirement), `asset_commissioning_requests` (unique operation, tag and location
pairs, decision shape, four eyes), `asset_audit_walks` (space or site, finish), `asset_audit_sightings` (append-only,
unique operation). Forced tenant RLS on all four. Pins 27 → 28; append-only list gains `asset_audit_sightings`.

**Proofs** (disposable PostgreSQL 16, manifest migrations, non-superuser non-owner role with runtime grants, rolled
back): `db/proofs/000028_asset_tagging_commissioning.sql` — one active binding, UID format, retirement shape, re-binding
after retirement; request uniqueness, pairs, approve-without-asset and reject-without-note refused, four eyes; walk
target and finish; sightings refuse UPDATE/DELETE (42501) and duplicate operations; tenant B sees nothing and cannot
insert for A; unbound session sees nothing. Down to 27 while empty and up to 28; proofs 27 and 28 both pass.

**Service.** Commissioning: context (spaces within the caller's places, classifications), submit (replay by operation
id and hash, refuses a bound tag, duplicate candidates by asset tag and by serial with manufacturer), decision
(APPROVE_NEW creates the asset through the asset writer and binds the tag in one transaction; LINK_EXISTING relocates
an existing asset to the request's space and binds the tag; REJECT needs a note; never the submitter; once). Tags:
resolve (visible assets only), list, bind, retire. Floor walks: start (space or site), sightings (replay-safe, finished
walk refused, future clock refused, asset resolved within the caller's scope), finish, report (seen, relocated,
missing from the walk's space or site, unknown tags). Real-PostgreSQL test (`commissioning.pg.test.ts`): 8/8 — it
found two bugs before passing (tag outbox events collided with the asset's aggregate versions, now their own
`CMMS_ASSET_TAG` aggregate; the report bound an unused parameter). Calibration's 10 still pass. Compiled `AppModule`
loads under Node.

**Manifest**: `cmms.commissioning.read|submit|approve`, `cmms.audits.read|execute` (technician read+submit and
audits read+execute; planner read+approve and audits read; viewer reads); 10 gateway routes; `/cmms/commissioning`.
**Web**: Commissioning section — request triage with duplicates and create/link/reject, floor-walk list and report,
tag lookup and retire. `next build` passes.

**Mobile BFF**: shared CMMS forwarder (`mobile-cmms-forward.ts`, now also used by calibration); commissioning adapter
(context, requests, tag resolve as a POST body turned into CMMS's query, walks start/sightings/finish/report); web
`/mobile/v1` allowlist; session grant of module `commissioning` with `cmms.commissioning.submit` and/or
`cmms.audits.execute`.

**Mobile app**: contracts mirror, API adapter (answers must belong to the request), feature
`@gigalibs/mobile-feature-commissioning` (commission form with confirmed nameplate text, tag by camera or NFC, space and
classification; floor walk with pending scans kept and resent with the same id; report), capability pack
`@gigalibs/mobile-capability-tagging` (camera tag scanner reporting the symbology; NFC identifier reader), routes
`/commissioning`, `/commissioning/new`, `/commissioning/walk`, feature/binding/profiles/containment.

**Tests and gates**: platform targeted suites (web 1,045 incl. CMMS and contracts; auth-nest mobile 42); mobile lint
(606 files, 3 pre-existing warnings), typecheck, 1,943 tests, profiles, architecture.

**Gates still open**: on-device nameplate OCR (native vision pack and device proof); GPS capture (no location pack;
indoor placement by space); offline persistence (shared encrypted journal); physical NFC/DataMatrix proof; owner UAT.

**Module gate (2026-11-02).** `pnpm verify`: build and every audit, manifest, pin, window, conversion and deployment
profile check pass; the test step fails only with the four known pre-existing suites; 14 optional isolated-database
proofs not run. Log: `/var/folders/jp/fkzm1c3s1d52rj_9cvjv6kx00000gn/T/gigalibs-verify/verify-2026-11-01T18-34-08-759Z.log`.
The synthetic worst signed-context configuration (see WI-OI-134) grows to 15,596 characters with the five new codes;
it stays refused at minting with a reason, and the realistic-member test passes. The platform decision recorded in
WI-OI-134 is still open.
