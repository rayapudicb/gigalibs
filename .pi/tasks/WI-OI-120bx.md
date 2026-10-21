# WI-OI-120bx: SPEED S4 — substances, routes, steps and the gate workbench

- **Status:** Built, committed `70fe93e0` on `feat/speed-s3-module` (owner, 2026-10-21: "commit, start S4"; "commit"). Implementer: Claude Code, on the SPEED branch
  `feat/speed-s3-module` (worktree `gigalibs-speed-s3`), which holds S1, S7a, S2b and S3 (`b2861f81`).
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
- **Criteria moved here from S5:** the gate needs the complete criteria set in force (`runGate` returns a data gap
  otherwise), so S4 stores criteria sets (values and a citation for every value), imports a cited set as unreviewed
  (`speed.settings.manage`, audited) and puts one set in force per workspace. The criteria window stays in S5.
- **Conditions in S4:** the step's process values (Tp, MTT, Cp, accumulation), validated against the criteria in force
  (`validateConditions`). The ΔHr source and thermal data (cited records) are S5.
- **Two halves:** S4a the data, API, recompute and results with PostgreSQL tests; S4b the windows and the two panels.
- **Not in S4:** OB, thermal, green and interaction screens (S5, S6); library data (S6).

## Built (2026-10-21, `70fe93e0` on `feat/speed-s3-module`)

- **S4a, data and API:** migration `000002_speed_routes` (criteria sets with a citation per value and one in force;
  substances; routes; steps; materials; conditions; append-only results; tenant-carrying foreign keys; delete refused
  on substances, routes and criteria sets). 24 routes in `module.yaml`, each with its permission. The server computes
  the molar mass and the gate with the engine package; every change to a step's content recomputes it and stores a
  result (unchanged inputs store none); every stored result is audited (`SCREENING_RESULT_STORED`).
- **S4b, screens:** windows `speed-substances`, `speed-routes` (list, and the record's Route & gate tab) and the
  Projects window's Routes tab; panels `speed.route-summary` and `speed.gate-workbench` registered in `spec.ui.panels`
  and placed by the dictionary. The workbench sends a reason with every change, chosen from the panel's
  `changeReasons` prop (metadata, editable per workspace). Texts come from the module's message catalogue
  (`web/src/messages`), keyed by the codes in screen spec §4; new codes added as §4.2a.
- **Deferred, stated:** the browser does not run the engines yet; each save recomputes on the server and the panel
  shows the stored result. In-browser preview (NFR-03) comes with S5's panels. A saved substance changes through the
  API with a reason until S2's window prompt, as projects do.

## Done when

- [x] FR-INP-01, 02, 04, 05, 06 and FR-GATE-01 to 06 acceptance tests pass, named by requirement ID
      (`routes.integration.test.ts`).
- [x] API tests per operation on PostgreSQL: permission, tenant, site scope, concurrency, reason, idempotency: the
      permission of each of the 24 routes both ways (unit), and 15 PostgreSQL tests as the least-privileged role
      (results and audit append-only; criteria values fixed; deletes refused).
- [x] TC-04 and TC-05 reproduce through the API; a failing step stores only its gate result (FR-GATE-04; S4 computes
      nothing else).
- [x] The window conversion check (3 windows, 3 record types), static conformance 15/15 and `audit:design-tokens` pass;
      `pnpm verify`: build and every audit pass, 3225 tests pass; it fails only where the base commit fails (Finance's
      `finance-product-standard-costs` window from `b85a4244`; two Playground tests that need `CONTROL_PAYLOAD_KEY_VERSION`).
      71 SPEED tests (36 unit, 27 PostgreSQL, 8 panel renders). Three S2b tests written before any module had panels
      now check the shipped catalogue instead.
- [x] Card and `.pi/NOW.md` updated; committed on the owner's "commit".

## Stop and ask if

- the panel contract from S2b needs a change to carry the reason or the step rail;
- S2 (platform audit) lands first and changes how module writes are audited.
