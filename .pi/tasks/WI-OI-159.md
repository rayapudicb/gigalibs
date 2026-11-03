# WI-OI-159: Model-first entities and a service factory in the module SDK

- **Status:** Proposed — approved in the execution plan (owner, 2026-11-03); confirm this card with the owner before it starts. Phase 2; the design may start during phase 1, building after milestone B.
- **Work item:** WI-OI-159. Evidence goes in `.pi/work/WI-OI-159.md`.
- **Size:** L. **Decisions:** ADR-0040.

## Goal

A master is declared once — fields, rules, ownership, labels — and its migration, contract, adapter, lookup, window
fields, events and replica consumer are generated, with every GigaLibs safety rule still applied.

## Scope

- **May change:** new `packages/module-sdk/src/entity/` (`defineEntity`, field builders, `moduleRecords`); generators
  and an `entities:generate` script with `--check` added to `pnpm verify`; the pilot entities (Products units and
  categories, CMMS classifications, Workforce absence types); a developer guide; tests.
- **Must not change:** domain services with business logic (posting, costing, allocation); any module not in the pilot.
  Never, on any card:
  - the CMMS import/export files (`modules/physical-operations-cmms/apps/api/src/import-export/`);
  - another agent's work (uncommitted files in `~/dev/gigalibs`, other branches);
  - secrets;
  - the web on port 5180 (UAT is production and read-only to agents).

## Read first

ADR-0040; analysis §4–6.2; `packages/module-sdk/src/record-dispatcher.ts`, `record-controller.ts`; a hand-written
adapter (`orders-record-adapters.ts`) and its window dictionary; the S16 audits.

## Steps

1. Design note and API: field types (text, long text, number with scale, money with currency, integer, yes/no, date,
   date-time, value list, reference, extension), constraints, ownership, lifecycle, labels and help.
2. Generators: additive migration diff (refuses drops and renames), Zod contract, record adapter, lookup, window
   baselines, entity events, replica consumer for `reference()`; `--check` verifies committed output.
3. `moduleRecords` runs generated adapters through the record dispatcher (field policy, permissions, defaults,
   idempotency, versions, audit).
4. Pilot: regenerate the four pilot entities with unchanged behaviour — their existing tests pass untouched.

## Done when

- [ ] The pilot entities run on generated code; existing tests, S16 audits and proof harnesses pass
- [ ] Generator tests cover every field type and every refusal; hand-written lines removed are reported
- [ ] `pnpm verify` passes; `audit:layers` classifies every new model, `audit:design-tokens` and `audit:ui-shell` pass
- [ ] Evidence is recorded in `.pi/work/WI-OI-159.md`, and `.pi/NOW.md` is updated

## Stop and ask if

- a decision is needed that ADR-0037–0040, the execution plan or the owner has not settled;
- a step would change a running service, the UAT database or the owner's data;
- generated behaviour differs from the hand-written one in any test.

## Report

At most five bullets: what changed, the evidence, what is next, and what the owner must decide.
