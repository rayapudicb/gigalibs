# WI-OI-120gz: M-AR0 manifest gateway + signed BFF proxy

- **Status:** Built (2026-10-19; not on UAT)
- **Work item:** [WI-OI-120gf](WI-OI-120gf.md) — BFF boundary aligned with module SDK (replaces OIDC client-credentials proxy).

## Goal

`/api/ar/*` is driven by `spec.gateway` in `modules/accounts-receivable/module.yaml` and forwards signed platform context to `ar-api`, matching CMMS/Workforce manifest gateways.

## Done when

- [x] `module.yaml` gateway + upstream `ar` (port 3400); `pnpm modules:catalog` regenerates gateways/upstreams
- [x] `apps/workflow-platform/app/api/ar/[...path]/route.ts` uses `createSignedModuleProxy`
- [x] `module-gateway-equivalence.test.ts` proves manifest routes match the removed hand-written allow-list
- [x] `ar-gateway-boundary.test.ts` (runs when catalogue unlocks AR from CONTAINED)

## Evidence

- Vitest: `apps/workflow-platform/__tests__/module-gateway-equivalence.test.ts` (AR corpus)
- Compose: `AR_PLATFORM_CONTEXT_*` on web + `ar-api` (from WI-OI-120gy)
