# WI-OI-120ha: AR metadata windows (invoices + customers)

- **Status:** Built (2026-10-19; not on UAT)
- **Work item:** [WI-OI-120gf](WI-OI-120gf.md) — Table 1 row 8 (metadata windows).

## Goal

Suite `/ar` renders dictionary-driven invoice and customer windows with record routes on `ar-api`.

## Done when

- [x] `dictionary/windows.mjs` → `ar-invoices`, `ar-customers` baselines
- [x] Migration **000016** `record_idempotency` + compose mig **16**
- [x] `spec.gateway.records: true` + BFF allow-list regen
- [x] `ar-record-adapters.ts` + mapping tests
- [x] Workflow `AccountsReceivableMetadataWorkspace` on `/ar`

## Evidence

- `node scripts/generate-windows.mjs accounts-receivable --check`
- `pnpm modules:catalog`
- `vitest` `ar-record-adapters.test.ts`
