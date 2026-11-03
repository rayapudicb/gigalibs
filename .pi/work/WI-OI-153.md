# WI-OI-153 evidence — Platform reference data loaded and used; the workspace profile

## 2026-11-03 — slice A, part 1 (queue item 2, claimed by Claude)

Findings before building:
- Generated, checksummed data exists for five sets (currencies, time zones, countries, languages, units of measure;
  `packages/contracts/src/platform-reference/data.generated.ts`); TAX_JURISDICTIONS has none.
- The read API exists and is public (`GET /api/v1/platform-reference/:setKey`); loading had no route or command,
  and loading the same data twice made a new version each time.
- The card's new sets need data the runtime's `Intl` does not carry: country subdivisions (ISO 3166-2, for regions
  and tax jurisdictions) and dialling codes (E.164). Formats and first day of the week can come from `Intl`;
  Incoterms 2020 is a reviewed list of 11 terms.

Slice A is therefore split: **A1** load command and pickers over the five generated sets; **A2** the new sets, which
need a data-source decision (below).

Built so far (A1, part 1):
- `PlatformReferenceService.loadGeneratedSet` is idempotent by checksum: the same data again returns `unchanged`
  and writes nothing; new data is a new version, the old one kept and retired, audited (test added).
- Load command `apps/playground-api/src/platform-reference-load.ts` (`node dist/platform-reference-load.js
  --operator <email> --reason "<why>" [--set <SET>]`): only an active platform operator; all loadable sets by
  default; one line per set (loaded or unchanged). It writes as the table owner, so on UAT the owner runs it.

## A1, part 2 — pickers over reference data (built)

- Platform lookups `platform-countries`, `platform-currencies`, `platform-languages`, `platform-time-zones`
  (`packages/contracts/src/configuration/platform-lookups.ts`, `PLATFORM_REFERENCE_LOOKUP_SETS`), answered by the
  control lookups route from the public reference read; options are code and name; ids may hold `/` and `+` (time
  zones); an unloaded set answers an empty list. Tests in `platform-lookup-route.test.ts`.
- Currency pickers: Orders (quotes, sales orders, credit memos), Procurement (requisitions, purchase orders, vendor
  bills, debit memos), price lists and accounting books — `currency-code` is a reference over `platform-currencies`;
  the stored value stays the ISO code and the default stays USD until the workspace profile (slice B). Products and
  Finance screens now send platform lookups to the control plane. Not changed: read-only currency fields, and CMMS,
  which keeps its own currency value list on parts, PM and assets (to be moved in one step later).
- Master data hub: the Reference data group lists Countries, Currencies, Languages and Time zones (platform
  reference level); they show "Empty" until the operator loads the sets.

## Verification (A1)

`pnpm verify` PASS (2026-11-03, all steps). The Finance picker-coverage test now skips platform lookups (answered by
the control plane). The compiled reference service and controller load under Node with their injection metadata; the
load command prints its usage and exits 2 on a bad argument, without touching the database.

## Order from here

Slice B (workspace profile: country, industry, currency, language, time zone — kernel table, create screen,
Settings › Localization saving, "Confirm your country" step) is next; A2 waits for the data-source decision below;
C (platform units) after B.

## Slice B — the workspace profile (built, part 1)

Finding: every workspace already has versioned settings with `localization.defaultLocale`, `defaultCurrency`,
`timezone` and `dateFormat` (`tenant_settings`, `GET|PATCH /api/v1/settings`, settings:read / settings:update). The
gap was the screen, which never read or saved them. So the profile is an additive extension — no new table, no
migration, no change to existing workspaces' data.

- `@gigalibs/platform-settings`: optional `countryCode`, `industryKey`, `weekStart`, `fiscalYearStartMonth`; an
  update must name a real currency, time zone and country (ICU, the same source as the reference sets; time zones
  are checked by formatting, so IANA aliases such as Asia/Kolkata and UTC are accepted while the generated list holds
  ICU's canonical Asia/Calcutta); a workspace saved before the profile still reads. `createDefaults(tenantId,
  profile)` and `profileProblem(profile)`.
- Workspace creation (self-service trial and platform operator): `profile` (country, industry, language, currency,
  time zone, week start, fiscal year start) on `CreateTenantSchema` and `PlatformCreateTenantSchema`; an unusable
  profile is refused before anything is written; the profile replaces the matching defaults.
- Platform Control Tower › create workspace: Country and Base currency (the time zone follows a single-zone
  country); the profile is sent only when chosen.
- Settings › General & localization: reads and saves the workspace's own settings (country, language, time zone,
  base currency, first day of the week, fiscal year start) with the version it read; a clash says so; choosing a
  country suggests its time zone and week; design tokens throughout (the old screen kept time zone and currency in
  memory and saved the language for the signed-in person only).
- Set-up guide: a required "Confirm your country" step after "Name your company", done when the settings hold a
  country (existing workspaces see it as their next step).

Tests: platform-settings (profile rules, defaults, problems), Localization save request and country suggestions,
create request with and without a profile, set-up progress with the new step.

Slice B part 1 committed in 2d283447.

## Slice B, part 2 — documents start in the workspace currency (built)

- Dictionary default token `WORKSPACE_CURRENCY` (`DICTIONARY_EXECUTABLE_CAPABILITIES.defaultTokens`; fills text,
  reference and list fields); `resolveDefault` gives it when the caller knows the currency, nothing otherwise.
- Member-readable workspace profile `GET /api/v1/tenants/current/profile` (users:read, which every member holds;
  country, currency, language, time zone, week start, fiscal year start — no secrets).
- Forms read it once per page (`useWorkspaceDefaults`, `@gigalibs/configuration-react`) and fill a
  workspace-currency field when it arrives, unless the person has already filled it; without the profile they keep
  their fixed defaults, and the Orders and Procurement adapters still fall back to USD when no currency is sent.
- Quotes, sales orders, credit memos, requisitions, purchase orders, vendor bills and debit memos default to the
  workspace currency instead of USD.

Tests: the token on the server and in the window model, the profile loader (once per page; refusal and failure).

## Decision needed for A2 (recommendation)

Add two data packages to the builder only (not to any runtime): `cldr-json` subdivision names (Unicode licence) for
regions and tax jurisdictions, and `libphonenumber-js` metadata (MIT) for dialling codes; take first day of the week
and formats from `Intl`; write Incoterms 2020 as a reviewed list citing ICC. The generated files stay checksummed.

## Owner action (with the deploy that carries this card)

Run the load command once in the api container with the owner's database connection; it prints each set's version.
