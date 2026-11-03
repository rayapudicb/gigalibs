# ADR-0038: Platform reference data, country baseline and country/industry packs

- **Status:** Accepted by the owner, 2026-11-03 (decision 4 of the analysis §9; country order set by the owner).
  Independent Architecture review pending.
- **Date:** 2026-11-03
- **Work items:** WI-OI-153 (reference data), WI-OI-154 (packs)
- **Builds on:** WI-OI-120av platform reference store; WI-OI-107 packs (ADR-0016 F10).

## Context

- A checksummed platform reference store exists (`packages/contracts/src/platform-reference`, ICU/CLDR builder, loader,
  read API) but holds 0 entries on UAT and nothing reads it; currency fields are free text.
- Packs (10 industry, 6 country) configure only Workforce and Geospatial; starter data such as the General ledger
  chart is hard-coded in screens; 1 of 366 UAT workspaces has any units.

## Decision

1. **Platform reference data** is loaded once for the platform, versioned and checksummed, read-only to workspaces and
   never copied, with one exception: units of measure, which modules reference by id, are materialized per workspace
   as read-only `PLATFORM_REFERENCE` rows with deterministic ids when first needed. Sets: countries (ISO 3166-1),
   regions (ISO 3166-2), currencies with minor units (ISO 4217), languages and locales with date, number and address
   formats (ISO 639 / CLDR), time zones (IANA), units and standard conversions (UN/ECE Rec 20 / CLDR), tax
   jurisdictions (structure only), trade terms (ICC Incoterms 2020), dialling codes (ITU E.164). Exchange rates are not
   reference data (ADR-0037).
2. **Country baseline for any country:** from the reference data alone a workspace gets currency, language, time zone,
   formats, week start, measurement system, a generic chart template and a "set up your tax" step — so every country
   works, with or without a pack.
3. **Country packs** add statutory specifics: tax types, codes and rates, tax registration formats, national chart
   template and account defaults, fiscal year and periods, payment terms, work week, weekend and public holidays,
   statutory numbering rules, Workforce rules. **Order:** India, Japan, USA, Middle East (UAE and Saudi Arabia first),
   Europe (EU and UK), China, Russia, Africa (South Africa, Nigeria, Kenya first). Each pack is reviewed by someone who
   knows that country before a customer goes live there; packs are configuration, not legal or tax advice.
4. **Industry packs** add typical units, product categories, asset classes, work order types, absence types,
   certifications, place types and vocabulary.
5. **Application:** the country (required) and industry (optional) are chosen when a workspace is created; when a
   module is enabled, the kernel pack-apply job applies its sections idempotently and records the pack and version
   applied. Pack data becomes the workspace's own (editable). A new pack version is **offered**, not forced: it adds
   new entries and never overwrites ones the workspace edited.

## Consequences

- Hard-coded starter sets in screens move into packs (the screen button becomes "Load from pack").
- Pack masters for modules that are still contained (Tax) are applied when the module is enabled.
- Reference set loads are platform-operator actions on UAT and production.

## Alternatives considered

- Copying all reference data into every workspace (iDempiere Client 0 → client copy): rejected — duplication and drift.
- Per-module country lists: rejected — the reason the reference store was built.
