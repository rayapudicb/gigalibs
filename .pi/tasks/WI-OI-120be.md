# WI-OI-120be: W1 release A: CMMS unit and site access, and work orders, on UAT

- **Status:** In Progress (approved by the owner 2026-10-16: "approved 120be").
- **Plan v3:** Phase 1, W1 (steps 1.1 and 1.3; phase-1-sizing.md). It releases cards that were built and approved
  earlier but never released: WI-OI-120aa, 120ab and 120ac (R5 CMMS), 120t (M-CM1, 4 slices) and 120ag.
- **Work item:** WI-OI-120. Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** L: about 5–8 working days, one release (plus fix-ups if the reviews find any).

## What it delivers

- **The journey's last 2 blockers clear.** CMMS screens come from metadata (requests, work orders, assets, parts,
  meters, schedules, spaces, classifications), so:
  - a technician can raise a request;
  - a supervisor can review it, convert it to a work order and close that.
- **CMMS respects unit and site access (R5).** A person held to North cannot see or change South's work orders, stock,
  meters or spaces.
- **The CMMS guard checks each record route's base permission** (120ag).

## What is in the release (read-only, 2026-10-16)

Main has 79 files that UAT does not. W1 takes the CMMS ones:

- **CMMS module, 44 files:**
  - scope (`auth/scope.ts`, organization and place projections);
  - the services for parts, meters, reliability, spaces and work orders;
  - the new requests service and controller;
  - the record adapters;
  - 8 window dictionaries;
  - the web window;
  - **migration 000020**, which adds `maintenance_requests` and `request_counters`.
- **Generated catalogues and roles:**
  - in contracts, the CMMS contracts, window baselines, roles and permission catalogue;
  - in tenancy, a check that protects people who hold roles at unit or place level, plus its tests.
- **Web:** the CMMS pages, the generated gateways and navigation, and their tests.
- **The migration pin:** CMMS 19 → 20, in `compose.modules.local.yaml` and the CMMS runtime configuration.
- **Not in W1:**
  - 120ad (T3 places, step 1.2): its own release next.
  - Phase 0 leftovers already reviewed but never needed on UAT: 120aj (clean-checkout build, quarantine list) and
    120am (no fallback database address in 3 modules). They go in a small release of their own.

## Checked on UAT, read-only (2026-10-16)

- The CMMS database is at migration 19, and `maintenance_requests` does not exist, so migration 20 applies cleanly.
- All 137 active role assignments are workspace-wide (`MEMBER`). None is at unit or place level, so the new role
  safety check cannot refuse anything on this release.
- On today's main: CMMS tests 265 of 265 pass; the CMMS type-check is clean; the conversion check passes; the pins
  agree, with CMMS held at 19.

## Steps

1. **Read-only checks:**
   - what the new scope rules show to each journey persona;
   - CMMS records on UAT without a unit or site, which the rules might hide.
2. **Three independent Security reviews, in parallel and read-only:**
   - scope and authorization;
   - the record adapters, the requests service and migration 20;
   - contracts, roles and the web.
3. **Fix any finding,** then the release commit (on the owner's "commit"), build, backup, `--check`, and the owner's
   deploy.
4. **The journey:**
   - the 2 CMMS blockers should clear; its CMMS steps are adjusted if the new screens need it;
   - a North and South check is added: a technician held to North does not see South's work (step 1.1's proof).

## Rollback (corrected after review B, Medium 3)

- **The old images cannot run on a database at migration 20.** The SDK's readiness check
  (`packages/module-sdk/src/database.ts`) requires exactly the image's migration, and the runner refuses a schema newer
  than its contract. So "the old images ignore the new tables" was wrong.
- **To roll back, either:**
  - run `000020…down.sql` first, which drops the requests and their counter and removes ledger row 20 (nothing else
    references them), then deploy the previous images;
  - or restore the fresh backup taken before the deploy.
- The previous release's images are kept.

## Done when

- [ ] Released, Security-reviewed, deployed by the owner; CMMS at migration 20 on UAT.
- [ ] The journey raises, converts and closes a request with no CMMS blocker.
- [ ] The journey proves that a North technician does not see South's work.

## Step 1: read-only checks (2026-10-16)

- **What decides a person's CMMS scope** (`AuthService`, session assignments):
  - a role held workspace-wide (`MEMBER` or `WORKSPACE`) gives the whole workspace;
  - a role held at `UNITS` or `PLACES` gives only those, through the organization claim (UNITS / TENANT / DENIED) and
    the place scope.
  - On UAT all 137 active assignments are `MEMBER`, so R5 changes nothing for existing people today. It takes effect
    when a role is assigned at unit or place level, which the journey's North and South check will do.
- **CMMS records without a unit or site, on UAT:**
  - 135 work orders in all. In live (TRIAL) workspaces, 10 have neither a unit nor a site.
  - Workspace-wide people see them as before.
  - What unit- or place-limited people see is checked by review A.
