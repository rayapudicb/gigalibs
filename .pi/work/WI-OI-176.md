# WI-OI-176 evidence — reference data viewer, operator load, hub access

## Built (2026-11-04, Cursor)

**Viewer (workspace members, `tenant:read`):**
- Routes `/master-data/reference/{COUNTRIES|CURRENCIES|LANGUAGES|TIME_ZONES}` with search, entry detail, provenance banner.
- BFF `GET /api/control/v1/platform-reference/{setKey}` (session-bound; proxies control plane lookup).
- Master data registry routes updated via `platform/core.yaml`; `pnpm modules:catalog`.

**Operator (platform roles):**
- `/platform-admin/reference` — list versions per set, load generated data with audited reason.
- BFF `GET /api/control/v1/platform-reference/versions`, `POST .../{setKey}/load` (control canonical root).
- Control plane `GET /api/v1/platform-reference/versions`, `POST .../:setKey/load-generated` (operator assignment required).

**Hub "No access" / state:**
- `PLATFORM_REFERENCE` masters visible with `tenant:read` without requiring Settings module open (ADR-0038).
- Module masters: count skipped with `module-not-open` before calling APIs; labels distinguish module off vs no access vs not answering.

## Verification

- `pnpm exec vitest run apps/workflow-platform/__tests__/master-data.test.ts apps/playground-api/src/platform-reference.service.spec.ts` — pass
- `pnpm exec next build` in `apps/workflow-platform` — pass
- Full `pnpm verify` — PASS (2026-11-04) after test/manifest/token fixes and mobile BFF catalogue scan exclusion (WI-OI-164)

## Owner / UAT (not Done)

- [ ] Member opens Countries from Master data → India read-only with currency and calling code (after reference load on UAT)
- [ ] Platform operator loads a set from `/platform-admin/reference`; workspace admin cannot
- [ ] Login that previously saw misleading "No access" shows correct state on hub
