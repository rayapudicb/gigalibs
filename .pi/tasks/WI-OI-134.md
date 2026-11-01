# WI-OI-134: M-CAL Field instrument calibration (CMMS extension, web and mobile)

- **Status:** Approved (owner, 2026-11-01: "continue all the modules without my intervention implement everything");
  In progress on `feat/frontline-suite` in `/Users/rayapudi/dev/gigalibs-rounds`.
- **Work item:** WI-OI-134. Evidence goes in `.pi/work/WI-OI-134.md`. Product spec:
  `docs/products/mobile-suite/03-field-instrument-calibration.md`; plan: `docs/plans/frontline-mobile-suite-implementation-plan.md` §3.
- **Size:** L

## Goal

An E&I technician calibrates an instrument at the skid (on a phone, offline if needed) against a valid master
standard; errors are computed live and recomputed by the server; a different metrology lead approves and the
certificate is issued; a failed instrument is taken out of service and a corrective work order is raised.

## Ownership record (plan §3)

- **Writer:** CMMS (`physical-operations-cmms`). Instruments are CMMS assets; calibration is maintenance metrology.
  No new module, catalogue entry or entitlement. Reconciliation: CMMS has only a `CALIBRATION` job-plan task type;
  no calibration tables, routes or contracts exist. The `esignature` module is a frozen prototype and is not used.
- **Data (CMMS migration 27, additive):** `calibration_standards` (master equipment, certificate, validity);
  `calibration_profiles` (versioned per asset: ranges, transfer function, tolerance, test points, interval; draft →
  published by a different user; one published revision per asset); `calibration_records` (immutable profile snapshot,
  technician, client operation id, results, record hash, decision); `calibration_record_standards` (standard snapshot);
  `calibration_points` (raw readings, server-computed error). Forced tenant RLS; organization (department) and place
  scope from the asset; records and points append-only for the runtime role except the decision columns.
- **Math:** one pure function in `@gigalibs/contracts` used by mobile, web and server (linear and square-root
  transfer; % of span or absolute tolerance; 6-decimal rounding). The server recomputes every point; client values
  are never trusted.
- **Rules:** every record names ≥1 standard that is ACTIVE and valid on the capture date. As-found PASS → PASS.
  As-found FAIL needs as-left: as-left PASS → ADJUSTED; otherwise FAIL. A FAIL takes an OPERATIONAL asset OFFLINE
  and raises one HIGH corrective work order (origin `CALIBRATION`) in the same transaction. An as-found FAIL is
  flagged for product-impact review. Approval or rejection is by a user other than the technician (DB check). The
  certificate exists only for APPROVED records; next due = last approved PASS/ADJUSTED + profile interval.
- **Sign-off:** governed record sign-off (actor from the signed context, fixed intent statement, time, record
  SHA-256). **No 21 CFR Part 11 claim**: the platform has no step-up re-authentication. That remains a gate.
- **Permissions:** `cmms.calibration.read|execute|approve|manage|publish`. Technician: read, execute. Planner:
  read, manage. New role Metrology lead: read, approve, publish, manage. Viewer: read.
- **API:** CMMS `v1/calibration/standards|profiles|instruments|records` (+ publish, bundle, decision, certificate,
  drift). Mobile: `/mobile/v1/calibration/...` through the control-plane mobile adapter with a CMMS signed context.
- **Offline:** the mobile app downloads the instrument bundle (published profile + standards), captures into the
  encrypted device store, and submits once with a stable client operation id; replay returns the stored record; a
  changed profile revision or expired standard is an explicit conflict.

## Steps

1. Contracts and shared math; CMMS migration 27 with rollback-only proof on disposable PostgreSQL 16.
2. CMMS service and controllers; tests for math, rules, SoD, idempotency, scope, OOT containment.
3. Manifest: permissions, roles, gateway routes, Tenant Admin coverage; `pnpm modules:catalog`.
4. Web: CMMS Calibration tab (due instruments, capture, records and approval, certificate, profiles, standards, drift).
5. Mobile BFF adapter and web BFF allowlist; compose passes the CMMS signing key to the control plane.
6. `gigalibs_mobile`: calibration feature (due list, bundle, capture grid with live math, offline queue, receipts).
7. Module gate: tests, typecheck, `next build`, compiled module load, audits; evidence; module-completion commit.

## Done when

- [ ] All seven steps are done with evidence in `.pi/work/WI-OI-134.md`.
- [ ] `pnpm verify` reports only the four known pre-existing failures.
- [ ] Mobile gates pass (lint, typecheck, tests, architecture, profiles).

## Gates (owner / independent)

- Step-up re-authentication and any regulated e-signature claim (platform identity owner + Security review).
- Physical device proof (barcode scan of a standard, offline capture, restart) on representative devices.
- UAT deploy by the owner and journey acceptance.
