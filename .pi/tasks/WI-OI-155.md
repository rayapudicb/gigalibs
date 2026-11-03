# WI-OI-155: Universal import and export kit

- **Status:** Approved (owner, 2026-11-03, execution plan approval). Phase 1; starts after milestone A.
- **Work item:** WI-OI-155. Evidence goes in `.pi/work/WI-OI-155.md`.
- **Size:** L. **Plan:** §6; analysis §3.4, §6.1 (M4).

## Goal

Any master can be loaded from a spreadsheet — with a template, a preview, an error file and a safe re-run — using the same
rules as the form, so a new workspace brings its customers, vendors, items, opening stock, chart and people in minutes.

## Scope

- **May change:** a new package (`packages/import-kit/`) modelled on the CMMS engine; record controller hooks in
  `packages/module-sdk`; an import wizard in `packages/configuration-react`; `importable` masters in manifests;
  additive per-module external reference tables; the hub's Import column; tests.
- **Must not change:** the CMMS engine itself — copy its design, do not move or edit it. Never, on any card:
  - the CMMS import/export files (`modules/physical-operations-cmms/apps/api/src/import-export/`);
  - another agent's work (uncommitted files in `~/dev/gigalibs`, other branches);
  - secrets;
  - the web on port 5180 (UAT is production and read-only to agents).

## Read first

`modules/physical-operations-cmms/apps/api/src/import-export/` (read only: stream reader, column registry, alias
resolver, fk and hierarchy resolvers, row validator, batch writer, jobs); `packages/module-sdk/src/record-dispatcher.ts`;
the Products preview/commit import; the `*_reference_mappings` tables in Products and Inventory.

## Steps

1. Package: streaming XLSX and CSV read and write, column registry from the window dictionary (labels, aliases,
   remembered aliases per workspace), preview, commit as a background job, downloadable error file.
2. Every row goes through window validation and the record dispatcher (no direct SQL), one idempotency key per row;
   references resolved by code through lookups; parent codes through a hierarchy resolver.
3. External references `(source system, external key) → id` per module for upserts.
4. Template download per master: headers, a help row, one example row, value lists.
5. First masters: customers and vendors, warehouses and locations, products and units, opening stock (as adjustment
   documents), chart of accounts, opening balances (as a journal), people, price lists. Export with the same columns.

## Done when

- [ ] Each first master imports 10,000 rows on the test stack with preview and error file; a re-run changes nothing
- [ ] An imported row obeys the same rules and permissions as the form (tests prove a refused form value is refused)
- [ ] Journey "import 500 customers" ≤ 2 minutes
- [ ] `pnpm verify` passes; `audit:layers` classifies every new model, `audit:design-tokens` and `audit:ui-shell` pass
- [ ] Evidence is recorded in `.pi/work/WI-OI-155.md`, and `.pi/NOW.md` is updated

## Stop and ask if

- a decision is needed that ADR-0037–0040, the execution plan or the owner has not settled;
- a step would change a running service, the UAT database or the owner's data;
- a master can only be created by bypassing a business rule, or the posting of opening balances is unclear.

## Report

At most five bullets: what changed, the evidence, what is next, and what the owner must decide.
