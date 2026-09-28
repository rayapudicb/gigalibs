# WI-OI-083 — Web extension points: module screens, routes and gateways from manifests (Wave 0, C4)

Status: In Progress. G0 recorded; paused 2026-09-28 by a security finding (below).  
Owner: SDLC Orchestrator / Web Experience / Developer Platform  
Plan: `docs/plans/manufacturing-package-solution-plan.md` §4 C4; ADR-0013 §3  
Independent reviewers: Web/Accessibility, Security & Privacy, QA/SDET

## G0 — map of how the shell is wired to modules (2026-09-28)

**Gateways:**
- `lib/signed-module-proxy.ts` is already generic.
- Per module, the shell holds identity (key, audience, upstream, signing key) and a hand-written route
  allow-list:
  - `lib/cmms-proxy.ts`: 26 routes;
  - `lib/workforce-proxy.ts`: about 60 method and path rules, including any-of permissions and a body transform
    (`composePunchBody`).
- `lib/local-module-upstream.ts` hard-codes module ports and hostnames.

**CMMS screens:**
- 7 components, all rendered through `CmmsWorkspace`, plus `lib/cmms-api.ts` (imports only
  `@gigalibs/contracts`).
- 14 pages: 6 real, and 8 placeholders using `UnavailableCapability`.
- One cross-module import: `components/geospatial/SitePicker`.

**The 15 shell references to CMMS:**
- 11 are labels, icons, text or links (sidebar group, dashboard metrics, forms-studio link, communications
  templates, form templates, upstream table).
- 2 are **direct SQL** (below).

## Security finding (2026-09-28): SQL from the web into module schemas as a superuser, one route unauthenticated

**What was found:**
- Three services added by the Antigravity session in commit 808b8d2 (unreviewed) run raw SQL through
  `@gigalibs/db`'s Prisma client against module-owned schemas:
  - `lib/telemetry-bridge-service.ts`
  - `lib/workforce-safety-service.ts` (`UPDATE gigalibs_cmms.work_orders`)
  - `lib/cmms-ledger-settlement-service.ts`
- They are reachable through 10 routes:
  - `app/api/telemetry/alert`
  - `app/api/telemetry/nodes/[nodeId]/live`
  - `app/api/workforce/permits` (plus `[id]/approve` and `[id]/close`)
  - `app/api/workforce/handovers` (plus `[id]/countersign`)
  - `app/api/cmms/work-orders/[id]/financials`, `/labour-link` and `/settle`
- The core database role `gigalibs` is **superuser with BYPASSRLS**, with USAGE and UPDATE on `gigalibs_cmms`.
  Tenant isolation, CMMS audit and outbox rules are bypassed; only each query's own WHERE clause separates
  tenants.
- **`POST /api/telemetry/alert` has no authentication.** The tenant comes from a caller-supplied `x-tenant-id`
  header or `tenantId` query parameter. It can create CMMS condition-based work orders and outbox events.
- The permit and handover routes require a session but check no permission.
- `gigalibs_cmms.telemetry_device_bindings` exists in the database, although none of the 2026-09-27 control-plane
  migrations is recorded in `_prisma_migrations`: the tables were created outside the runner.
- **Exposure:**
  - The stale host server on port 5180 (PID 1533, other stream) listens on all interfaces (`*:5180`), so it can
    be reached from the local network.
  - The web container on 5190 is bound to 127.0.0.1.
- **Not done:** the endpoint was not called and nothing was probed. The analysis is from code and read-only
  catalogue checks.

**Recommended containment** (owner decision; the code belongs to the other stream):
1. Stop the host server on 5180. Serve the web from the image on 127.0.0.1 only.
2. Remove or disable the 10 routes until the D2 review. If kept, rewrite them to call the CMMS and Workforce
   APIs through the signed gateway, with RBAC. The telemetry webhook would need a signed-webhook scheme.
