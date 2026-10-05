# WI-OI-120g (U7): Product Catalogue on metadata windows

- **Status:** Approved (owner, 2026-10-05). In progress.
- **Work item:** WI-OI-120 (U7 in `remediation-backlog.md`; `MODULE_ACTION_OUTCOMES.md` §2, Product Catalogue).
  Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** L

## Goal

The Catalogue's screens become metadata windows over its existing API, the second module after Inventory (F0.5).
A tester can do all of the following on screen, with every record saved, audited and tenant-scoped:
- define units and conversions;
- define categories and attributes;
- create, edit, archive and restore products;
- build a catalogue version and take it through draft, submit, approve (a second person) and publish;
- build a price list version with prices and take it through draft, submit, approve (a second person) and activate;
- resolve a price for a product, date and currency.

## Scope

- **May change:**
  - `modules/product-catalogue`: record adapters over `CatalogueService`, actions, lookups, window files in
    `dictionary/`, the web page, migrations only if a list or command is missing;
  - the generated catalogue;
  - `e2e/specs`;
  - proof scripts.
- **Must not change:**
  - other modules' code;
  - applied migrations;
  - running services (the owner deploys).

  Never, on any card:
  - the CMMS import/export files;
  - another agent's work;
  - secrets;
  - the web on port 5180.

## Read first

- `MODULE_ACTION_OUTCOMES.md` §0 (rules) and §2 (Product Catalogue).
- `modules/product-catalogue/apps/api/src/catalogue/catalogue.controller.ts` and `catalogue.service.ts`.
- F0.5's Inventory adapters and windows, as the pattern.

## Steps

1. **Record adapters** over `CatalogueService`, using the same contract schemas and permissions as the Catalogue's
   own routes:
   - units and unit conversions;
   - categories;
   - attributes;
   - products;
   - catalogues with their versions and entries;
   - price lists with their versions and prices.

   Paged, tenant-bound reads are added where only a full list exists today.
2. **Actions**, as registered commands, each visible only in the right state:
   - products: archive and restore;
   - catalogue versions: submit, approve and publish;
   - price-list versions: submit, approve and activate.

   Approve keeps the existing maker-checker rule: the maker cannot approve their own version.
3. **Lookups:** categories and units, and the existing products lookup, for pickers.
4. **Windows:** units with a Conversions child tab, categories, attributes, products, catalogues with a
   Versions → Entries tab, and price lists with a Versions → Prices tab. They compile with no findings under the
   publish-time checks.
5. **The Catalogue page:**
   - tabs of metadata windows;
   - a price resolver;
   - import/export kept as a specialised component inside the governed screen.

   The constant built-in dictionary and its silent fallback are removed.
6. **Proof:**
   - an HTTP proof through the real module host on an isolated database, including maker-checker refusal and a price
     resolving to exactly one answer;
   - a Playwright business flow that enters the Catalogue's UAT data.

## Done when

- [ ] Every action listed in the Goal works on screen and survives a reload; approvals need a second user.
- [ ] Negative tests:
  - [ ] another tenant's record answers 404;
  - [ ] a stale `If-Match` answers 412;
  - [ ] a repeated `Idempotency-Key` returns the first answer;
  - [ ] a maker approving their own version is refused;
  - [ ] a field without permission is refused.
- [ ] No constant manifest, fallback or hard-coded figure remains on the Catalogue page.
- [ ] `pnpm build`, `pnpm test` and `pnpm verify` pass.
- [ ] Evidence is recorded; `NOW.md` and the status board are updated; images are built and handed to the owner for
      deploy.

## Needs from the owner

- **Two UAT logins** for the Playwright flow: an administrator (`E2E_UAT_ADMIN_EMAIL`/`PASSWORD`) and a second user
  holding the approver roles (`E2E_UAT_APPROVER_EMAIL`/`PASSWORD`), because maker-checker refuses self-approval.

## Stop and ask if

- a step would change a running service, the database or the owner's data;
- the Catalogue API lacks a command an action needs and adding it changes its contract;
- an approval rule in the spec differs from the code.
