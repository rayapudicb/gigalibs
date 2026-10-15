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
