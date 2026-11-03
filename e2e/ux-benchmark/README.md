# UX journey benchmark (WI-OI-145 → WI-OI-151)

Read-only measurement of every screen a person can reach, and estimated times of the business journeys against the
10–30 second target. Nothing is created or changed: forms are opened and closed with Escape, never submitted.

```bash
OUT=e2e/ux-benchmark/out && mkdir -p "$OUT"
pnpm --filter @gigalibs/contracts run build            # the window baselines come from contracts dist
node e2e/ux-benchmark/static.mjs "$OUT"                # every metadata window: fields, required, pickers, labels
source e2e/load-uat-env.sh && node e2e/ux-benchmark/bench.mjs "$OUT"   # every screen: timings, errors, forms, masters
node e2e/ux-benchmark/journeys.mjs "$OUT"              # Keystroke-Level Model times per journey, blockers
node e2e/ux-benchmark/inventory.mjs "$OUT" docs/plans/ux-journeys-screen-inventory.md
```

- `UX_BENCH_BASE_URL` (default `http://127.0.0.1:5180`) and the walkthrough login from `e2e/uat.env`
  (`E2E_UAT_ADMIN_EMAIL`, `E2E_UAT_ADMIN_PASSWORD`) are read from the environment and never printed.
- The 2026-11-02 baseline is in `docs/plans/ux-benchmark-2026-11-02/`; the plan is
  `docs/plans/ux-journeys-benchmark-plan.md`.
- Journey times use the Keystroke-Level Model (think 1.35 s, point 1.1 s, click 0.1 s, 0.28 s per key) plus the
  measured screen load; required fields only. The Playwright journey specs of WI-OI-151 replace the estimates with
  measured times on the isolated test stack.

## Timed journeys and the workbook

```bash
# bash, from a worktree whose e2e/uat.env holds the walkthrough login (the loader needs BASH_SOURCE; zsh finds nothing)
bash -c "source e2e/load-uat-env.sh && cd e2e && JOURNEY_MODE=dry npx playwright test specs/journeys --workers=1"   # dry: saves nothing
node e2e/ux-benchmark/workbook.mjs "Claude outputs/UX journeys <date>/GigaLibs-Functional-Technical-Workbook.xlsx"
```

`workbook.mjs` builds the functional and technical workbook: one sheet per module and Settings area (every screen,
create form, action, journey, control-plane call and work item as a user story with inputs, API, request, response,
expected result, business outcome, target, estimate, measurement, issues, bugs and QA status), the journeys and their
steps, the QA bug tracker, the screen inventory, the field dictionary, the masters, the API catalogue, the roles and
the work-item register. It reads this baseline, the latest report in `e2e/artifacts/journeys/` and the generated
catalogue; `workbook-content.mjs` holds the hand-written parts (screen purposes, modules, bugs, UX stories). Update the
bug statuses there when a fix reaches UAT, then regenerate.
