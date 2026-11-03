# WI-OI-153: Platform reference data loaded and used; the workspace profile chosen by country

- **Status:** Approved (owner, 2026-11-03, execution plan approval). Phase 0; can start now.
- **Work item:** WI-OI-153. Evidence goes in `.pi/work/WI-OI-153.md`.
- **Size:** L, in three slices (A sets and pickers, B workspace profile, C platform units).
  **Decisions:** ADR-0038 §1–2, §5. **Plan:** §2, §3, §4.1, §5.

## Goal

Every workspace uses international reference data — countries, regions, currencies, languages and formats, time zones,
units, tax jurisdictions, trade terms, dialling codes — and a new workspace gets its currency, language, time zone and
formats from the country chosen at creation, for any country.

## Scope

- **May change:** `packages/contracts/src/platform-reference/`, `scripts/build-platform-reference-data.mjs`,
  `apps/playground-api/src/platform-reference.*`; a kernel migration in `packages/db` for the workspace profile;
  `CreateTenantSchema` (additive) in `packages/contracts/src/tenancy/index.ts`, `packages/tenancy-nest/src/`;
  `PlatformTenantControl.tsx`, `TenantLocalizationSettings.tsx`, the set-up guide (`packages/contracts/src/setup`);
  shared reference lookups for windows (`packages/configuration-react`, `packages/module-sdk`); Products unit handling
  for platform units; tests.
- **Must not change:** stored values of existing currency fields (they stay ISO codes). Never, on any card:
  - the CMMS import/export files (`modules/physical-operations-cmms/apps/api/src/import-export/`);
  - another agent's work (uncommitted files in `~/dev/gigalibs`, other branches);
  - secrets;
  - the web on port 5180 (UAT is production and read-only to agents).

## Read first

ADR-0038; analysis §3.2; `packages/contracts/src/platform-reference/index.ts` (six set keys today);
`apps/playground-api/src/platform-reference.service.ts` (`loadGeneratedSet`); `TenantLocalizationSettings.tsx` (time zone
and currency are never saved; the language is saved per user); `modules/product-catalogue/db/migrations/000001_*`
(units are referenced by `(tenant_id, id)` foreign keys).

## Steps

1. **A — sets.** Extend the builder: regions (ISO 3166-2), locale formats, unit conversions and dialling codes (CLDR),
   trade terms (Incoterms 2020, a reviewed list with its source) — as new sets or payload fields; checksums as today.
2. A platform-operator load command (idempotent by checksum; a new version per load; old versions kept). The owner runs
   it on UAT.
3. Shared lookups `platform-countries`, `platform-currencies`, `platform-languages`, `platform-time-zones`,
   `platform-units`; money currency fields in windows become pickers over currencies (value unchanged).
4. **B — workspace profile.** Kernel table (RLS): country, industry, base currency, locale, time zone, week start,
   measurement system, fiscal year start month. `CreateTenantSchema` gains optional `countryCode`, `industryKey`,
   `baseCurrency`, `defaultLocale`, `timeZone` (required by the create screen, pre-filled from the country).
   `GET|PUT /tenants/current/profile` (`tenant:read` / `tenant:update`); Settings › Localization saves it; the set-up
   guide shows "Confirm your country and industry" to workspaces without a profile; money fields default to the base
   currency.
5. **C — platform units.** When Products is enabled, platform units are written into `uom_definitions` as read-only
   `PLATFORM_REFERENCE` rows with deterministic ids (uuid v5 of tenant and code), next to the workspace's own units.

## Done when

- [ ] Every set is loaded on the test stack with its checksum; pickers show reference entries
- [ ] A new workspace with country India gets INR (2 decimals), Asia/Kolkata and en-IN; Japan gets JPY (0 decimals)
- [ ] An existing workspace sees the confirm step and receives nothing until it confirms
- [ ] Platform units appear read-only next to custom units and work on products and stock
- [ ] `pnpm verify` passes; `audit:layers` classifies every new model, `audit:design-tokens` and `audit:ui-shell` pass
- [ ] Evidence is recorded in `.pi/work/WI-OI-153.md`, and `.pi/NOW.md` is updated

## Stop and ask if

- a decision is needed that ADR-0037–0040, the execution plan or the owner has not settled;
- a step would change a running service, the UAT database or the owner's data;
- a set's source or licence is unclear, or an existing stored value would have to change.

## Report

At most five bullets: what changed, the evidence, what is next, and what the owner must decide.
