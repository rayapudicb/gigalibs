# WI-OI-154: Governed master data packs — country and industry, in the owner's order

- **Status:** Approved (owner, 2026-11-03, execution plan approval). Phase 1; starts after WI-OI-153 slice B.
- **Work item:** WI-OI-154. Evidence goes in `.pi/work/WI-OI-154.md`.
- **Size:** L, one slice per country after the format slice. **Decisions:** ADR-0038 §2–5. **Plan:** §4, §5.

## Goal

Choosing a country and an industry gives a workspace its statutory and typical masters — chart of accounts, fiscal year,
tax codes, payment terms, holidays, units, categories, absence types, asset classes — editable, versioned and audited,
with every country working from the baseline. Order: India, Japan, USA, Middle East (UAE, Saudi Arabia), Europe (EU, UK),
China, Russia, Africa (South Africa, Nigeria, Kenya).

## Scope

- **May change:** `solutions/packs/**`; `packages/contracts/src/configuration/packs.ts` (additive; version 2 packs stay
  valid); `apps/playground-api/src/kernel-worker/pack-sections.ts`, `kernel-pack-applications.service.ts`; pack-apply
  handlers in Products, General ledger, Workforce, CMMS, Tax (applied when Tax is enabled); the starter buttons in
  `modules/financial-operations/web/src/FinancialOperationsWorkspace.tsx` (`STARTER_CHART`),
  `modules/physical-operations-cmms/web/src/components/CmmsWindow.tsx` and `modules/gigaops/web/src/WorkforceWorkspace.tsx`
  (`STARTERS`); the hub's Pack column (WI-OI-152); tests.
- **Must not change:** rows a workspace has edited (re-apply skips them). Never, on any card:
  - the CMMS import/export files (`modules/physical-operations-cmms/apps/api/src/import-export/`);
  - another agent's work (uncommitted files in `~/dev/gigalibs`, other branches);
  - secrets;
  - the web on port 5180 (UAT is production and read-only to agents).

## Read first

ADR-0038; plan §4–5; `solutions/packs/country/in.yaml`; `packages/contracts/src/configuration/packs.ts`;
`apps/playground-api/src/kernel-worker/pack-sections.ts` and `module-call.job.ts`.

## Steps

1. Format: module sections for `product-catalogue` (units, categories), `financial-operations` (chart template,
   account mapping, fiscal year and periods), `gigaops` (absence types, holidays; rules kept), `physical-operations-cmms`
   (asset classes, work order types), `tax-configuration` (tax types, codes, rates with valid-from, registration
   formats), plus provenance (`source`, `sourceDate`, `reviewedBy`) on statutory entries.
2. Handlers apply a section through the record dispatcher (the form's rules), idempotently; created rows carry the pack
   key and version; a re-apply skips edited rows and reports counts.
3. A generic baseline pack for any country (generic chart, standard units, "Set up your tax").
4. India and the manufacturing industry pack first (milestone B), then one slice per country in the order above.
5. Starter buttons become "Load from pack" (falling back to the baseline); the hub shows pack status and "Update
   available"; applying an update only adds.

## Done when

- [ ] A new India manufacturing workspace has units, categories, chart, fiscal year, absence types and asset classes after
      its modules are enabled (tax codes once Tax is enabled); a re-apply creates no duplicates; edited rows are untouched
- [ ] Every statutory entry names its source and date; each country's reviewer is named before that pack is On UAT
- [ ] No starter set remains hard-coded in a screen
- [ ] `pnpm verify` passes; `audit:layers` classifies every new model, `audit:design-tokens` and `audit:ui-shell` pass
- [ ] Evidence is recorded in `.pi/work/WI-OI-154.md`, and `.pi/NOW.md` is updated

## Stop and ask if

- a decision is needed that ADR-0037–0040, the execution plan or the owner has not settled;
- a step would change a running service, the UAT database or the owner's data;
- a rate or rule cannot be taken from an official source, or no reviewer is available for a country.

## Report

At most five bullets: what changed, the evidence, what is next, and what the owner must decide.
