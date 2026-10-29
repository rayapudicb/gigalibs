# Phase 1 CMMS exit (M-CM1) — single acceptance checklist

Owner batch review (2026-10-18 baseline on UAT: **`1d8d2634`**, CMMS mig **22**). **Group 1 deploy (2026-10-29):** cut
release from current dev (**`29aab729`** on `feat/gigaops-convergence-core`) → CMMS mig **24**, journey **`jsjmyx`**
(0 CMMS blockers in git). Runbook: [GROUP-1-CMMS-M-CM1-DEPLOY-2026-10-29.md](../handoff/GROUP-1-CMMS-M-CM1-DEPLOY-2026-10-29.md).

| # | Card | Built in git | UAT / journey evidence | Owner Done |
|---|------|--------------|------------------------|------------|
| 1 | [WI-OI-120bi](WI-OI-120bi.md) sign-off | mig **24**, sign-off + **`9eb14717`** | Journey **`jsjmyx`**: **0 CMMS blockers** in git; UAT needs deploy + re-run | ☐ |
| 2 | [WI-OI-120bj](WI-OI-120bj.md) AR zero-mock | AR invoice page + test | Deploy web; no fake verify button | ☐ |
| 3 | [WI-OI-120bk](WI-OI-120bk.md) unit scope | R5 gate + journey N/S | Journey: North tech ≠ South WO | ☐ |
| 4 | [WI-OI-120ag](WI-OI-120ag.md) record routes guard | guard + spec | Same release as CMMS windows | ☐ |
| 5 | [WI-OI-120be](WI-OI-120be.md) W1-A + W1-B | requests, scope, 120t windows | Journey CMMS blockers clear; scope enforced | ☐ |

**One deploy gate:** backup → images for release tag → `deploy-uat.sh --deploy` → `run-uat-walkthrough.sh --journey`.

**Not M-CM1:** `/cmms/analytics`, `/cmms/floor`, EAM depth (roadmap P4b).

**Then:** [Table 1 audit](../handoff/TABLE-1-AUDIT-PROMPT-2026-10-18.md); owner chooses **T3 (120ad)** vs audit first.