3. Rebuild and redeploy the web image.
4. **Production gap:** the control-plane and web database role must not be superuser or BYPASSRLS, and must hold
   no privileges on module schemas.
5. Add an audit that fails on module-schema SQL outside the owning module, with the current offenders baselined
   until removed.

**Containment applied (2026-09-28, owner "go"):**
- The 10 routes now answer through `unavailableCapability()`: session required, 503, no business action.
- The three services are unchanged and no longer imported (kept for the D2 review).
- New audit rule `MODULE_SCHEMA_ACCESS` in `audit:layers`: a module's schema, taken from `spec.database.defaultSchema`,
  may be named only by that module's code. Tests and verification scripts are exempt.
- Ten existing offenders are baselined:
  - the three services;
  - four web screens that only mention schema names in text;
  - `packages/custom-fields-nest` and `packages/forms-engine-nest` (they name `gigalibs_ar`).

**Containment evidence** (web image `workflow-platform:a59a26127e9a-a6113f7887df`, local-only 5190 container):
- Unauthenticated calls to the contained routes are refused with 401, including the telemetry webhook with a
  caller-supplied tenant.
- The built server bundle contains none of the three services' SQL (0 files).
- Web paths pass: GigaOps P6–P8, CMMS and Workforce jobs.
- Playwright/axe: 14 of 14 pass.
- **Still open, owner action:** the stale host server on 5180 (PID 1533, all interfaces) still serves the old,
  uncontained routes.

## G1 — acceptance

1. **Gateways from manifests.** A module declares its web gateway in `spec.gateway`:
   - base path, catalogue key, audience, upstream, signing-key variable, messages;
   - a route allow-list of path templates with a permission, or any-of permissions, per method.

   The shell's gateway tables are generated from the manifests. The upstream port and hostname table is generated
   too. `lib/cmms-proxy.ts` and `lib/workforce-proxy.ts` become generated data.
2. **Exact equivalence.** For CMMS and Workforce, the generated allow-lists return the same permission as today's
   functions for every method across an exhaustive corpus: every template instantiated, every alternation, and
   negative cases.
3. **Module web packages (CMMS pilot).**
   - CMMS screens and their API client live in a module web package, `modules/physical-operations-cmms/web`.
   - Its pages are declared in the manifest and generated into the shell's route tree.
   - The one cross-module component (Geospatial `SitePicker`) is replaced by a core place-picker slot, with a
     plain fallback when Geospatial is not installed.
4. **No hand-written module wiring in shared shell code.**
   - Dashboard widgets become slots contributed by modules.
   - Sidebar icons and groups come from the manifests.
   - Text-only mentions stay until their owners change them.
5. **Solution build without CMMS.** A solution without CMMS generates no CMMS routes, pages or gateway, and the
   web image builds and starts without `cmms-api`.
6. **No regression.** The manufacturing build keeps passing:
   - the web paths;
   - the 14 Playwright and axe tests (0 serious or critical);
   - the full suite.

## G2 — design

- **Grammar.** Path templates are `/`-separated segments. A segment is a literal, `{id}` (UUID) or `a|b|c`
  (alternatives). The generator compiles templates to anchored regular expressions. Body transforms, such as
  Workforce's punch geofence composition, stay code, exported by the module web package and named in the manifest.
- **Next.js constraint.** Routes must be files, so the generator writes thin, marked-generated route and page files
  for the selected solution. The audit fails if generated files and manifests diverge.
- **Slices, each committed and verified before the next:**
  - 083a: gateways from manifests, with the equivalence test;
  - 083b: the CMMS web package and generated pages;
  - 083c: shell decoupling (slots, icons, upstream table, Compose `depends_on`);
  - 083d: the no-CMMS solution build proof.

## G3 — test plan

- **Equivalence** corpus tests for both allow-lists.
- **Generator drift and negative checks:** a manifest without a route file, a stale route file, a bad template.
- **Web** unit tests and the full suite.
- **Live:** web image rebuild, then web paths and Playwright/axe on 5190.
- **No-CMMS build** starts, with CMMS routes absent (404) and the sidebar free of CMMS.

