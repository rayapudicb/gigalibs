# Frontline Mobile Suite — 100% completion checklist (12 products)

**Branch:** `feat/frontline-suite` (worktree `/Users/rayapudi/dev/gigalibs-rounds`). **Mobile repo:** `/Users/rayapudi/dev/gigalibs_mobile`.  
**Owner intent (2026-11-02):** All twelve products complete (web + admin + BFF + mobile + DB), single deploy; no mocks.

## Suite summary (2026-11-02)

| Metric | Value |
|--------|--------|
| **Module gate (Built)** | **11 / 11** in scope (WI-OI-133 … WI-OI-143) |
| **Parked** | WI-OI-144 M-CHAT |
| **Platform verify** | PASS (`/tmp/verify-143.log`, post `62b580b3`) |
| **Mobile tests** | 1978 passed (159 files) |
| **Owner deploy handoff** | [FRONTLINE-SUITE-100-DEPLOY-2026-11-02.md](../handoff/FRONTLINE-SUITE-100-DEPLOY-2026-11-02.md) |

**Done (UAT accepted)** remains **0 / 11** until owner records acceptance after release-worktree deploy.

## Definition of 100% (per product)

Each WI-OI-133 … WI-OI-144 card must satisfy AGENTS.md module gate:

| Area | Requirement |
|------|-------------|
| **Contracts** | Versioned types in `@gigalibs/contracts`; mobile mirror in `gigalibs_mobile` |
| **Database** | Forward migrations, forced RLS, real PostgreSQL tests |
| **Module API** | Authoritative writes only in owner schema |
| **Web admin** | Session-permission gated; uses module API |
| **Mobile BFF** | `/mobile/v1` → signed module context; allowlisted routes |
| **Mobile app** | Feature package + routes registered in operations app |
| **Integration** | Cross-module via outbox/relay/inbox only |
| **Verify** | `pnpm verify` with **no new** test/audit failures |
| **Mobile CI** | lint, typecheck, test, architecture profiles |
| **UAT** | Owner journey on release worktree after single deploy |

## Product status (update as evidence lands)

| # | Product | WI | Module gate | Mobile feature | Remaining to **Done** |
|---|---------|-----|-------------|----------------|------------------------|
| 1 | M-RND Rounds | 133 | **Built** | `mobile-feature-operator-rounds` | Owner UAT cert, device proof, live conformance `--record` |
| 2 | M-CAL | 134 | **Built** | `mobile-feature-calibration` | Offline journal, e-sign, device, UAT |
| 3 | M-TAG | 135 | **Built** | `mobile-feature-commissioning` | OCR/GPS device, UAT |
| 4 | M-BOM Spares | 136 | **Built** | `mobile-feature-spares` | Large media, offline, UAT |
| 5 | M-LOG | 137 | **Built** | `mobile-feature-logbook` | Voice/step-up, UAT |
| 6 | M-SOP | 138 | **Built** | `mobile-feature-sop` | Offline execution, rich media, UAT |
| 7 | M-DVIR | 139 | **Built** | `mobile-feature-fleet` | Credential interlock, offline, UAT |
| 8 | M-REQ | 140 | **Built** | `mobile-feature-requests` | Comms notify, edge throttle, Security, UAT |
| 9 | M-INC | 141 | **Built** | `mobile-feature-safety` | Deploy proof, CMMS relay live, UAT |
| 10 | M-LOTO | 142 | **Built** | `mobile-feature-permits` | Offline, Security review, UAT |
| 11 | M-CONTR | 143 | **Built** | `mobile-feature-contractor` | PG proof (opt-in), device QR, UAT |
| 12 | M-CHAT | 144 | **Parked** | — | Full build when unparked (PTT deferred) |

## Shared deploy checklist (owner, once)

1. Release worktree from `feat/frontline-suite`; rebuild **module-host**, **web**, **api**, **cmms-api**, **workforce** images.
2. Run [up-convergence-full-uat.sh](../../infra/compose/scripts/up-convergence-full-uat.sh) (includes **safety-operations** + **operator-rounds** migrations).
3. Seed entitlements for frontline catalog keys; assign tenant roles (`operator-rounds.*`, `safety-operations.*`, CMMS frontline permissions).
4. Mobile operations app → UAT BFF; smoke each feature route.
5. Record acceptance per WI in `.pi/WORK_ITEMS.md` → **Done**.

## Handshake pattern (repeat per product)

```
gigalibs_mobile (UI) → POST /mobile/v1/... → playground-api BFF
  → signed platform context → module-host API → PostgreSQL (owner schema)
```

Contracts live in `packages/contracts/src/{frontline,cmms,workforce,mobile}/…`; BFF map in `apps/workflow-platform/lib/mobile-bff.ts`.
