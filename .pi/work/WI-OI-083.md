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
