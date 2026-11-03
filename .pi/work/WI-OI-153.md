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

## Decision needed for A2 (recommendation)

Add two data packages to the builder only (not to any runtime): `cldr-json` subdivision names (Unicode licence) for
regions and tax jurisdictions, and `libphonenumber-js` metadata (MIT) for dialling codes; take first day of the week
and formats from `Intl`; write Incoterms 2020 as a reviewed list citing ICC. The generated files stay checksummed.

## Owner action (with the deploy that carries this card)

Run the load command once in the api container with the owner's database connection; it prints each set's version.
