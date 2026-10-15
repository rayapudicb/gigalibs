# WI-OI-120at: Retire the Master Data Hub prototype

- **Status:** Carded (owner, 2026-10-15: decision 0.7g "retire it", then "proceed" on the two-level master data
  structure). Shown to the owner before it starts.
- **Plan v3:** step 0.8 (follow-through of 0.7g, WI-OI-120ar S4).
- **Work item:** WI-OI-120. Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** S to M.

## Why

- **What it is:** Master Data Hub (`master-data`, route `/platform-admin/master-data`) is a prototype, CONTAINED since
  WI-OI-102f. It kept customers, vendors, accounts, cost centres, signers, currencies, payment terms, countries,
  jurisdictions and classifications **only in the web server's memory**, filled at start-up with invented seed
  records ("DEV SEED ONLY … fictional"). Nothing it held was ever saved, so retiring it loses no data.
- **What replaces it:** each kind of record has one owner (ADR-0016; owner, 2026-10-15):

  | Records | Owner |
  | --- | --- |
  | Customers, vendors, signers | Parties (`/parties`) |
  | Cost centres | Organization (Settings) |
  | Accounts | Finance |
  | Categories | Catalogue |
  | Currencies, countries, jurisdictions | Platform reference data (WI-OI-120av), then M-CUR and M-TAX |
  | Payment terms | T4 and M-ORD |

  One "Master data" menu leads to all of them (WI-OI-120au).

## Design

1. **Read-only first:**
   - which UAT roles, members or custom roles hold a `master-data` permission code;
   - which workspaces have the `master-data` feature or entitlement.

   The codes leave the permission catalogue only after nothing on UAT holds them, or with an owner-run, backed-up
   step that removes them.
2. **Remove:**
   - the pages (`app/(app)/master-data`, `app/(app)/platform-admin/master-data`);
   - the API route (`app/api/master-data`);
   - `MasterDataStudioWorkbench`, `master-data-store.ts` (the in-memory store) and `master-data-catalog.ts` (the
     seed);
   - their tests;
   - `scripts/verify-workflows-connectors-masterdata.mjs`, the master-data part only, if the rest is still used;
   - the catalogue entry in `platform/core.yaml`, then the generated catalogue and navigation regenerated;
   - its links in Platform Control Tower;
   - its baseline entries (runtime data, design tokens).
3. **The shared picker:** `MasterDataSelect` is used by the locked AR and E-Signature workbenches. It is replaced
   there by the Parties lookup where a party is meant, or the field is dropped from those locked prototypes.
4. **Contracts:** `packages/contracts/src/master-data` keeps only what another package uses (the import templates
   are checked); the rest goes, with their invented sample people.
5. **Not changed:** the deployed migrations, and `scripts/uat/wi-oi-120al` (an applied, historical script).

## Done when

- [ ] Nothing in the product, catalogue or menus offers Master Data Hub; no in-memory master data or seed remains.
- [ ] No role on UAT is left holding a removed permission code (or the owner-run step removed them).
- [ ] The zero-mock audit's baseline loses its master-data entries; all audits, type-checks and tests pass.
- [ ] Released, Security-reviewed, deployed by the owner; journey rerun.
