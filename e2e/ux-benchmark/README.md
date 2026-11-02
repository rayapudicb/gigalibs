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
