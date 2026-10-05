# WI-OI-120f (F0): metadata-governed windows, proven on Inventory

- **Status:** Approved (owner, 2026-10-05). F0.1 committed; in progress: F0.2.
- **Owner decisions (2026-10-05):**
  - A module's baseline dictionary activates automatically when the module is enabled for a tenant; a tenant's own
    published version stays in force, and customised tenants are told to review baseline changes.
  - The Inventory screen's hard-coded figures and simulated results are removed (git keeps the history); the barcode
    resolver is kept inside the governed screen.
- **Work item:** WI-OI-120 (F0 in `remediation-backlog.md`; design `ADR-0033` D1). Evidence goes in
  `.pi/work/WI-OI-120.md`.
- **Size:** XL. Delivered in five slices, each committed on the owner's "commit".

## Goal

In the owner's words: "every screen should be metadata foundation driven", with real business outcomes instead of
hard-coded UI.
- A module's screens become windows drawn from its published Application Dictionary: a grid of records, a form,
  child tabs, lookups and action buttons.
- Every row comes from the module's API, and every button calls a real domain command.
- Inventory is the first module rebuilt this way. A tester can create a warehouse, its locations, an item and a
  receipt, complete the receipt and see the stock balance, all saved and audited.

## Scope

- **May change:**
  - dictionary contracts and compiler (`packages/contracts/src/configuration`, `packages/configuration-core`);
  - the renderer (`packages/configuration-react`);
  - the module SDK (record dispatcher);
  - Configuration Studio publishing in the control plane (module baselines);
  - the BFF signed proxies;
  - Inventory (`modules/universal-inventory`: dictionary contribution, adapters, missing list routes, web page);
  - Playwright flows; tests.
- **Must not change:**
  - other modules' screens (their own cards follow);
  - applied migrations (forward only);
  - running services (the owner deploys).

  Never, on any card:
  - the CMMS import/export files;
  - another agent's work;
  - secrets;
  - the web on port 5180.

## Read first

- `ADR-0033` D1.
- Metadata investigation M-01, M-02, M-03 and §3.3.
- `MODULE_ACTION_OUTCOMES.md`, Inventory section.
- `packages/contracts/src/configuration/dictionary.ts`.
- `configuration-studio.service.ts` (`currentRuntimeManifest`, `filterDictionaryManifest`).

## Steps

The contract already declares views, list mode, tabs with parent relationships, conditional rules, resolver lookups,
search, filter, sort and actions. Nothing executes them yet (M-01). This card makes them execute; it does not create
a second model.

1. **F0.1 Contract and compiler.**
   - Add exact decimals: a `scale` on number and currency fields; values travel as decimal strings, never floats.
   - At publish time, the compiler rejects any capability the renderer cannot execute (an explicit capability
     list), instead of ignoring it silently.
   - Unknown rule leaves fail closed.
2. **F0.2 Module contributions and publication.**
   - Each module ships its dictionary as versioned files in `modules/<module>/dictionary/`, checked by
     `pnpm modules:catalog` and `pnpm verify`.
   - When a tenant has the module enabled, the control plane publishes and activates that baseline for the tenant,
     audited as the system actor. Tenants extend it through Configuration Studio within the existing limits.
   - A screen loads only its published manifest. Constant manifests inside screens are removed, with no silent
     fallback: a missing manifest is a visible error.
3. **F0.3 Record dispatcher on the module SDK.** The routes:
   - `GET` and `POST /v1/records/{entity}`;
   - `GET` and `PATCH /v1/records/{entity}/{id}`;
   - `POST /v1/records/{entity}/{id}/actions/{action}`;
   - `GET /v1/lookups/{resolver}`.

   Each route goes only to a typed adapter that the module registers and that calls its existing domain service
   (tenet 11). The dispatcher enforces:
   - tenant and organization scope from the signed context, and object authorization;
   - field permissions: unreadable fields are removed, and unwritable ones are refused;
   - server paging, search, filter and sort, on declared fields only;
   - `If-Match` and `Idempotency-Key`.

   The BFF proxies allow these routes per module.
4. **F0.4 Renderer: one `MetadataWindow`.**
   - The window has:
     - a grid with server paging, search, filter and sort;
     - forms with sections;
     - parent-child tabs bound to records;
     - lookups;
     - show, read-only and required rules;
     - action buttons with confirmation.
   - Every state is handled: loading, empty, error, forbidden, missing manifest, and conflict (409/412).
   - The renderer denies by default, uses the design standard's tokens, and has no business data of its own.
5. **F0.5 Proof on Inventory.**
   - Inventory's contribution covers:
     - Warehouses, with a Locations child tab;
     - Items;
     - Lots;
     - Receipts, with lines and a Complete action;
     - Balances (read only);
     - Stock ledger (read only).
   - Adapters call the existing Inventory services. List routes are added where they are missing (items, lots).
   - The Inventory page shows only metadata windows, plus the barcode resolver as a component inside the governed
     screen. Hard-coded figures and simulated results are removed.
   - A Playwright flow enters the UAT data through the screens.

## Done when

- [ ] A tester on the UAT instance can, on screen, create a warehouse with locations, an item and a receipt, complete
      the receipt, and see the balance and ledger entry. Each record survives a reload and appears in the audit.
- [ ] The Playwright business flow does the same and is the source of Inventory's UAT data. No SQL seeding.
- [ ] Negative tests:
  - [ ] another tenant's record answers 404;
  - [ ] a field without read permission is absent from the API response;
  - [ ] a write to a field without permission is refused;
  - [ ] a stale `If-Match` answers 412;
  - [ ] a repeated `Idempotency-Key` returns the first result;
  - [ ] an unsupported capability is refused at publish.
- [ ] No constant manifest or hard-coded business figure remains on the Inventory page.
- [ ] `pnpm build`, `pnpm test` and `pnpm verify` pass; the design-token check passes for the new files.
- [ ] Evidence in `.pi/work/WI-OI-120.md`; `NOW.md` and `uat-module-status.md` are updated; images are built and handed
      to the owner for deploy.

## After F0: the order for the five modules

Each item is its own card, shown to the owner before it starts:
1. **F1:** the document lifecycle (complete, void, reverse, period and approval guards).
2. **F2:** the event relay and the Finance posting consumer.
3. **U8:** the rest of Inventory.
4. **U7:** Catalogue.
5. **U9:** Procurement.
6. **U10:** Orders.
7. **U12–U18:** Finance (GL, treasury, fixed assets, consolidation, costing, budgeting, close).
8. **U22:** procure-to-pay and order-to-cash journeys.

## Stop and ask if

- a step would change a running service, the database or the owner's data;
- a contract change would break published tenant manifests (they must keep working, or be migrated forward);
- the module baseline activation conflicts with a tenant's own published version.