## 083a — gateways from manifests (2026-09-28)

**Implementation:**
- CMMS (22 routes) and Workforce (49 routes, base paths `/api/workforce` and `/api/gigaops`) declare
  `spec.gateway` in their `module.yaml`.
- `pnpm modules:catalog` validates the gateways and generates `apps/workflow-platform/lib/generated/module-gateways.ts`.
  Validation covers the template grammar, methods, permissions or any-of lists, the catalogue key, the upstream,
  base-path clashes, and that each concrete path matches exactly one template.
- `lib/module-gateway.ts` turns a generated gateway into the signed proxy's configuration.
- `lib/cmms-proxy.ts` and `lib/workforce-proxy.ts` are now thin wrappers with the same exports. The Workforce
  punch-body transform is still supplied in code.

**Evidence:**
- **Equivalence** (`__tests__/module-gateway-equivalence.test.ts`) against a frozen copy of the hand-written
  allow-lists (`__tests__/fixtures/legacy-module-gateways.ts`):
  - every method (GET, POST, PATCH, PUT, DELETE, OPTIONS, HEAD);
  - over a corpus from the manifest templates, the expanded CMMS regular expressions and a transcribed Workforce
    path list;
  - with negative variants: extra and missing segments, malformed, upper-case and over-long identifiers, unknown
    paths.

  A one-permission mutation of the generated table makes it fail.
- **Tests:** the existing CMMS and Workforce boundary tests pass unchanged, and the web app type-checks.
- **Chain:** build, full suite and audits pass.
- **Live** (images `81005abe5146-903f2761a688`, web on 127.0.0.1:5190):
  - GigaOps P6–P8, CMMS and Workforce jobs web paths pass through the generated gateways;
  - Playwright/axe 14 of 14.

## 083b — CMMS web package and generated pages (2026-09-28)

**Implementation:**
- **`@gigalibs/cmms-web`** (`modules/physical-operations-cmms/web`, module layer): the 7 CMMS screens and the API
  client, moved with `git mv`. It has no shell (`@/`) imports.
- **`@gigalibs/web-sdk`** (`packages/web-sdk`, core):
  - the place-picker slot (`PlacesProvider`, `usePlaces`, `PlaceSelect`), which falls back to an empty picker and
    short ids as before;
  - `useCurrentUserId`.
- **Shell:** `GeospatialPlacesProvider` fills the slot, mounted in `app/(app)/layout.tsx`. The provider only
  supplies the hook, so no extra request is made on pages that do not ask for places.
- **Pages:** CMMS declares 14 pages in `spec.ui.pages` (6 component pages, 8 capability-status pages with their
  exact texts). `pnpm modules:catalog` generates them into `app/(app)/cmms/**`. It refused to overwrite the 14
  hand-written pages until they were removed, and it flags generated pages no manifest declares.
- **Framework instances:** the packages declare React, Next and Medusa UI as peer dependencies, with development
  copies pinned to the web app's exact versions. Medusa UI, the icons, Next.js and React resolve to the same
  instance from the web app, `cmms-web` and `web-sdk`.
- **Other changes:**
  - the dashboard imports `requestCmms` from `@gigalibs/cmms-web` (083c turns it into a slot);
  - `modules/*/web` added to the pnpm workspace;
  - both packages added to the image workspace and to `transpilePackages`.

**Evidence:**
- **Local:** the web app type-checks; full suite 219 files / 1,911 tests; all 8 audits pass.
- **Layer audit:** 116 units. The shell's imports of CMMS code are now 7 (6 generated pages and the dashboard).
- **Live** (images `88967ea35011-9ffa1e2a8005`, web on 127.0.0.1:5190):
  - GigaOps P6–P8, CMMS and Workforce jobs web paths pass;
  - Playwright/axe 14 of 14, including the CMMS work-order staffing test.

