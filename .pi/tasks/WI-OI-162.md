# WI-OI-162: Simple metadata UI and "Additional details" on every record

- **Status:** Proposed — approved in the execution plan (owner, 2026-11-03); confirm this card with the owner before it starts. Phase 3, low priority (owner); needs WI-OI-159 and WI-OI-155.
- **Work item:** WI-OI-162. Evidence goes in `.pi/work/WI-OI-162.md`.
- **Size:** L. **Plan:** §6; analysis §6.3.

## Goal

A workspace administrator adds a field to a master in under a minute — label, type, help, required — reviews it and sees
it live without a deploy, in three plain screens.

## Scope

- **May change:** a simplified designer in `apps/workflow-platform` and `packages/configuration-react` over the existing
  governed dictionary (maker-checker kept); one SDK-standard extension column with conversions for `custom_extensions`,
  `metadata` and `custom_fields`; an "Additional details" section in `MetadataWindow`; extension fields in import and
  export; tests.
- **Must not change:** canonical fields, permissions or posting rules (tenants never change them). Never, on any card:
  - the CMMS import/export files (`modules/physical-operations-cmms/apps/api/src/import-export/`);
  - another agent's work (uncommitted files in `~/dev/gigalibs`, other branches);
  - secrets;
  - the web on port 5180 (UAT is production and read-only to agents).

## Read first

Analysis §6.3; the Configuration Studio components and `packages/custom-fields-nest`; `MetadataWindow.tsx`.

## Steps

1. Screen 1 Data model (entities with counts); screen 2 Entity (fields table, inline edit, "Add field" drawer with eight
   types, drag to order); screen 3 Preview and publish (live preview, "Submit for review", status pill and history).
2. Extension column unified with conversions; values shown under "Additional details" on every record.
3. Import and export include extension fields.

## Done when

- [ ] An administrator adds, reviews and activates a field in under a minute (journey)
- [ ] Canonical fields cannot be changed (tests)
- [ ] `pnpm verify` passes; `audit:layers` classifies every new model, `audit:design-tokens` and `audit:ui-shell` pass
- [ ] Evidence is recorded in `.pi/work/WI-OI-162.md`, and `.pi/NOW.md` is updated

## Stop and ask if

- a decision is needed that ADR-0037–0040, the execution plan or the owner has not settled;
- a step would change a running service, the UAT database or the owner's data;
- the simplified flow would weaken maker-checker.

## Report

At most five bullets: what changed, the evidence, what is next, and what the owner must decide.
