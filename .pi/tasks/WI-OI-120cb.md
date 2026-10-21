# WI-OI-120cb: SPEED as its own sidebar section, like EAM

- **Status:** Built, committed `02bd35ff` on `feat/speed-s3-module` (owner, 2026-10-21: "i would like to see everything implemented in UI in the admin as a
  seperate section like EAM"; "commit" of S7). Implementer: Claude Code, on the SPEED branch `feat/speed-s3-module`
  (worktree `gigalibs-speed-s3`), after S7 (`32c010a1`).
- **Work item:** WI-OI-120bn (SPEED Stage 1); screen spec §1.1 (windows and routes).
- **Size:** S.

## Goal

SPEED appears in the sidebar the way the EAM Operations Console does: one entry that expands into its screens, each
with its own page, instead of one page with in-page tabs.

## Design

- **Menu and pages from the manifest**, as EAM's: `module.yaml` declares the catalogue entry's `menu` (Projects, Routes,
  Substances, Screening library, Screening criteria) and one page per screen (`/speed/projects`, `/speed/routes`,
  `/speed/substances`, `/speed/library`, `/speed/criteria`), each the `SpeedWorkspace` with its `section`; `/speed`
  opens Projects. `pnpm modules:catalog` generates the pages and the navigation; the shell holds nothing per module.
- **One screen per page:** `SpeedWorkspace` draws the window of its section; the sidebar replaces the in-page tabs. A
  screen the member may not read says so, as today.
- **Unchanged:** the group (Intelligence), the windows and panels, the permissions; Outcomes joins the menu in S9.
- **Readiness stays PLANNED:** on UAT the section opens under the UAT preview; showing it as released (REVIEW) is the
  owner's decision once live conformance and independent review pass.

## Built (2026-10-21, `02bd35ff` on `feat/speed-s3-module`)

- `module.yaml`: the catalogue entry's `menu` (Projects, Routes, Substances, Screening library, Screening criteria)
  and six pages, `/speed` and one per screen, each the `SpeedWorkspace` with its `section` and the session's
  permissions; `pnpm modules:catalog` generated the pages and the sidebar menu.
- `SpeedWorkspace` draws the window of its section (`SPEED_SECTIONS`, `surfaceOf`); the in-page tabs are gone.
- Tests: the navigation equivalence test records the menu as an intended change; `speed-navigation.test.ts` proves
  each menu item is a generated page showing its screen and `/speed` opens Projects.

## Done when

- [x] The sidebar entry expands into the five screens, each opening its own page, and `/speed` opens Projects
      (`speed-navigation.test.ts`, `module-navigation-equivalence.test.ts`). Not opened in a browser: SPEED is not on
      UAT yet (its deployment wiring is S9) and stays PLANNED, so it opens there only under the UAT preview.
- [x] The navigation audit, conversion check, static conformance 15/15, design tokens pass; `pnpm verify`: build and
      every audit pass, 3278 tests pass; it fails only where the base commit fails (Finance's window from `b85a4244`;
      two Playground tests that need `CONTROL_PAYLOAD_KEY_VERSION`).
- [x] Card and `.pi/NOW.md` updated; committed on the owner's "commit".

## Stop and ask if

- SPEED should be its own sidebar group rather than an entry under Intelligence (a contracts change to the group list).
