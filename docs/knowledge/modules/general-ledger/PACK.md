# General ledger (record to report): knowledge pack

- **Kept by:** `gl_record_to_report_lead`
- **Status:** Seed (2026-10-19, WI-OI-120bl). Sections 2–5 and 7 are not yet researched. Section 6 is verified
  against the repo.
- **Last reviewed:** 2026-10-19, card WI-OI-120bl

## 1. What it is for

Books the accountant trusts:
- every operational document posts complete, balanced and immutable entries in the right period;
- the close is controlled;
- statements drill down to the source document.

## 2. How the business works

Not yet researched:
- chart of accounts and accounting schema;
- journals (manual, recurring, reversing);
- the posting from each document type;
- periods (open, soft-close, closed);
- close tasks;
- reversals instead of deletes;
- statements;
- audit.

## 3. Rules and calculations

Not yet researched. The invariants to prove, with `financial_mathematics_specialist`:
- debits equal credits per document and per period;
- no posting into a closed period;
- a reversal mirrors its original exactly;
- sub-ledgers reconcile to control accounts.

## 4. Best in class

Not yet researched. Start from BENCHMARKS.md (general ledger row): SAP S/4HANA, Oracle NetSuite, Microsoft
Dynamics 365, Sage Intacct, Xero/QuickBooks.

## 5. Standards and regulation

Not yet researched. IFRS, US GAAP, Ind AS (through `accounting_standards_specialist`); SAF-T and XBRL where
required.

## 6. GigaLibs today (verified 2026-10-19)

- **Module:** `modules/financial-operations`: 5 metadata windows (accounts, books, journal drafts, journals,
  periods); 11 migrations in the repo.
- **The Table 2 posting work** (WI-OI-120fl–120gb, 2026-10-18):
  - inventory receipts post to the ledger through `packages/posting-rules` and a relay;
  - period locks guard receipt completion;
  - the period close is blocked when posting reconciliation has gaps.
- **Its status:**
  - built in git, and its tests passed (2026-10-18);
  - **not on UAT**;
  - no independent Security review recorded;
  - the accounting sign-off (F2.9) is pending;
  - `pnpm verify --audits` found three defects: Inventory's Docker workspace dependencies, Finance writing
    Inventory's schema, and a stale window.

  This pack's first task is the functional review of its posting rules, with `finance_controls_reviewer`.
- **Reference only (GPL v2, never copied):**
  - iDempiere `org.adempiere.base/src/org/compiere/model/MFactAcct.java`, `MJournal.java`, `MJournalBatch.java`,
    `MPeriod.java`, `MPeriodControl.java`, `MAcctSchema.java`, `MElementValue.java`;
  - posting per document in `org.idempiere.acct/src/org/idempiere/acct/doc/` (`Doc.java`, `Fact.java`, and 20
    `Doc_*.java`, for example `Doc_InOut`, `Doc_Invoice`, `Doc_MatchInv`).

## 7. Fit and gaps

Not yet researched.

## 8. Open questions

- Which accounting framework does the first finance customer report under: IFRS, Ind AS or US GAAP?
- Who is the named accountant for F2.9?

## Sources

- [1] The repository at commit `15199507` (2026-10-19); `.pi/org/ORGANIZATION.md`;
  `.pi/handoff/HANDOFF-2026-10-18-CURSOR.md` §3.3.
