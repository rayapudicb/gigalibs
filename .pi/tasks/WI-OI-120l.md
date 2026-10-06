# WI-OI-120l (U12): General ledger on metadata windows (record to report)

- **Status:** Approved (owner, 2026-10-06; Option A, draft journals with two-person approval). In progress.
- **Work item:** WI-OI-120 (U12 in `remediation-backlog.md`; `MODULE_ACTION_OUTCOMES.md` §2, Finance GL). Evidence
  goes in `.pi/work/WI-OI-120.md`.
- **Size:** L

## Goal

A tester runs the general ledger on screen, with every record saved, audited and tenant-scoped:
- set up a book with a standard chart of accounts and a fiscal year of monthly periods;
- maintain accounts;
- open and close periods;
- enter a manual journal as a draft, add its lines, and submit it. A second person approves it, and only then is it
  posted;
- reverse a posted journal with a reason;
- read the trial balance, income statement and balance sheet from posted entries only.

## Design

- **Draft journals (Option A).** A forward migration, `000009_finance_journal_drafts`, adds `gl_journal_drafts` and
  `gl_journal_draft_lines`, with forced row-level security and tenant policies as in 000008. No applied migration
  changes.
  - **States:** DRAFT → SUBMITTED → APPROVED (posted) or back to DRAFT (rejected, with a reason).
  - **Maker-checker:** whoever submitted a draft cannot approve it.
  - **Submit:** needs at least two lines, debits equal to credits, and an open period.
  - **Approve:** posts through the existing `postJournal` in the same transaction, with the draft as its source
    document, so a retried approval posts once. The draft records the posted journal.
- **Record adapters** over `FinanceService`:
  - books;
  - accounts;
  - fiscal periods, with open and close actions;
  - posted journals (read-only) with their lines, and a reverse action;
  - journal drafts with their lines, and submit, approve and reject actions.
- **Lookups:** books, accounts, open periods.
- **Windows:** books, chart of accounts, fiscal periods, journal drafts with lines, and posted journals with lines.
- **Page:**
  - tabs of windows;
  - a reports panel: trial balance, income statement, balance sheet, by book and date;
  - a set-up panel that creates a standard fiscal year for a book.
- **Gateway:** `spec.gateway.records: true` for financial-operations.

## Proof

- An HTTP proof through the real module host on an isolated database. It covers:
  - book and standard year;
  - accounts;
  - a draft with lines; an unbalanced submit is refused;
  - submit; the maker's own approval is refused; a second person approves and the journal is posted once;
  - reversal;
  - the trial balance, which balances;
  - a closed period refuses posting;
  - another tenant sees nothing.
- **Playwright on UAT:** set up the book and year; enter and approve a month of sample journals (opening balances,
  sales, purchases, payroll, depreciation); check the reports.

## Done when

- [ ] Every action in the Goal works on screen and survives a reload; approval needs a second user.
- [x] Negative tests (HTTP proof 25/25):
  - [x] unbalanced;
  - [x] closed period;
  - [x] maker approval;
  - [x] stale version (412);
  - [x] another tenant (404);
  - [x] missing permission.
- [x] `pnpm build`, `pnpm test` and `pnpm verify` pass; the proof passes on an isolated database (25/25).
- [ ] Evidence recorded; images built and handed to the owner.

## Stop and ask if

- a needed command changes an existing Finance contract;
- the chart-of-accounts or period rules in the code differ from the spec.