## 083c — shell decoupling (2026-09-28)

**Implementation:**
- **Upstreams:**
  - Five manifests declare `spec.api.upstream` (key, Compose service hostname, `…_URL` variable): Analytics,
    CMMS, Connector Hub, Geospatial and Workforce (`gigaops`).
  - `pnpm modules:catalog` validates them and generates `lib/generated/module-upstreams.ts`.
  - `lib/local-module-upstream.ts` no longer holds a port and hostname table.
- **Compose:** the web service no longer waits for module APIs (`depends_on` removed from the Geospatial,
  Workforce and modules overlays).
  - While a module is down, its gateway answers 502 `RUNTIME_UNAVAILABLE` (3 s timeout), or 503 when it is not
    configured.
  - The base web → API dependency stays, as the deployment profile requires.
- **Dashboard:** the Executive Control Tower no longer imports `@gigalibs/cmms-web`.
  - Its only CMMS call asked for `analytics/assets/reliability`. That route is in neither the CMMS gateway nor the
    frozen legacy allow-list, so it always failed and showed "CMMS Reliability Service Unreachable".
  - Reliability now shows as Unavailable, without the error.
- **Sidebar groups:**
  - `navigationGroup` (`PlatformModuleArea`) now holds the seven groups the sidebar shows: Studio & Build,
    Automate & Run, Workforce & Operations, Financial Operations, Intelligence, Data & Documents, Platform.
  - The old five areas were not displayed anywhere.
  - The sidebar groups entries by their manifest value. `MODULE_NAV_GROUP` and the unused old group tables are
    removed.
- **Icons:**
  - `iconKey` now names an icon from a closed set, `PlatformModuleIcon` (30 names such as `factory`, `clock`,
    `map-pin`). It no longer uses module names.
  - The generator rejects unknown names.
  - `lib/module-icons.ts` is the one registry for the sidebar (Lucide) and the `/modules` page (glyphs), so a new
    module needs no shell change.
  - On `/modules`, entries that now share an icon share its glyph:
    - value ledger `◇` → `✓`;
    - analytics studio `⌁` → `▥`;
    - master data `•` → `{}`.
- **Deployment-profile check:** 083b put `modules/physical-operations-cmms/web` in the image workspace, which
  broke the check's frozen-scope rule.
  - The check now allows the CMMS core API and web package only; the frozen import/export and prototypes stay
    excluded.
  - The web package holds only the 7 screens and API client.

**Deviations and open points (for owner review):**
- **G1 §4, dashboard widgets as slots:** no slot mechanism is built, because no module contributes a working
  widget yet. The first one would be CMMS maintenance KPIs (WI-OI-090).
- **Module knowledge still hand-written in `AppSidebar.tsx`:** sub-menus and persona allow-lists were moved to the
  manifests later the same day (owner approved; see "083c addendum"). Still unchanged, as G1 §4 leaves text-only
  mentions to their owners:
  - label overrides (`gigaops` → "GigaOps Workforce", and a translated Accounts Receivable label);
  - navigation translation keys for the old five areas, now unused.
- **`audit:configuration-deployment-profile`** (not in the mandatory eight) still reports `WORKFORCE_API_URL`
  contract and `.env.example` drift, pre-existing from WI-OI-060/061 (see WI-OI-038).

**Evidence:**
- **Equivalence:**
  - `__tests__/module-navigation-equivalence.test.ts` checks all 32 catalogue entries against a frozen copy of the
    former sidebar tables (`__tests__/fixtures/legacy-module-navigation.ts`): same group, same Lucide icon.
  - Changing one entry's group in the built contracts made exactly that case fail.
  - The upstream table equals the former hard-coded one (`module-gateway-equivalence.test.ts`).
