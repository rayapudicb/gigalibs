# WI-OI-120fv (F2.5): Finance posting status on Inventory receipts

- **Status:** Done in git (uncommitted; owner, 2026-10-18)
- **Work item:** WI-OI-120 (F2 / ADR-0033 D3). Evidence in `.pi/work/WI-OI-120.md`.
- **Size:** M

## Goal

Completed goods receipts show Finance posting state on the metadata window: awaiting posting, posted, or posting
rejected, with a rejection code when Finance refuses the inbox.

## Scope

- **May change:** Inventory migration 000005, receipt fields, Finance inbox sync, Finance GET status API, dictionary.
- **Must not change:** Receipt completion semantics or relay envelope.

## Done when

- [x] `finance-posting-status` and rejection code on receipt records (Inventory migration **5**).
- [x] Finance inbox updates Inventory when `FINANCE_INVENTORY_POSTING_DATABASE_URL` is set (module-host).
- [x] Finance `GET v1/subledger/inventory/receipts/{id}/posting-status`.
- [x] Unit tests; window dictionary + baselines regenerated.
