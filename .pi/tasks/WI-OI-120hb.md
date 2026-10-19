# WI-OI-120hb: AR canonical ModuleDatabase runtime

- **Status:** Built (2026-10-19; git `83099e7b`; not on UAT)
- **Work item:** [WI-OI-120gf](WI-OI-120gf.md) — module SDK database boundary (ADR-0013 / WI-OI-082).

## Goal

`ar-api` uses `ModuleDatabase` for tenant transactions (search_path + `app.tenant_id`) and migration contract checks, matching Orders/Finance.

## Done when

- [x] `DatabaseService extends ModuleDatabase` with schema `gigalibs_ar`, mig **16** contract
- [x] Record idempotency uses SDK store without extra search_path shim
- [x] `@gigalibs/module-sdk` exposes `getPool()` for forms-engine integration
- [x] `@gigalibs/ar-api` build passes
