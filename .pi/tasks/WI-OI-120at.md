# WI-OI-120at: Retire the Master Data Hub prototype

- **Status:** Built and verified locally (2026-10-15; owner: "approved 120at and 120aw"). Release and the owner-run data
  step next.
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

## Built (2026-10-15)

- **Read-only on UAT first:**
  - no custom role and no member holds a `master-data` code;
  - 121 workspaces carry the `master-data` feature key, with 17 ENABLED and 271 DISABLED entitlement rows (handled
    after the deploy, below).
- **Removed (13 files):**
  - both pages (`/master-data`, `/platform-admin/master-data`) and the API route;
  - `MasterDataStudioWorkbench` and `MasterDataSelect`;
  - the in-memory store and the invented seed (`master-data-store.ts`, `master-data-catalog.ts`);
  - their two tests;
  - `packages/contracts/src/master-data` (used only by that route);
  - `scripts/verify-workflows-connectors-masterdata.mjs`, unreferenced, which embedded a default UAT login and
    password. That account does not exist on UAT, so the credential is dead. The same dead default is in
    `scripts/verify-charts-and-reports-browser.mjs` and `scripts/verify-intelligence-documents-browser.mjs`: a small
    follow-up.
- **Catalogue:** the `platform/core.yaml` entry is removed. The catalogue, navigation and permission catalogue are
  regenerated, which removes exactly that entry and `master-data:read`, `write` and `admin`. The base roles lose
  `master-data:*` and `master-data:read`.
- **Platform Control Tower:** the two "Master Data" links are removed.
- **Locked AR and E-Signature workbenches:**
  - AR's country and jurisdiction dropdowns came from the invented seed. They are now typed ISO country and
    jurisdiction codes, until platform reference data (WI-OI-120av) gives them lookups.
  - The `?? 'US'` and `?? 'US-CA'` fallbacks and the invented `<country>-FED` authority are gone.
  - E-Signature's "Quick Pick Master Signer" (invented people) and its "Sarah Connor" placeholder are gone; signers
    are typed, and come from Parties when E-Signature is revived.
- **Tests and baselines:**
  - the navigation-equivalence test records the removal with its reason;
  - the example codes in two contracts tests now use real codes;
  - the access tests drop `master-data`;
  - the zero-mock baseline loses its 4 master-data entries, and the design-token baseline its 2.
- **Not changed:** deployed migrations; `scripts/uat/wi-oi-120al` (applied, historical).
- **Verification:**
  - web and contracts type-checks clean;
  - whole repository: 2,961 tests passed, 223 skipped, none failed (378 files);
  - the zero-mock audit and its growth check, SDLC, package, layers, API-boundary and navigation audits pass;
  - the manifest check passes;
  - design tokens fails only on the three files other sessions own, as before.

## After the deploy (owner-run, backed up)

Remove the retired key and close its entitlements:
- `tenants.features` loses `master-data` (121 workspaces);
- its 17 ENABLED entitlement rows become DISABLED, with the reason "Module retired (WI-OI-120at)".

