# WI-OI-120by: SPEED S5 — oxygen balance, thermal and green screens; thermal data; library sets; criteria window

- **Status:** Built, committed `79ccb50e` on `feat/speed-s3-module` (owner, 2026-10-21: "start S5"; "commit"). Implementer: Claude Code, on the SPEED branch
  `feat/speed-s3-module` (worktree `gigalibs-speed-s3`), after S4 (`70fe93e0`).
- **Work item:** WI-OI-120bn, slice S5 (plan v1.4 §5.1); screen spec §2.4 (panels `speed.ob-chart`,
  `speed.thermal-panel`, `speed.green-scorecard`), §3.2 (criteria window), §4.2, §4.3.
- **Size:** M (L with the library moved in).

## Goal

The route's Oxygen balance, Thermal & runaway and Green metrics tabs show the engines' results for every step that
passes the gate, from cited inputs: thermal data with sources, the screening library and the criteria in force. Every
result stamps the engine, criteria, library and atomic-weight versions (NFR-10).

## Scope

- **Library sets moved here from S6** (as criteria moved to S4): the thermal engine reads reaction classes, formation
  enthalpies and gases from the library, so S5 stores library sets like criteria sets: an administrator imports a
  cited pack (every entry unreviewed, audited), one set is in force, values never change. S6 keeps the interaction
  matrix and the library windows. Per-entry governance (propose, approve, apply) stays R2 (S12), on new set versions.
- **Data (forward migration 000003):** `library_sets`; `thermal_data` (per step: ΔHr, DSC onset, TD24, decomposition
  kinetics; basis measured, literature or estimated; a citation required; one active per kind, replaced not edited);
  the ΔHr source choice on the step's conditions; energetic-group tags on step materials; the step's mitigation text
  (acceptance is R2); results gain the library set and version.
- **Compute:** for a step that passes the gate, the server stores OB per material, thermal and green results with the
  gate; a failing step stores only its gate (FR-GATE-04). The route roll-up is read from the steps' latest results.
- **API:** library sets (list, get, import, put in force; `speed.settings.manage`); thermal data (list, add, which
  replaces the active one of its kind); energetic-group tags; the mitigation text; all with a reason.
- **Screens:** the three panels on new level-0 tabs of the route; the criteria window `speed-criteria` (read, put in
  force with a reason, values with citations); the thermal panel previews a conditions change in the browser with the
  engine package (NFR-03) before it is saved.
- **Not in S5:** interactions and library windows (S6); mitigation acceptance (R2, S11); the import screen (the API is
  the import path for the pilot administrator).

## Built (2026-10-21, `79ccb50e` on `feat/speed-s3-module`)

- **S5a, data and compute:** migration `000003_speed_screening_inputs` (library sets; cited thermal data, one active per
  kind, never edited; the ΔHr source on the step's conditions; energetic groups on materials; the mitigation; the library
  stamp on results). For a step that passes the gate, the server stores OB per material, thermal and green with the gate;
  the route roll-up is read from the latest results. API: library sets (import, put in force), thermal data, energetic
  groups, mitigation; all with a reason, each route's permission tested both ways.
- **S5b, screens:** panels `speed.ob-chart`, `speed.thermal-panel`, `speed.green-scorecard` on the route's Oxygen balance,
  Thermal & runaway and Green metrics tabs, and `speed.criteria-values` on the new `speed-criteria` window (put in force
  with a reason). The thermal panel previews input changes in the browser with the engine package and the sets in force,
  then saves; the chart's span and ticks are placement props; the band and its citation come from the criteria in force.
  The route summary now fills worst criticality, route PMI and atom economy.
- **Fixed on the way:** the S4 criteria import asked for a citation of the set's version label (`missingCriteria` lists
  `version`); it now requires citations for the 23 values only.
- **Library format:** the pack carries the engines' fields plus optional display texts (material name, CAS, formula and
  note; rule finding and control; reaction class and gas names) and the energetic groups, so S6 needs no new format. An
  entry is reviewed when its set is (a set's content never changes; per-entry approval in R2 makes a new set version).

## Done when

- [x] Screen values equal the S1 test values (TC-01 to TC-03, TC-06 to TC-10) through the API on the reference route:
      every stored number equals a direct engine run on the same inputs, and the BRD figures reproduce
      (`screening.integration.test.ts`); the panels draw them (`speed-screens-panels.test.tsx`).
- [x] Every result stamps engine, criteria, library and weights versions; unreviewed inputs are labelled.
- [x] Thermal data without a citation are refused; a failing gate stores nothing but the gate.
- [~] Panels: colour is never the only signal (every badge and cell carries text) and texts come from the catalogue
      (render tests). **Not checked in a browser:** the 1366 × 768 layout and the chart rendering need a run on
      `gigalibs-test` or the pilot instance.
- [x] Conversion check (4 windows, 4 record types), static conformance 15/15, design tokens pass; `pnpm verify`: build
      and every audit pass, 3242 tests pass; it fails only where the base commit fails (Finance's window from
      `b85a4244`; two Playground tests that need `CONTROL_PAYLOAD_KEY_VERSION`). 97 SPEED tests (43 unit, 36 PostgreSQL,
      18 panel renders).
- [x] Card and `.pi/NOW.md` updated; committed on the owner's "commit".

## Stop and ask if

- the reference cases do not reproduce through the API (an engine or storage mismatch);
- the library pack format needs a decision on what a library entry holds beyond the engine's types.
