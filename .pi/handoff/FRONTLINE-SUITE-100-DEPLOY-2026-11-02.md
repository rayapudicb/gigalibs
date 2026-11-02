# Frontline Mobile Suite — module-gate 100% deploy handoff (11 products)

**Date:** 2026-11-02. **Branch:** `feat/frontline-suite` (`gigalibs-rounds`). **Mobile:** `gigalibs_mobile` `main` (commits through WI-OI-143 mobile fix).

**Scope:** WI-OI-133 … WI-OI-143 (**Built** in registry). **WI-OI-144 M-CHAT parked** (not in this batch).

## What “100%” means here

| Layer | Status |
|-------|--------|
| **Module gate (agent)** | **11/11 Built** — code, migrations, web, BFF, mobile features, `pnpm verify` PASS on platform (2026-11-02). |
| **Done (owner)** | UAT journey + acceptance per product on release worktree; device proofs where listed in each `.pi/work/WI-OI-NNN.md`. |

Tracker: [FRONTLINE-SUITE-100-CHECKLIST.md](../work/FRONTLINE-SUITE-100-CHECKLIST.md).

## Platform commits (reference)

- Rounds Built gate: `6a6892c7`
- Contractor core: `1db87eee`; contractor mig 4 + Built: `62b580b3`
- CMMS / Workforce / Safety Operations frontline slices: see git log on `feat/frontline-suite`

## Mobile commits (reference)

- Through `3a0a3d2` (contractor types/screens); prior feature commits per WI-OI-134–143.

## Owner deploy sequence (release worktree only)

1. **Release worktree** from `feat/frontline-suite`; run `gigalibs_require_release_worktree` scripts only from there.
2. **Credentials** (once per stack refresh): generate module env files for hosted modules not yet on UAT, including:
   - `generate-generated-module-credentials.sh operator-rounds`
   - `generate-generated-module-credentials.sh safety-operations`
   - Existing Table-1 module credential scripts as in [compose-modules-local.sh](../../infra/compose/scripts/compose-modules-local.sh).
3. **Build images:** `module-host`, `web`, `api` (playground BFF), `kernel-worker`, **CMMS**, **Workforce** (frontline extensions).
4. **Migrations:** `infra/compose/scripts/up-convergence-full-uat.sh` (includes `operator-rounds-migrations`, **`safety-operations-migrations`**, CMMS/Workforce pins through mig 33+).
5. **Entitlements:** `node infra/compose/scripts/seed-uat-module-entitlements.mjs` (or module-specific seed) for `operator-rounds`, `physical-operations-cmms` capabilities, **safety-operations**, Workforce logbook.
6. **Mobile:** build operations app against UAT BFF; exercise each `/mobile/v1` grant (rounds, calibration, … contractor).
7. **Journeys:** per-product runbooks under `docs/runbooks/` and `.pi/work/WI-OI-133.md` … `WI-OI-143.md`.

## Post-deploy conformance (optional but recommended)

From dev worktree with Docker test stack rebuilt to current HEAD:

```bash
pnpm module:conformance operator-rounds --live --record   # needs .env.test.module.operator-rounds
pnpm module:conformance safety-operations --live --record
```

Raises catalogue readiness from PLANNED where recorded.

## Mobile CI evidence (2026-11-02)

- `pnpm test`: **1978** tests, **159** files PASS
- `pnpm typecheck`: PASS (after contractor fix)
- Run `pnpm lint`, `pnpm validate:profiles`, `pnpm validate:architecture` before tagging mobile release.

## Known deferred (not blocking Built)

- Physical device: NFC/barcode/photo/QR, offline journals on device, voice, OCR/GPS
- WI-OI-144 work-order chat
- Live conformance JSON files (stack identity + module env keys)
- Security review items called out on WI-OI-140, 142, 143
