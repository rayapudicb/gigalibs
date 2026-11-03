# WI-OI-158: Classic masters — payment terms, partner groups, tax categories and codes, carriers, discounts, document types

- **Status:** Proposed — approved in the execution plan (owner, 2026-11-03); confirm this card with the owner before it starts. Phase 2; built with WI-OI-159, content from WI-OI-154.
- **Work item:** WI-OI-158. Evidence goes in `.pi/work/WI-OI-158.md`.
- **Size:** L, one slice per master. **Plan:** §6; analysis §3.7, §6.1 (M7).

## Goal

The masters every ERP user expects exist and drive documents: terms, groups, tax codes on lines, carriers, discounts and
numbered document types.

## Scope

- **May change:** new entities declared with `defineEntity` in their owning modules (Orders and Procurement for payment
  terms; Business partners for partner groups; Tax for categories and codes; Inventory for carriers and shipping methods;
  Products for discount schemes; the kernel numbering in `packages/contracts/src/numbering` for document types); document
  windows gaining the pickers; pack sections; hub entries; tests.
- **Must not change:** stored payment days on existing documents (the term links next to them). Never, on any card:
  - the CMMS import/export files (`modules/physical-operations-cmms/apps/api/src/import-export/`);
  - another agent's work (uncommitted files in `~/dev/gigalibs`, other branches);
  - secrets;
  - the web on port 5180 (UAT is production and read-only to agents).

## Read first

ADR-0040; analysis §3.7; `packages/contracts/src/numbering`; the Orders and Procurement document windows.

## Steps

1. Payment terms (net days, discount days and rate, end of month) linked from customers, vendors and documents.
2. Partner groups with defaults (terms, price list, accounts).
3. Tax categories on products and tax codes on document lines (with Tax enabled).
4. Carriers and shipping methods; discount schemes; document types with numbering series per document.
5. Country and industry pack content for each (WI-OI-154).

## Done when

- [ ] Each master is created, picked on its documents, imported (WI-OI-155) and listed in the hub
- [ ] `pnpm verify` passes; `audit:layers` classifies every new model, `audit:design-tokens` and `audit:ui-shell` pass
- [ ] Evidence is recorded in `.pi/work/WI-OI-158.md`, and `.pi/NOW.md` is updated

## Stop and ask if

- a decision is needed that ADR-0037–0040, the execution plan or the owner has not settled;
- a step would change a running service, the UAT database or the owner's data;
- a master changes how a document posts to the ledger.

## Report

At most five bullets: what changed, the evidence, what is next, and what the owner must decide.