- **Generator:** an unknown `iconKey` fails `audit:module-manifests` with the allowed list.
- **Chain:** build 107/107 tasks; full suite 220 files / 1,945 tests; all 8 audits pass.
- **Images:** identity `4da4159bb9f9-43a34f921481`, from HEAD `4da4159` plus the uncommitted 083c changes.
  - Built: control-plane migrations, API, web, Workforce, Analytics, Connector Hub and CMMS. Geospatial was not
    rebuilt (owner rule).
  - The WI-OI-101 disk guard ran before each build: 194, 180 and 179 GB free. Build cache afterwards: 11.35 GB.
- **Live** (web on 127.0.0.1:5190, same hardening as Compose):
  - GigaOps P6–P8, CMMS and Workforce web paths pass through the generated gateways and upstream table
    (run `1790599113268-839d44`);
  - Playwright/axe 14 of 14.
  - The verification users' sessions were revoked afterwards (64, including earlier runs); none active remain.
- **Deployed:** only `web` on 5180 (`up -d --no-deps web`). It is healthy, `/api/health/ready` and the API's
  `/ready` return 200, and it is read-only with all capabilities dropped. Other services are unchanged.
  `docker-disk-guard.sh prune --dry-run` found nothing to remove.

## 083c addendum — sub-menus and persona lenses from manifests (2026-09-28)

The owner approved this ahead of 083d, so the no-CMMS proof covers the whole sidebar.

**Implementation:**
- **New catalogue-entry fields**, manifest-only and validated by `pnpm modules:catalog`:
  - `personas`: the restricted personas (`C_LEVEL`, `OPERATIONS_SUPERVISOR`, `WORKFORCE_MEMBER`,
    `CUSTOMER_GUEST`) whose sidebar lens shows the entry. Platform Operators and Tenant Admins see every entry.
  - `menu`: the entry's sub-menu items (key, label, path, icon). Each path must be the entry's route or below it.
- **Generated output:** the generator writes these to `apps/workflow-platform/lib/generated/module-navigation.ts`.
  The shared contracts catalogue is unchanged.
- **Sidebar:** `lib/module-navigation.ts` (`personaSeesModule`, `moduleMenu`) serves them to the sidebar.
  `PERSONA_ALLOWED_MODULE_KEYS` and `moduleSubmodulesByKey` are removed from `AppSidebar.tsx`.
- **Overview items:** an item whose path equals the entry's route (the GigaOps overview) is active only on that
  route, as the former `overview` key rule was.
- **Icons:** six more names in `PlatformModuleIcon` for sub-menu items: `calendar`, `gauge`, `inbox`, `layers`,
  `megaphone`, `wrench`.

**Evidence:**
- **Equivalence:**
  - `module-navigation-equivalence.test.ts` now also checks, for all 32 entries, that each sub-menu equals the
    frozen former table (key, label, href, icon) and that each persona lens shows exactly the same entries.
    Former tables: `LEGACY_MODULE_MENUS` and `LEGACY_PERSONA_MODULE_KEYS` in the fixture.
  - Two deliberate changes (a persona dropped, a label renamed) each failed exactly one case.
- **Generator:** a menu path outside the route, and an unknown persona, fail `audit:module-manifests`.
- **Chain:** build; full suite 220 files / 1,978 tests; all 8 audits pass. The deployment profile still reports
  only the pre-existing `WORKFORCE_API_URL` drift.
- **Images:** identity `c8422af46326-e05abab2dbb1`: control-plane migrations, API, web, Workforce, Analytics,
  Connector Hub, CMMS. Geospatial was not rebuilt. The disk guard reported 176, 168 and 167 GB free.
- **Live** (web on 127.0.0.1:5190): web paths pass (run `1790600414109-fd771f`) and Playwright/axe passes 14 of
  14. The test sessions were revoked.
- **Deployed:** only `web` on 5180, healthy; `/ready` returns 200 for web and API. The post-deploy
  `docker-disk-guard.sh prune` removed `workflow-platform:88967ea35011-9ffa1e2a8005`, keeping the current web
  image and one rollback.
