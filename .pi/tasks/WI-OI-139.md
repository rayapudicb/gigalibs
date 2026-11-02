# WI-OI-139: M-DVIR Fleet and heavy-equipment pre-trip inspection (CMMS extension, web and mobile)

- **Status:** Approved (owner, 2026-11-01: "continue all the modules without my intervention implement everything");
  In progress on `feat/frontline-suite`.
- **Work item:** WI-OI-139. Evidence: `.pi/work/WI-OI-139.md`. Spec: `docs/products/mobile-suite/06-fleet-equipment-dvir.md`;
  ADR-0035 (CMMS owns fleet inspections and grounding state; Workforce owns credentials).
- **Size:** L

## Ownership decision (agent, under the owner's directive; for review)

CMMS writes check templates, fleet enrolment, inspections and groundings (red tags) on its own assets, and raises its
own maintenance requests and work orders from defects. Grounding is its own record, not `asset_downtimes` (ADR-0035:
no schema proof that downtimes model grounding); a grounding also takes an operational asset offline and restores it
on clearance, as failed calibrations do. Workforce owns operator credentials; it has no credential store yet, so the
credential interlock is recorded as a requirement per asset and reported as unverified (gate).

## Design

- **Data (CMMS migration 31, additive):** `fleet_check_templates` (revision per code, optional asset class, zones of
  items; DRAFT → PUBLISHED, previous → SUPERSEDED, or RETIRED); `fleet_enrollments` (asset, template code, inspection
  interval in hours, required credential); `fleet_inspections` and `fleet_inspection_results` (append-only; every item
  of the pinned revision answered once; a note on each defect); `fleet_inspection_photos` (bounded rasters,
  append-only); `fleet_groundings` (one open per asset; GROUNDED → REPAIRED by a mechanic's corrective action →
  CLEARED by a supervisor who did not certify it, or a supervisor override with a reason). Work-order trigger
  `FLEET_DEFECT`.
- **Rules:** a minor defect raises one maintenance request per inspection; a critical defect grounds the asset (if not
  already grounded), raises one emergency work order (idempotent) and takes an operational asset offline; a manual red
  tag does the same. Readiness: GROUNDED, AWAITING_CLEARANCE, INSPECTION_DUE (no inspection since the interval or since
  the last clearance), OPERATIONAL; dispatch eligibility only when OPERATIONAL. Clock skew 5 minutes ahead, 24 hours
  late. Replays by operation id.
- **Permissions:** `cmms.fleet.read|inspect|certify|authorize|manage`. New role Equipment operator (read, inspect);
  technician (mechanic) read, inspect, certify; planner (supervisor) read, inspect, authorize, manage; viewer read.
- **Web:** `/cmms/fleet` readiness matrix, grounding queue (certify, clear, override), enrolment, template editor,
  inspection history with CSV export.
- **Mobile:** `/mobile/v1/fleet/...` (tag resolve, asset view with eligibility, submit inspection with photos, manual
  red tag, open groundings, certify repair); feature `fleet` (scan, zone-by-zone circle check, result banner, mechanic
  repair certificate).

## Gates

Workforce credential projection (interlock enforcement); telematics/BLE ignition interlock; offline inspection
capture; regulatory export formats beyond CSV; device proof; owner UAT; review of the ownership decision.