- **The release file set:**
  - main's version of the CMMS module;
  - the CMMS-only generated catalogues: windows, roles, permissions, gateways and navigation, all checked to differ
    only in CMMS entries;
  - `packages/contracts/src/cmms`;
  - the 120ac block in `tenancy.service.ts` and its tests;
  - the CMMS web pages and tests, including 120aj's "under review" pins for findings W1 and W2;
  - the two CMMS scripts;
  - the lockfile's two workspace links;
  - the migration pin. On main the API already expects 20, while the job is held at 19 until the review accepts
    migration 20.
- **Three independent reviews are running**, read-only:
  - A: scope and authorization;
  - B: records, requests and migration 20, deciding 120aj's W1 and W2;
  - C: contracts, roles, web and supply chain.

## Review B (records, requests, migration 20), 2026-10-16: approve with conditions

- **Release blocker (functional):** every record list (work orders, assets, parts, requests) answers 400.
  - The adapters' `domainQuery` sends `sortDirection` (and `sortField`), plus the `type` and `category` filters.
  - The contracts' strict search schemas reject them.
  - The unit tests mock the services, so nothing caught it.
- **Medium 1:** requests ignore R5.
  - `maintenance_requests` has no `site_ref` or `department_id`, `location_id` is unvalidated, and no request query is
    scoped.
  - Fix in migration 20 before it reaches UAT: take `site_ref` and `department_id` from the asset, and scope get,
    search, triage and cancel.
- **Medium 2:** CMMS uses an in-memory idempotency store.
  - Fix: a `record_idempotency` table with `ModuleIdempotencyStore`, as Finance, Workforce and Catalogue have.
  - Meter readings: the domain key is always random.
- **Medium 3:** the rollback plan (corrected above).
- **Medium 4:** execute-own can cancel a work order. Fix: `cancel` (and `hold`) need `cmms.work-orders.write`.
- **Low:**
  1. With execute-own, labour can be logged as another worker or at any rate.
  2. The ownership check runs outside the row lock.
  3. Actions without `expectedVersion` never get 412.
- **Info:**
  - task updates answer 404;
  - there is no supervisor close step;
  - the viewer holds `cmms.requests.create`;
  - another user's request answers 403;
  - the runtime role can DELETE from the new tables;
  - the release must raise the job pin to 20;
  - `q` is limited to 100 in the schema but 200 in the dispatcher.
- **120aj W1, accepted:** the API dispatcher enforces each entity's, action's and lookup's own permission.
- **120aj W2, accepted, except staffing:** staffing goes back to `cmms.work-orders.write`.
  - Split the `module.yaml` route.
  - Accept the 5 request routes and `GET v1/meters/{id}` into the intended permissions.

## Review A (scope and authorization), 2026-10-16: block until fixed

- **H1, requests have no unit or place scope:** the same as review B's Medium 1. Get, search, reject and cancel are
  unscoped, and `canViewAll` covers technicians and viewers, so requester contact details are exposed across units.
- **H2, asset paths ignore scope.** The asset specifications (get and set), the equipment tree and cascade-status use
  the tenant and asset id only (`classifications.service.ts`), and the new `asset-specs` record adapter adds another
  route to them.
  - A planner held to North can overwrite South's specifications or cascade a status over South's tree.
  - A technician held to North can read them.
- **M1, the unit tree is never passed to `scopePredicates` or `assertWritableScope` in production.** UNITS reads use
  the raw roots, intersected with the legacy departments. So a grant on a parent unit loses its child units' records
  and is refused writes there. This fails closed. `verifyOrganizationVersion` is never called, and
  `verifyPlaceVersion` is a stub.
- **M2, reference data:** failure codes, job plans, classifications and specification definitions can be written by
  members held to units or places, without `assertWritableScope`.
- **Low:**
  1. DENIED is not checked on space and storeroom reads (defence in depth).
  2. Some id lookups answer 403 instead of 404.
  3. Counts and costs include rows out of scope.
  4. A refusal in the 120ac role check aborts the whole default-role sync, and with it the roles screen.
  5. An asset's `spaceId` is not checked for visibility.
- **Info:** the technician role loses `cmms.work-orders.write`, and acts only through the execute-own record actions.
- **Coverage confirmed:**
  - scoped: work orders and their sub-resources, parts, balances and movements, storeroom writes, meters and
    triggers, spaces and CAD, assets, preventive maintenance, analytics, and reliability's apply and attribution;
  - the rule is an intersection of units, departments and places, applied consistently.
- **Conditions:**
  1. Scope requests.
  2. Scope the asset paths, including each descendant in a cascade.
  3. Reference-data writes: workspace-wide only, or an owner decision to accept them.
  4. M1: pass the tree, or use the legacy departments when UNITS has no tree. Then check UAT read-only.
  5. Negative tests for each fix.

