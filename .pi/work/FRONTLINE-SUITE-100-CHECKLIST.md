# Frontline Mobile Suite — 100% completion checklist (12 products)

**Branch:** `feat/frontline-suite` (worktree `/Users/rayapudi/dev/gigalibs-rounds`). **Mobile repo:** `/Users/rayapudi/dev/gigalibs_mobile`.  
**Owner intent (2026-11-02):** All twelve products complete (web + admin + BFF + mobile + DB), single deploy; no mocks.

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

| # | Product | WI | Platform commit | Mobile feature | Open to 100% |
|---|---------|-----|-----------------|----------------|--------------|
| 1 | M-RND Rounds | 133 | Yes | `mobile-feature-operator-rounds` | **Built** — owner UAT journey, physical device proof, live conformance `--record` on rebuilt module-host |
| 2 | M-CAL | 134 | Yes | `mobile-feature-calibration` | Offline journal, e-sign, device |
| 3 | M-TAG | 135 | Yes | `mobile-feature-commissioning` | OCR/GPS device proof |
| 4 | M-BOM Spares | 136 | Yes | `mobile-feature-spares` | Large media, offline |
| 5 | M-LOG | 137 | Yes | `mobile-feature-logbook` | Voice/step-up |
| 6 | M-SOP | 138 | Yes | `mobile-feature-sop` | Offline execution, rich media |
| 7 | M-DVIR | 139 | Yes | `mobile-feature-fleet` | Credential interlock, offline |
| 8 | M-REQ | 140 | Yes | `mobile-feature-requests` | Comms notify, edge throttle |
| 9 | M-INC | 141 | Yes | `mobile-feature-safety` | Module deploy proof, CMMS relay |
| 10 | M-LOTO | 142 | Yes | `mobile-feature-permits` | Offline, security review |
| 11 | M-CONTR | 143 | Yes | `mobile-feature-contractor` | **Built** — commit mobile tree, PG proof, device QR, owner UAT |
| 12 | M-CHAT | 144 | **Not started** | **Missing** | Full build (PTT deferred) |

## Shared platform blockers (fix once for all)

1. Four pre-existing `pnpm verify` test failures (control-plane env, project-operations migration expectation, signed-context synthetic worst case).
2. Signed-context catalogue growth (WI-OI-134 platform decision / auth-core ADR).
3. Compose: module-host image, migration pins, entitlements for all new modules (Safety Operations, Operator Rounds, CMMS mig bumps).
4. Single release worktree merge: `feat/frontline-suite` → owner deploy script.

## Handshake pattern (repeat per product)

```
gigalibs_mobile (UI) → POST /mobile/v1/... → playground-api BFF
  → signed platform context → module-host API → PostgreSQL (owner schema)
```

Contracts live in `packages/contracts/src/{frontline,cmms,workforce,mobile}/…`; BFF map in `apps/workflow-platform/lib/mobile-bff.ts`.
