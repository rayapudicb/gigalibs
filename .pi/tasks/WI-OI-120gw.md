# WI-OI-120gw: M-AR0 E1 — AR API clean-checkout build

- **Status:** Built (2026-10-19; not on UAT)
- **Work item:** Unblocks [WI-OI-120gf](WI-OI-120gf.md) (full M-AR0 compose + module SDK).
- **Size:** S

## Goal

`@gigalibs/ar-api` compiles and tests pass on a clean tree without excluding it from root `pnpm build`.

## Done when

- [x] `@gigalibs/custom-fields-nest` and `@gigalibs/forms-engine-nest` build; stubs replaced with real exports
- [x] Root `package.json` build includes `@gigalibs/ar-api`
- [x] `pnpm --filter @gigalibs/ar-api test` — 83 tests pass
- [x] Compose docker workspace lists AR API + helper packages (image wiring remains 120gf)