## Review C (contracts, roles, web, supply chain), 2026-10-16: approve with conditions

- **H1, technicians can no longer work any work order.**
  - `module.yaml` takes `cmms.work-orders.write` from the technician and gives execute-own.
  - But `/cmms/work-orders` still draws the REST screen, whose API requires write for status, tasks, labour, parts and
    notes.
  - The journey's "technician starts, logs labour, completes" steps would become 3 new blockers.
- **M1:** the in-memory idempotency store (review B, Medium 2).
- **M2:** every CMMS role reads every request, with the requester's email and phone and out-of-scope asset names
  (reviews A H1 and B M1).
- **M3:** the role changes reach a workspace only when its roles list is next opened (`syncDefaultRoles` runs from
  `listCustomRoles`). A `ROLE_SCOPE_*` refusal breaks that workspace's roles screen.
- **Low:**
  1. The gateway is wider than the API on 7 work-order paths; staffing should be write-only.
  2. The viewer gains request submission, but its description says read-only.
  3. A technician can cancel or hold, and can set the labour worker and rate.
  4. The window offers actions the server refuses: Edit on requests, Cancel on others' requests, and New and Edit on
     classifications for technicians.
  5. `verify-cmms-http.sh` still expects requests to answer 404.
- **Info:**
  - the supply chain is clean (2 workspace links only); keep the 120aj root build filter out of W1;
  - W1 is accepted;
  - both new menu entries are intended and render through `MetadataWindow`, with no hard-coded data;
  - the configuration API image must be rebuilt, which the five builds do;
  - no XSS.

## Fix plan from the three reviews (2026-10-16)

**Must fix before release:**

1. **Record lists 400 (review B):** the search contracts accept the adapters' sort and filter fields (`sortField`,
   `sortDirection`, `type`, `category`), with a test that runs an adapter against the real schema.
2. **Technician flow (review C, H1):** owner decision D1.
3. **Requests in scope (A H1, B M1, C M2):**
   - migration 20 gains `site_ref` and `department_id`, taken from the asset (and `location_id`, which nothing
     validates, is dropped);
   - get, search, triage and cancel are scoped;
   - who sees what is owner decision D2.
4. **Asset paths in scope (A H2):** specifications, the equipment tree and cascade-status use `visibleAsset` and
   `assertWritableScope`, and each descendant is checked.
5. **Reference data (A M2):** owner decision D3.
6. **Unit tree (A M1):** UNITS uses the legacy department closure, which already includes child units, when no tree is
   passed, so a parent-unit grant keeps its children. Version checks follow with T3.
7. **Durable idempotency (B M2, C M1):** a `record_idempotency` table in migration 20 and `ModuleIdempotencyStore`. A
   meter reading takes its key from the request.
8. **Work-order permissions (B M4, W2, C L1):** cancel and hold need write; staffing is write-only (split in
   `module.yaml`); the reviewed paths move from "under review" to the intended tables in the 3 web tests.
9. **Role sync (C M3, A L4):** a refused role is skipped and logged rather than failing the sync. After the deploy,
   the roles are synced in each workspace with the asset-maintenance module.
10. **Migration pin:** the job and the API both expect 20, and the hold is lifted.

**Also fixed (Low):**
- the labour worker is the caller unless they hold write, and the rate needs write;
- ownership is checked inside the row lock;
- DENIED is checked on space and storeroom reads;
- not-found answers 404;
- `spaceId` visibility is checked;
- the viewer's description;
- the window hides actions the person cannot take;
- `verify-cmms-http.sh`;
- the `q` length.

**Kept as noted (Info):**
- counts that include out-of-scope rows (A L3), for a later card;
- stale actions without `expectedVersion` (B L3);
- the runtime role's DELETE grant.

**Owner decisions:**
- **D1, the technician's work:**
  - a. Recommended: technicians keep `cmms.work-orders.write` in this release, as on UAT today, so nothing breaks.
    Narrowing technicians to their own work orders comes with the work-order window, later.
  - b. Draw `/cmms/work-orders` with the new window now.
- **D2, who sees requests:**
  - a. Recommended: planners (`cmms.requests.write`) see the requests in their units and sites; everyone else sees only
    their own. Requester email and phone are shown to planners and to the requester only.
  - b. Everyone with CMMS read sees all requests in their scope.
- **D3, reference data** (failure codes, job plans, classifications):
  - a. Recommended: only workspace-wide holders may change it.
  - b. Unit-held planners may change it too.

**Size:** the fixes add about 3–4 working days to W1.

## Owner decisions (2026-10-16: "approved W1 fixes as recommended")

- **D1a:** technicians keep `cmms.work-orders.write` in this release.
- **D2a:** planners (`cmms.requests.write`) see requests in their units and sites; everyone else sees their own.
  Requester email and phone go to planners and the requester only.
