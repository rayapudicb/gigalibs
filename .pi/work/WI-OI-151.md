# WI-OI-151 evidence — timed business journeys in Playwright

## 2026-11-02 — harness and the 27 journeys

- `e2e/specs/journeys/journey-timer.ts`: `Journey.step(name, humanActions, run)` times each step and records its calls,
  failed calls and the errors shown; the human time is the Keystroke-Level Model estimate of the step's actions plus
  the measured machine time; verdicts MEETS / OVER TARGET / TOO SLOW / BLOCKED / NOT RUN; `writeJourneyReport`;
  `mayWrite` refuses to save on the UAT instance (5180) unless the owner set `GIGALIBS_ALLOW_UAT_WRITE_E2E=1`.
- `e2e/specs/journeys/business-journeys.spec.ts`: the 27 persona journeys of the plan (create, view, inline form and
  not-run kinds). Dry mode (default) opens the screen and the form, fills every required field through the real pickers,
  cancels and adds an estimated Save step; write mode saves (test stack).
- Run: `source e2e/load-uat-env.sh && cd e2e && npx playwright test specs/journeys` (dry, UAT-safe). Reports in
  `e2e/artifacts/journeys/`.

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
