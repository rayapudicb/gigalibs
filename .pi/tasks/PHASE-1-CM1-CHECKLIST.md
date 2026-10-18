# Phase 1 CMMS exit (M-CM1) — single acceptance checklist

Owner batch review (2026-10-18): verify every row after one UAT deploy of release worktree **`1d8d2634`**, tag
**`1d8d2634b8f2-c6148e918ff0`** (CMMS mig **22**, **120bk**, **120bj**, journey; predecessor **`38aa3120`** on UAT).
Main tip: **`b679ce24`** on `feat/gigaops-convergence-core`.

| # | Card | Built in git | UAT / journey evidence | Owner Done |
|---|------|--------------|------------------------|------------|
| 1 | [WI-OI-120bi](WI-OI-120bi.md) sign-off | mig **22**, e2e sign-off reopen | Journey: **0 blockers** on sign-off; CMMS mig **22** | ☐ |
| 2 | [WI-OI-120bj](WI-OI-120bj.md) AR zero-mock | AR invoice page + test | Deploy web; no fake verify button | ☐ |
| 3 | [WI-OI-120bk](WI-OI-120bk.md) unit scope | R5 gate + journey N/S | Journey: North tech ≠ South WO | ☐ |
| 4 | [WI-OI-120ag](WI-OI-120ag.md) record routes guard | guard + spec | Same release as CMMS windows | ☐ |
| 5 | [WI-OI-120be](WI-OI-120be.md) W1-A + W1-B | requests, scope, 120t windows | Journey CMMS blockers clear; scope enforced | ☐ |

**One deploy gate:** backup → images for release tag → `deploy-uat.sh --deploy` → `run-uat-walkthrough.sh --journey`.

**Not M-CM1:** `/cmms/analytics`, `/cmms/floor`, EAM depth (roadmap P4b).

**Then:** [Table 1 audit](../handoff/TABLE-1-AUDIT-PROMPT-2026-10-18.md); owner chooses **T3 (120ad)** vs audit first.