- **D3a:** reference data (failure codes, job plans, classifications) is changed by workspace-wide holders only.

## Fixes built (2026-10-16 to 17)

1. **Record lists:**
   - the CMMS search contracts accept a chosen sort (`sortField`, limited to a fixed list, and `sortDirection`);
   - each service maps it to a fixed column (`chosenOrder`) and otherwise keeps its own order;
   - the `type` and `category` filters, which no service supports, are no longer advertised;
   - `record-list-contracts.spec.ts` runs every list adapter through the real contracts, with every declared sort in
     both directions, search and filters. It fails on the old contract (2 of 8 tests) and passes now.
2. **D1a:** technicians keep `cmms.work-orders.write`. The viewer's description now says it raises and follows its
   own requests. Roles regenerated.
3. **Requests in scope:**
   - migration 20 gives requests `site_ref` and `department_id`, taken from the asset, and drops the unchecked
     `location_id`;
   - every read and change applies D2a (`visibleRequests`): planners see their units and sites, everyone else sees
     their own, and a request outside that is not found;
   - deciding or cancelling another's request needs write scope;
   - the locked read is `FOR UPDATE OF r`; plain `FOR UPDATE` across the outer joins would have failed on a real
     database.
4. **Asset paths:** specifications, the equipment tree (the root and every child) and the cascade (the asset and every
   descendant, all or nothing) are scoped. Out of scope is not found or refused.
5. **D3a:** `assertWorkspaceWide` guards all 9 reference-data writes (failure codes, job plans, classifications,
   specification definitions).
6. **Unit tree:** without a tree, UNITS uses the sign-in's department closure, so a parent unit keeps its children,
   as before W1. An overflowed list still fails closed.
7. **Idempotency:**
   - `record_idempotency` is added in migration 20, with `ModuleIdempotencyStore`
     (`CMMS_IDEMPOTENCY_RETENTION_DAYS`, default 7);
   - the dispatcher now requires a store;
   - the in-memory store is test support only, in `src/test`, which the build excludes.
8. **Work-order permissions:**
   - hold and cancel need write, in both the adapter and the window;
   - staffing is write-only (manifest split);
   - the three web tests record the reviewed permissions and menu instead of "under review" pins;
   - labour for someone else, or with a rate, needs write.
9. **Role sync:** a refused built-in role is skipped and logged; the others still sync (3 tests).
10. **Migration pin:** the job and the API both expect 20, and the hold is lifted.

**Low fixes:**
- DENIED is checked on the space tree, the space lookup and the storeroom list;
- an asset's space must be visible to the caller;
- requests and classifications get `writePermission`, and request fields lock once submitted (`lockedWhen`, a new
  window-builder option), so the window offers no Edit on requests and no New or Edit on classifications without
  `cmms.assets.write`;
- `verify-cmms-http.sh` expects requests to be served;
- the request `q` limit is 200.

**Deferred, recorded:**
- A-L2: some id lookups answer 403 rather than 404. The ids are UUIDs, and the existing R5 specs pin 403.
- A-L3: counts include rows out of scope.
- B-L2 and B-L3: the ownership check outside the lock, and stale actions without `expectedVersion`. No shipped role
  is execute-own only after D1a, so they come with the work-order window.
- The runtime role's DELETE grant.

**Verification (main):**
- tests: CMMS 286 of 286; with tenancy, contracts, module-sdk, configuration, web and control plane, 1,634 passed,
  none failed;
- type-checks clean (CMMS API, tenancy, contracts, module-sdk, control plane, web source);
- the conversion check passes (CMMS: 8 windows, 18 record types);
- the manifest audit and the pins agree;
- every audit passes, and design tokens fails only on the 3 files other sessions own;
- lint matches HEAD on every changed file (one fewer warning in two), and the new files are clean.

## Split: W1-A now, W1-B next (2026-10-17)

- **The finding:** `SCOPE_ENFORCING_MODULES` is empty, so no role can yet be held at units or places, in the screen
  or on the server. Opening it for CMMS is a separate authorization switch that the three reviews did not cover. Its
  rule asks for a test that the CMMS context covers every code the CMMS API checks.
  - The built-in maintenance roles also carry Workforce and Geospatial codes, so only custom roles made of CMMS codes
    could be held at units.
- **W1-A (this release):** all the fixes above, and the journey blockers clear. With the gate closed, nobody is held
  at units or places, so the new scope rules change no existing person's access. The visible changes are D2a, D3a,
  the requests screen and work-order execution.
- **W1-B (next, with its own short review):**
  - add CMMS to `SCOPE_ENFORCING_MODULES` (units and places) with its context-coverage test;
  - the journey then creates a CMMS-only role, gives it at North, and proves that a North technician does not see
    South's work.
