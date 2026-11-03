# WI-OI-151 evidence — timed business journeys in Playwright

## 2026-11-02 — harness and the 27 journeys

- `e2e/specs/journeys/journey-timer.ts`: `Journey.step(name, humanActions, run)` times each step and records its calls,
  failed calls and the errors shown; the human time is the Keystroke-Level Model estimate of the step's actions plus
  the measured machine time; verdicts MEETS / OVER TARGET / TOO SLOW / BLOCKED / NOT RUN; `writeJourneyReport`;
  `mayWrite` refuses to save on the UAT instance (5180) unless the owner set `GIGALIBS_ALLOW_UAT_WRITE_E2E=1`.
- `e2e/specs/journeys/business-journeys.spec.ts`: the 27 persona journeys of the plan (create, view, inline form and
  not-run kinds). Dry mode (default) opens the screen and the form, fills every required field through the real pickers,
  cancels and adds an estimated Save step; write mode saves (test stack).
- Run (dry, UAT-safe), under bash from a worktree whose `e2e/uat.env` holds the walkthrough login (the loader needs
  `BASH_SOURCE`; sourced from zsh it finds no file and every journey is skipped):
  `bash -c "source e2e/load-uat-env.sh && cd e2e && JOURNEY_MODE=dry npx playwright test specs/journeys --workers=1"`.
  Reports in `e2e/artifacts/journeys/`.

## Run 2 on UAT 5180 (`c88a88d4`, dry, 2026-11-02T13:58Z) — the "before"

Copied to `docs/plans/ux-benchmark-2026-11-02/journeys-e2e-before.json`.

| Verdict | Journeys |
|---|---|
| MEETS (12) | A2, A6, A7, T2, T3, T5, S1, S3, F1, F2, E1, X1 |
| OVER TARGET / TOO SLOW (4) | A1 25.3 s of 20, A5 33.6 of 30, T1 19.4 of 15, S2 11.4 of 10 |
| BLOCKED (8) | A4, B3 (Inventory 500, no warehouses); B1, B2, B4 (Procurement records 404); C1, C2 (Orders records 404); T4 (no create button on My absences) |
| NOT RUN (3) | P1, P2 (need a platform operator login), A3 (not possible today) |

## Open (stays in this card)

Write mode on the isolated test stack with seeded masters; the platform operator journeys; budgets as a gate
(`pnpm e2e:journeys`); the "after" run once the owner deploys the WI-OI-146/149 fixes.

## 2026-11-03 — retest and regression on UAT `02b3353a` (owner deploy of the P1–P3 batch)

All read-only: dry journeys, screen bench, read-only e2e specs and a new retest spec that opens each changed form and
dialog and cancels (`e2e/specs/uat-retest-wi146-150.spec.ts`). Runs, screenshots and logs:
`Claude outputs/UX journeys 2026-11-02/` (`journey-runs/`, `retest-02b3353a/`, `regression-02b3353a/`,
`screenshots-2026-11-03-r2/`); bench `docs/plans/ux-benchmark-2026-11-03-r2/`; workbook sheet "Regression & retest".

| Suite | Result |
|---|---|
| Screen bench (129) | failing screens 15 → 8; never settles 1 (Connections); fixed since `213fde2d`: Jobs, Scheduling, Time, Places & maps, Settings › Organization, Work orders, Assets, CMMS inventory |
| Journeys, dry (27) | 14 meet, 3 over (A1, T1, S2), 5 too slow but no longer blocked (B1, B2, B4, C1, C2), 2 blocked (A4 — QA-048; T4 — no absence types until the starter set is loaded), 3 not run |
| Read-only e2e (50 tests) | 48 pass; `module-analytics-pilot` fails on QA-012; `uat-tour-automate-intelligence` failed on its own timeout (8 × 9 s pauses > 60 s) — sized to its steps, passes on UAT |
| Retest (19 checks) | 14 pass, 2 fail (QA-012, QA-013), 3 not testable read-only (no quote, requisition or fulfillment to open) |

**Fixed in branch from the retest** (after `02b3353a`, awaiting deploy):
- QA-012 — cause found: the Analytics module fact pipeline rebuilt each dataset as an internal principal without the
  module's read permission, and the build re-checks source access, so every module catalog answered 403 to everyone
  (the admin holds 290 permissions). The pipeline principal now also holds the source's read permission.
- QA-013 — Connections never read a refused Workflow Studio answer; the browser keeps an unread answer open (proven on
  UAT). The page reads the answer.
- QA-048 — the warehouse owning unit picker asked Inventory for the organization lookup (404, journey A4 blocked);
  Inventory now sends platform lookups to the control plane.
- QA-049 — credit memo line product is a picker. QA-050 — a new fulfillment's order line fills from the picked sales
  order (no typed line UUID). QA-031 — Accounting books fields have help.

Tracker after the retest: 50 bugs — 35 fixed on UAT, 7 fixed in branch, 4 retest (need data or an operator login),
2 owner actions (load the starter absence types and asset classes: one click each), 1 open (QA-038 journey times),
1 closed.

## 2026-11-03 — retest and regression on UAT `38aa9017` (owner deploy of the retest fixes)

| Suite | Result |
|---|---|
| Retest (22 checks) | 19 pass, 0 fail; 3 not testable read-only (QA-022 dialogs: no quote, requisition or fulfillment on UAT) |
| Screen bench (129) | failing screens 8 → 5; nothing left that never settles. Remaining: four Workflows screens answer 503 by design while Workflow Studio is not in the UAT stack (QA-009, owner decision), Settings › General configured-field manifest 404 handled on screen (QA-011) |
| Journeys, dry (27) | 15 meet (A4 now meets), 3 over (A1, T1, S2 — QA-038), 5 too slow (B1, B2, B4, C1, C2), 1 blocked (T4 until the starter absence types are loaded — owner action QA-026), 3 not run |
| Read-only e2e (50 tests) | 50 pass (Analytics pilot and the tour included) |

Verified on UAT: QA-012 (Analytics catalog 200 on all three screens), QA-013 (Connections settles in 1.3 s), QA-048
(5 unit options), QA-049, QA-050, QA-031 (books help 6 of 6). Logs on 38aa9017 clean. Tracker: 50 bugs — 42 fixed on
UAT, 4 retest (need records or an operator login), 2 owner actions, 1 open (QA-038), 1 closed. Runs and screenshots:
`Claude outputs/UX journeys 2026-11-02/` (`retest-38aa9017/`, `regression-38aa9017/`, `screenshots-2026-11-03-r3/`);
bench `docs/plans/ux-benchmark-2026-11-03-r3/`. Queue item 0 is complete.
