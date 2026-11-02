# WI-OI-139 evidence: M-DVIR fleet and heavy-equipment pre-trip inspection

Card: `.pi/tasks/WI-OI-139.md`. Branch `feat/frontline-suite`; mobile in `/Users/rayapudi/dev/gigalibs_mobile`.

## 2026-11-02 — backend, admin web, mobile BFF and mobile app

**Ownership (agent decision under the owner's directive; for Architecture review).** CMMS writes check templates,
fleet enrolment, inspections and groundings (red tags) on its own assets, and raises its own maintenance requests and
work orders. Grounding is its own record, not `asset_downtimes` (ADR-0035); it also takes an operational asset offline
and restores it on clearance, as failed calibrations do. Workforce owns credentials and has no credential store yet:
the required credential is recorded per asset and reported as unverified.

**Contracts** (`packages/contracts/src/cmms/fleet.ts`): templates (zones of items, unique keys, ≤ 120 items),
enrolment (interval 1–168 h, required credential), inspection submission (every item once, a note on each defect,
photos only on defects, ≤ 300 KB each and ≤ 600 KB together, the inspector's statement), inspection, red tag, readiness
(`fleetReadinessState`: GROUNDED, AWAITING_CLEARANCE, INSPECTION_DUE, OPERATIONAL), eligibility, asset view. Mobile
problem `MOBILE_FLEET_CONFLICT`. 3 contract tests.

**CMMS migration 31** (`000031_fleet_equipment_inspection`): `fleet_check_templates` (revision per code; one draft
and one published per code), `fleet_enrollments`, `fleet_inspections` (result follows the defect counts; a request
exactly when there are minor defects; the statement must be true), `fleet_inspection_results` (note on each defect),
`fleet_inspection_photos`, `fleet_groundings` (one open per asset; whole repair certificate; lifecycle; four eyes:
whoever clears did not certify; an override carries its reason); work-order origin `FLEET_DEFECT`. Forced tenant RLS.
Inspections, results and photos are append-only for the runtime role (compose and `verify-cmms-runtime.sh`). Pins
30 → 31. Proof `db/proofs/000031_fleet_equipment_inspection.sql` on disposable PostgreSQL 16 (manifest migrations
through 31, non-superuser non-owner role with runtime grants, rolled back) passed; down to 30 while empty and up to
31, proofs 30 and 31 pass again.

**Service** (`apps/api/src/fleet/`): templates as shared reference data (workspace-wide access): draft, edit,
publish (previous → SUPERSEDED), revise, retire (refused while assets are enrolled). Enrolment needs a published code
and write scope on the asset. Inspections lock the enrolment (serialising one asset), must use the current published
revision (`CMMS_FLEET_TEMPLATE_CHANGED`), answer every item, carry sniffed photos, fall within 5 minutes ahead and 24
hours late, and replay by operation id and payload hash. Minor defects raise one maintenance request (the request
service now has `submitWithClient`); a critical defect or manual red tag grounds the asset once, raises an EMERGENCY
work order through a system principal with a derived request key (calibration's helper moved to
`common/system-principal.ts`), and takes an operational asset offline. Certify (mechanic), clear (a different
supervisor; restores an asset the red tag took offline) or override with a reason. Readiness from the open red tag and
the latest non-grounded inspection received after the last clearance. History windows ≤ 92 days. Tests: 8 on real
PostgreSQL (`fleet.pg.test.ts`); the full CMMS suite (47 files, 350 tests) passes with the real-PostgreSQL suites.
Compiled `AppModule` loads.

**Manifest** (CMMS): `cmms.fleet.read|inspect|certify|authorize|manage`; new role Equipment operator (read, inspect);
technician read, inspect, certify; planner read, inspect, authorize, manage; viewer read; 12 gateway routes;
`/cmms/fleet` "Fleet Readiness". **Web**: readiness matrix with state counts; red-tag queue (certify, clear, override);
enrolment; circle-check editor (zones and items; publish, revise, retire); inspection history with CSV export
(formula-neutralised cells); asset view with recent checks and a manual red tag. Screen-to-gateway test (17 calls),
gateway and navigation equivalence and the CMMS role reconciliation (5 roles) updated.

**Mobile BFF**: `MobileFleetController` (tag resolve as a body, asset view, inspection, open red tags, manual red tag,
repair certificate) with a CMMS-signed context; the control plane's bounded 1 MiB parser now also covers
`/api/v1/mobile/fleet/inspections`; web `/mobile/v1` allowlist; session grant of module `fleet` (inspect and certify,
camera).

**Mobile app**: contracts mirror; adapter (receipts must match the asset and check; views the requested asset; a
certificate must leave GROUNDED); feature `@gigalibs/mobile-feature-fleet` (scan a tag, open red tags with the
mechanic's certificate, asset readiness banner with credential note, pre/post-trip, manual red tag with a fixed
operation id, zone-by-zone check with Pass/Minor/Critical/N.A., defect notes and photos, the inspector's statement,
predicted result, the first body resent unchanged after a lost answer, result banner); the still camera hook takes a
size bound; routes `/fleet`, `/fleet/[assetId]`, `/fleet/inspect/[assetId]`; feature, binding, profiles, containment.

**Tests and gates**: contracts 3; CMMS real-PostgreSQL 8; web fleet screens, gateway, navigation, role
reconciliation; auth-nest fleet 2, projection, BFF boundary. Mobile lint, typecheck, 1,965 tests, 2 profiles,
architecture.

**Gates still open**: Workforce credential projection (interlock enforcement); telematics/BLE ignition interlock;
offline inspection capture; regulatory export formats beyond CSV; device proof; owner UAT; Architecture review of the
ownership decision.

**Module gate (2026-11-02).** `pnpm verify`: the test step fails only on the four known pre-existing suites; 14
optional isolated-database proofs not run. Log:
`/var/folders/jp/fkzm1c3s1d52rj_9cvjv6kx00000gn/T/gigalibs-verify/verify-2026-11-02T01-59-57-843Z.log`. The manifest
step flagged the permission catalogue, which also reads control-plane permission checks; regenerated after the mobile
adapter, the manifest check is clean and the catalogue, role and gateway suites pass (16 files, 186 tests).
`next build` passes (`/cmms/fleet`); token and layer audits clean. The synthetic worst signed-context configuration
is now 16,163 characters (refused at minting with a reason; realistic members pass); the platform decision in
WI-OI-134 remains open.
