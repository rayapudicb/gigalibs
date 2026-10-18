# WI-OI-120fw (F2.7): Isolated HTTP Inventory→Finance relay certification

- **Status:** Done in git (`1fadfa4`; owner, 2026-10-18)
- **Work item:** WI-OI-120 (F2 / ADR-0033 D3). Evidence in `.pi/work/WI-OI-120.md`.
- **Size:** M

## Goal

On an isolated PostgreSQL database and the real module host, completing a goods receipt delivers
`inventory.receipt.completed.v1` to Finance, posts journals, balances reconciliation, and shows POSTED on the receipt.

## Scope

- **May change:** `scripts/verify-inventory-finance-relay-http.mjs`, `scripts/verify.mjs` entry.
- **Must not change:** Relay envelope or UAT data.

## Done when

- [x] Proof script migrates Catalogue + Inventory + Finance, configures relay keys, completes a receipt.
- [x] Asserts outbox PUBLISHED, inbox PROCESSED, reconciliation balanced, receipt finance-posting-status POSTED.
- [x] Listed in `pnpm verify` (NOT RUN without `PROOF_DATABASE_URL`).
