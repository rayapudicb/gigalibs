# WI-OI-120gd: CMMS Phase 1 journey 0 blockers on local compose

- **Status:** Proposed (owner dev rhythm 2026-10-19: execute without re-approval)
- **Work item:** WI-OI-120 (Table 1 row 23 / M-CM1). Evidence in `.pi/work/WI-OI-120.md` and `.pi/work/TABLE-1-AUDIT-2026-10-19.md`.
- **Size:** S

## Goal

The tenant-to-value journey completes CMMS (sign-off + North ≠ South) with **0 blockers** against local `http://127.0.0.1:5180`.

## Scope

- **May change:** `e2e/specs/journey-tenant-to-value.spec.ts`, `.pi` evidence only if journey still fails.
- **Must not change:** CMMS import/export files; UAT deploy scripts; production data.

## Done when

- [ ] `bash e2e/run-uat-walkthrough.sh --journey` → 0 blockers; run id recorded in `.pi/NOW.md`
- [ ] [PHASE-1-CM1-CHECKLIST.md](PHASE-1-CM1-CHECKLIST.md) row 1 evidence updated (owner **Done** tick still owner)

## Stop and ask if

- Blockers remain after `f56ae886` and point to product auth/BFF (not journey).
