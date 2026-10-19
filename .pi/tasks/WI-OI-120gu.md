# WI-OI-120gu: Minimal P2P/O2C compose E2E

- **Status:** Built (2026-10-19; not on UAT)
- **Work item:** Table 1 rows 6–7 — local compose journey evidence.

## Goal

Playwright spec runs minimal P2P and O2C through the BFF (`/api/universal-procurement`, `/api/universal-orders`) and smoke-checks metadata workspaces.

## Done when

- [x] `e2e/specs/minimal-p2p-o2c-compose-flow.spec.ts`
- [x] Gateway route for `convert-to-po` in `module.yaml`
- [ ] Owner runs with stack up + `E2E_UAT_ADMIN_*` in `e2e/uat.env` (optional local evidence)

## Run

```bash
# stack up, then:
cd e2e && npx playwright test specs/minimal-p2p-o2c-compose-flow.spec.ts
```
