# WI-OI-120bf: Fix CMMS window entitlement key (asset-maintenance)

- **Status:** On UAT (deployed 2026-10-17 as `fd63d9305247-647b8a1f19e5`)
- **Work item:** WI-OI-120 (Phase 1, W1-A follow-up). Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** S (small targeted fix)

## Goal

Resolve the `403 Forbidden` ("The requested runtime scope is not available") on `/api/control/configuration/runtime/manifest/current` for CMMS windows by aligning the window adapter's `entitlementModuleKey` with the canonical catalog key `asset-maintenance` (rather than the internal directory name `physical-operations-cmms`), allowing the technician and supervisor to access CMMS windows and clearing the journey's 2 blockers.

## Context & Finding (Journey `bzutxs`)

W1-A release `1bb0193` deployed successfully with CMMS at migration 20 and healthy relays. However, journey `bzutxs` failed on:
- `The technician raises a request`: 403 on `GET /api/control/configuration/runtime/manifest/current`
- Cause: `ModuleWindowConfigurationAdapterV1` sets `entitlementModuleKey: definition.moduleKey` (`'physical-operations-cmms'`). But the tenant entitlement stored in `tenant_module_entitlements` and defined in `catalog.generated.ts` is `'asset-maintenance'`.
- Result: Control plane checks `requireEntitlement(tenantId, 'physical-operations-cmms')`, finds no entitlement, and throws 403. The window displays "No access" instead of the request form.

## Scope

- **May change:**
  - `apps/playground-api/src/module-window-configuration.adapter.ts`: map module key to canonical entitlement key.
  - `apps/playground-api/src/module-window-baselines.service.ts`: apply baselines matching canonical entitlement key.
  - `apps/playground-api/src/configuration-studio.service.ts`: resolve scope using descriptor entitlement key.
  - `apps/playground-api/src/module-window-baselines.spec.ts`: test proving `asset-maintenance` entitlement grants CMMS windows.
- **Must not change:**
  - Deployed migration 20 (frozen);
  - Other sessions' files (`maps/page.tsx`, `AuthAtmosphere.tsx`, `OmnichannelSoftphoneDrawer.tsx`, etc.);
  - Secrets.

## Steps

1. In `apps/playground-api/src/module-window-configuration.adapter.ts`, map `definition.moduleKey` to its canonical entitlement key (`'physical-operations-cmms'` $\rightarrow$ `'asset-maintenance'`).
2. Update `module-window-baselines.service.ts` to activate CMMS windows for tenants entitled to `asset-maintenance`.
3. Update `configuration-studio.service.ts` to resolve scope using `descriptor.entitlementModuleKey`.
4. Add unit tests in `module-window-baselines.spec.ts` confirming that a tenant with `asset-maintenance` entitlement successfully loads `cmms-requests` and `cmms-classifications` window manifests.
5. Run local verification: `pnpm --filter @gigalibs/app-playground-api test`.
6. Independent Security review of the patch.
7. Release, backup, and deploy to UAT; rerun journey test to verify the 2 blockers clear.

## Verification & Deployment Evidence

- **Tests:** `pnpm --filter @gigalibs/app-playground-api test` passed: 31 test files passed, 168 tests passed, 0 failed.
- **Audits:** `scripts/module-manifests.mjs` passed (0 errors); `scripts/verify-migration-pins.mjs` passed (pins agree for 5 modules); `pnpm audit:api-boundary` and `pnpm audit:package-dependencies` passed.
- **Security Review:**
  - Scope & authorization: Entitlement mapping strictly adheres to the canonical catalog (`asset-maintenance`). User read/write permissions (`cmms:read`, `configuration-runtime:read`) remain enforced.
  - Tenancy isolation: Preserved.
  - Verdict: Approved without conditions.
- **UAT Deployment:**
  - Patch commit `fd63d93` on `release/wi120u-workforce`.
  - Deployed as `fd63d9305247-647b8a1f19e5` with backup `gigalibs_backup_20261017_093504Z`.
  - All 11 containers healthy, all 6 outbox relays running and ok.
- **Journey `cac8tz` Outcome:**
  - Total findings: 56 (down from 57 in `bzutxs`).
  - `The technician raises a request`: **CLEARED / DONE** (403 manifest error eliminated).
  - Remaining blocker: `The supervisor reviews and closes the work order` (CMMS work order status lifecycle and action alignment).

## Done when

- [x] `ModuleWindowConfigurationAdapterV1` resolves `entitlementModuleKey: 'asset-maintenance'` for CMMS windows.
- [x] Playground-API tests pass.
- [x] Deployed to UAT (`fd63d9305247-647b8a1f19e5`).
- [x] Journey test confirms the technician can raise a request without 403 error.
