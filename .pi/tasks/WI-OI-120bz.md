# WI-OI-120bz: SPEED S6 — interactions, controls and the library window

- **Status:** Built, committed `82f3b114` on `feat/speed-s3-module` (owner, 2026-10-21: "start S6"; "commit"). Implementer: Claude Code, on the SPEED branch
  `feat/speed-s3-module` (worktree `gigalibs-speed-s3`), after S5 (`79ccb50e`).
- **Work item:** WI-OI-120bn, slice S6 (plan v1.4 §5.1); screen spec §2.2 (library material), §2.4 (panel
  `speed.interaction-matrix`), §3.1 (library windows).
- **Size:** M (the library storage and import moved to S5).

## Goal

The route's Interactions tab shows, for each step, every pair of materials the library classes as hazardous, with the
rule's finding, citation and severity; a High finding needs a documented control (BRL-04); the statement "absence of a
finding does not prove safety" is always there. The library in force can be read and put in force from a window.

## Scope

- **Data (forward migration 000004):** a substance's link to a library material (the reactivity classes come from it);
  `interaction_controls` (per step and material pair: the control text, who documented it, a reason with every change).
- **Compute:** for a step that passes the gate the server also stores the interaction screen (FR-GATE-04 unchanged).
  Linking a substance to a library material recomputes the draft steps that use it.
- **API:** the substance's library link (create, change with a reason); document a control for a finding in the latest
  result (`speed.routes.write`).
- **Screens:** panel `speed.interaction-matrix` on the route's Interactions tab (matrix, findings most severe first,
  controls, single-material notes, the statement, and a "link to library" picker for unclassified materials); window
  `speed-library`: the library sets with put in force (reason), and panel-only tabs listing the set's materials,
  interaction rules, reaction classes and energetic groups with their citations (R1: read-only).
- **Departure from screen spec §3.1:** one library window with entry tabs, not three entry windows: metadata windows
  address records by UUID and library entries are identified by their library ids (`L01`, `R-01`) inside an immutable
  set, so the entries are drawn by a registered panel per set.

## Built (2026-10-21, `82f3b114` on `feat/speed-s3-module`)

- **Data and compute:** migration `000004_speed_interactions` (a substance's library link; `interaction_controls`, which
  go with either material when it is removed). For a step that passes the gate the server stores the interaction screen
  with the other results; linking a substance recomputes the draft steps that use it.
- **API:** the substance's library link (checked against the library in force); `PUT steps/{id}/controls` documents the
  control of a finding in the step's latest result, at its version, with a reason; the record adapters for library
  sets (put in force) and the `speed-library-materials` picker.
- **Screens:** panel `speed.interaction-matrix` on the route's Interactions tab (step pills with the High count, the
  matrix with a letter in every finding cell, findings most severe first with the library's finding text and citation,
  controls prefilled from the rule's control text, single-material notes, the statement always shown, a "link to
  library" picker for unclassified materials); window `speed-library` with entry tabs (panel `speed.library-entries`);
  the substance's library-material field; the route summary's High interactions tile (controlled / total).

## Done when

- [x] TC-11 through the API: step 4 NaOH × DMSO is a High finding with its citation and rule
      (`interactions.integration.test.ts`); the panel draws it (`speed-interactions-panels.test.tsx`).
- [x] No rule without a citation (the pack schema refuses it); unreviewed entries are labelled (findings, the library
      window and the summary).
- [x] A High finding shows "control not documented" until a control is documented; the statement is always shown.
- [x] Conversion check (5 windows, 5 record types), static conformance 15/15, design tokens pass; `pnpm verify`: build and
      every audit pass, 3249 tests pass; it fails only where the base commit fails (Finance's window from `b85a4244`;
      two Playground tests that need `CONTROL_PAYLOAD_KEY_VERSION`). 110 SPEED tests (44 unit, 42 PostgreSQL, 24 panel
      renders). Not checked in a browser (as S5).
- [x] Card and `.pi/NOW.md` updated; committed on the owner's "commit".

## Stop and ask if

- a control should also be required for Medium findings (the BRD makes it mandatory for High only, BRL-04).
