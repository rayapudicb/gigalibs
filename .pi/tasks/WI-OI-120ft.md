# WI-OI-120ft (F2.4): Inventory receipt journal tie-out and reconciliation API

- **Status:** Done in git (`631c4c7`; owner, 2026-10-18). UAT deploy + migration 10 still open.
- **Work item:** WI-OI-120 (F2 / ADR-0033 D3). Evidence in `.pi/work/WI-OI-120.md`.
- **Size:** M

## Goal

After Inventory receipt inbox processing, Finance records each receipt line's source-document key and links the posted
GL journal; tenant admins can read inbox + journal gaps via `GET v1/subledger/inventory/posting-reconciliation`.

## Scope

- **May change:** Finance migration 000010, subledger register, inbox apply hook, read API, tests.
- **Must not change:** Inventory module receipt completion.

## Done when

- [x] Migration `000010_finance_subledger_posting_register` with RLS.
- [x] Inbox apply writes register rows; reconciliation lists `journal_id IS NULL` gaps.
- [x] Authenticated GET reconciliation endpoint (`finance:read`).
- [x] Finance API unit tests pass; bump module migration version to 10.
