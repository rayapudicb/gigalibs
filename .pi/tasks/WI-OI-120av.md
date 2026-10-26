# WI-OI-120av: Platform reference data, owned by the kernel and locked for workspaces

- **Status:** Carded (owner, 2026-10-15: "proceed" on the two-level structure). Shown to the owner before it starts.
- **Plan v3:** Phase 5A, first, before M-CUR Multi-Currency. M-TAX (5C) and T4 parties (5B) use it too.
- **Work item:** WI-OI-120. Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** M.

## Why

Some master data is the same for every workspace and comes from published standards. Today no governed, shared set
exists: each module keeps its own (for example, Catalogue's units of measure are per workspace), and the retired
Master Data Hub only invented them. The owner's decision is that platform master data is locked: workspaces use it,
and only the platform changes it.

## Scope of the first version

| Set | Source | Notes |
| --- | --- | --- |
| Countries and subdivisions | ISO 3166-1 and 3166-2 | Codes and names. |
| Currencies | ISO 4217 | Code, number, minor units. Exchange rates are not platform data: they belong to each workspace (M-CUR). |
| Units of measure | UN/ECE Recommendation 20 | Base set; a workspace may add its own units on top, never edit these. |
| Languages and time zones | ISO 639, IANA tz | |
| Tax jurisdiction codes | Country and subdivision codes | Their rates and rules stay with M-TAX. |

## Design

1. **Ownership:** the kernel owns the tables (control-plane schema, forward migration), versioned. Each set records
   its source and version and the date it was loaded. No hand-typed or invented values: zero mock, loaded from the
   published files with a checksum.
2. **Read:** a platform lookup (`PLATFORM_LOOKUPS`) serves every workspace and module, through fields and lookups.
   Workspaces cannot write: the database grants the runtime roles read only.
3. **Change:**
   - platform operators load a new version in Platform Control Tower, with a reason;
   - the change is audited and shown as a difference before it applies;
   - a code is never deleted while it is in use: it is retired, and existing records keep their value.
4. **Workspace additions** where the business needs them (for example, its own units of measure) live in the module
   that owns them, and link to the platform code they extend.
5. **Menu:** WI-OI-120au's "Platform reference" section lists these sets, read-only.

## Done when

- [ ] The five sets are loaded from their standards, with source, version and checksum; the database refuses writes
  from runtime roles.
- [ ] Workspaces read them through lookups; platform operators change them in Platform Control Tower, audited and
  never deleting a code in use.
- [ ] M-CUR and M-TAX are planned to use them, not their own lists.
- [ ] Migration rehearsal, tests, Security review, released and deployed by the owner; journey rerun.

## Progress (2026-10-26, local)

Built across commits `a43a5da0` (model + ICU currencies/time-zones), `97dcc7fe` (control-plane store + load/lookup
service + read endpoint), `fb786355` (ICU countries + languages).

- **Model + generator** (`contracts/platform-reference` + `scripts/build-platform-reference-data.mjs`): set keys, entry
  shapes, provenance (source/version/sha256/entryCount/loadedAt), read-only `PlatformReferenceSet`, load schema, the
  browser-safe `canonicalReferenceString` the checksum is taken over, and `findReferenceEntry`.
- **Four of five sets live, zero mock, zero new dependency** — all from the runtime's ICU (= Unicode CLDR), checksummed:
  CURRENCIES (162, ISO 4217 incl. minor units), TIME_ZONES (417, IANA), COUNTRIES (279, ISO 3166-1/CLDR), LANGUAGES
  (190, ISO 639-1). Names come from `Intl.DisplayNames`; code lists from ICU enumeration.
- **Store + service** (`platform_reference_versions` + `platform_reference_entries`, migration
  `20261026030000_platform_reference_data`): a version is loaded whole with its checksum re-verified, the live version
  retired (never deleted) and the new one made live; `lookup` serves the live version; read endpoint
  `GET platform-reference/:setKey` (`@Public`, non-sensitive standards). The "locked" rule is `GRANT SELECT … TO
  gigalibs_platform_reference` (per-feature role pattern); models classified in `package-layers` (audit:layers clean).
- Tests: 15 (contracts 10 + generated integrity + service 3); typecheck 22/22; lint clean.

**Remaining:**
- **UNITS_OF_MEASURE (UN/ECE Rec 20) + ISO 3166-2 subdivisions** — not in ICU/CLDR; need the official UN/ECE file. The
  service/model are set-agnostic, so the generator gains one input and they load like the rest. (TAX_JURISDICTIONS
  derives from countries + subdivisions once subdivisions land.)
- **Platform-operator LOAD endpoint** — needs platform-role gating (not wired in playground-api; load is a tested
  service method today).
- **GRANT lock verification** against the control DB, and the card's **Security review + owner deploy + journey**.
- This work is **after** the Phase-3/4 release candidate (tag `4e0a2f3653bf-…`), so it belongs to a later release.
