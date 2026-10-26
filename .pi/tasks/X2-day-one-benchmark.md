# X2 — Task benchmark (a measurement, not a gate)

- **Status:** Day-1 onboarding benchmark built 2026-10-26 (local). Plan item 3.10. A measurement — gates nothing.

## What it measures

The Day-1 onboarding task: how a brand-new workspace reaches a working state (the M1a / Phase-3 outcome), and how much
of that can be done without hand-work. Each task in `DAY_ONE_TASKS` (`contracts/benchmark/`) names the **real**
control-plane surface that performs it (built and verified in Phase 3 — R13/R14 people admin, R15 directory groups, S17
console, T11b wizard), so the benchmark is traceable, and `summarizeDayOneBenchmark` scores it. Re-run after any change
to watch the numbers move.

## Baseline (2026-10-26, people = 200)

| Metric | Value |
| --- | --- |
| Day-1 tasks | 8 |
| Automatable (bulk/API/Assistant surface) | 7 |
| Manual-only (a screen, by hand) | 1 (naming the company) |
| **Automation coverage** | **88%** |
| By mode | BULK_API 3 · API 4 · MANUAL_UI 1 · ASSISTANT 0 |
| 200-person bulk operations (invite + grant + off-board) | **3 calls** |
| …the same one-by-one | 600 calls |

Headline: the Phase-3 exit's "a department head adds 200 people in one import" is **1 API call**, not 200 — and the
three per-person lifecycle tasks (invite, grant, off-board) cost 3 calls total for 200 people instead of 600.

## How to re-run

`summarizeDayOneBenchmark(DAY_ONE_TASKS, people)` (pure). Proof: `benchmark/day-one-benchmark.test.ts` (3) locks the
baseline. As surfaces gain an Assistant action or a manual step becomes an API, the mode moves and coverage rises.

## Deferred (flagged)

- A **live end-to-end timing benchmark** — run the Day-1 sequence against a running control plane / throwaway Postgres
  and record wall-clock time and real request counts (the richer measurement; needs a stack, like the integration
  tests). This static benchmark measures task *coverage and call-count*, not latency.
- Folding in **Assistant** task-completion once an Assistant eval harness exists (the ASSISTANT mode is modelled but no
  Day-1 task uses it yet).
