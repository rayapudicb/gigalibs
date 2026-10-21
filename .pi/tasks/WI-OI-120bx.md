# WI-OI-120bx: SPEED S4 — substances, routes, steps and the gate workbench

- **Status:** Proposed (next after WI-OI-120bw). Implementer: Claude Code, on the SPEED branch `feat/speed-s3-module`,
  which now holds S1, S7a, S2b and S3 (`1cdb47bb`).
- **Work item:** WI-OI-120bn, slice S4 (plan v1.4 §5.1); screen spec §2.2, §2.3, §2.4 (Route & gate tab), §4.1.
- **Size:** L.

## Goal

A chemist enters a route as real records (substances, steps, materials with roles and charges, conditions) in the
mock's workbench layout, and every save is recomputed on the server by the engine package, which stores an immutable
result; a step that fails the gate gets no other result (FR-GATE-04).

## Scope

- **Data (forward migration 000002):** `substances` (formula, CAS, density, molar mass with the weights version),
  `routes` (project, version, status Draft in R1, author, row version), `steps`, `step_materials`, `step_conditions`,
  `results` (immutable: route version, step, engine, criteria, library and weights versions, inputs hash, outputs).
- **API:** the CRUD of plan §4.4 for substances, routes, steps, materials and conditions; `POST …/recompute`;
  `GET …/results/latest`. Every change carries the row version and a reason; creates are idempotent.
- **Windows:** `speed-substances`, `speed-routes` (list §2.3 with derived columns; record view with the Route & gate tab),
  the Projects window's "Routes" child tab.
- **Panels (S2b):** `speed.route-summary` and `speed.gate-workbench`, registered in `spec.ui.panels`, placed by the
  dictionary; the workbench sends a reason from the `change-reasons` value list with every save.
- **Engines:** the server computes molar mass and runs the gate with `@gigalibs/process-safety-engines`; the browser runs
  the same package for instant feedback. No result is stored for a step that fails the gate.
- **Not in S4:** OB, thermal, green and interaction screens (S5, S6); criteria and library data (S5, S6) — the gate
  needs neither.

## Done when

- [ ] FR-INP-01, 02, 04, 05, 06 and FR-GATE-01 to 06 acceptance tests pass, named by requirement ID.
- [ ] API tests per operation on PostgreSQL: permission, tenant, site scope, concurrency, reason, idempotency.
- [ ] TC-04 and TC-05 reproduce through the API; a failing step stores no result.
- [ ] The window conversion check, static conformance, `audit:design-tokens` and `pnpm verify` pass.
- [ ] Card, `.pi/NOW.md` and evidence updated; commit only when the owner says "commit".

## Stop and ask if

- the panel contract from S2b needs a change to carry the reason or the step rail;
- S2 (platform audit) lands first and changes how module writes are audited.
