# WI-OI-085 — `module:new` generator and module conformance suite (Wave 0, C9)

Status: Review (2026-09-29, 085a–085f implemented and locally verified; independent review pending).  
Owner: SDLC Orchestrator / Developer Platform  
Plan: `docs/plans/manufacturing-package-solution-plan.md` §4 C9; ADR-0013  
Independent reviewers: QA/SDET, Documentation (Security & Privacy for the SDK guard in 085a)

## G0 — what a module is today (2026-09-28)

A business module (CMMS is the reference) consists of:
- **Manifest** `modules/<name>/module.yaml` v1:
  - catalogue entry, sidebar group, icon, `menu` and `personas`;
  - `spec.ui` pages;
  - `spec.api` port and upstream;
  - `spec.gateway` routes, `unavailable` and `transformBody`;
  - database schema.
- **API** `modules/<name>/apps/api`: NestJS on `@gigalibs/module-sdk`.
  - `main.ts` (helmet, CORS, listen), `app.module.ts`, `config.provider.ts`.
  - `runtime-config.ts`: strict `<PREFIX>_*` parsing, an Ed25519 public key, and exact schema contract version.
  - `database/database.service.ts`: a thin `ModuleDatabase` subclass that binds the tenant and checks readiness.
  - `auth/authorization.ts`: the signed `PlatformContextV1` guard. It checks audience, key, entitlement,
    permissions and revocation, then builds the principal and command context.
  - `common/command.ts`: input parsing, error mapping, and `recordMutation` (audit and outbox in the same
    transaction).
  - `health/health.controller.ts`: live, and ready at the schema contract.
  - Business controllers and services.
- **Database** `modules/<name>/db/migrations` and `db/runtime-manifest.txt`. The shared
  `infra/compose/docker/run-module-migrations.mjs` installs them and creates the least-privilege runtime role
  (NOSUPERUSER NOBYPASSRLS).
- **Web package** `modules/<name>/web`, whose pages are generated from the manifest (WI-OI-083b).
- **Runtime wiring, hand-written per module in five places:**
  - `infra/compose/docker/Dockerfile` (module-build filters and a final target);
  - `build-module-images.sh` rows;
  - `generate-module-runtime-credentials.sh` (image, runtime role URL, context key pair);
  - `compose.modules.local.yaml` (migrations and API services, and the web's key and URL);
  - `infra/compose/docker/pnpm-workspace.yaml`.

**Findings:**
- WI-OI-082 left three pieces per module "for later design":
  - the signed-context guard (the CMMS and Workforce copies are 48% alike);
  - the audit/outbox command (22% alike);
  - runtime configuration.

  A generator must not copy security code into each new module, so 085 designs these SDK pieces first.
- The web shell needs no edit for a new module since WI-OI-083. The runtime wiring still does.
- `packages/cli` is an early prototype with a hard-coded "certified modules" list and no templates. It is not used.

## G1 — acceptance

1. `pnpm module:new <name>` creates a complete module from its name and a few options, with no hand edits:
   - the manifest;
   - the API on the SDK;
   - the migrations (schema, forced RLS, audit and outbox tables), plus the runtime manifest;
   - the web package with a working screen;
   - tests;
   - workspace and layer registration;
   - runtime wiring.

   It refuses to overwrite an existing module.
2. Generated modules use the SDK for the signed-context guard, the audit/outbox command and runtime config. They
   hold no copied security code.
3. `pnpm module:conformance <name>` checks a module statically (manifest, layers, required files, SDK use, RLS
   forced, least-privilege role, tests) and, with `--live`, against its running API:
   - health;
   - 401 without a signed context, and 403 for a wrong entitlement or a missing permission;
   - tenant isolation across two tenants;
   - audit and outbox rows written with a change.

   Failing conformance blocks listing (readiness above PLANNED).
4. **Proof (plan Wave 0 exit):** a generated sample module builds, migrates, starts, passes conformance, and
   appears in the web navigation with no shell edit. The proof runs in a throwaway copy, so the repository keeps
   no sample module.
5. **No regression:** CMMS and Workforce are unchanged, and the full chain and live certifications still pass.

## G2 — design

- **Slices,** each committed and verified before the next:
  - **085a, SDK for new modules:**
    - `SignedContextGuardBase` with principal and command-context decorators;
    - `recordMutation` for a module schema;
    - `loadModuleRuntimeConfig(prefix, audience, contractVersion)`.

    Unit-tested, including a forged token, the wrong audience, the wrong entitlement, a missing permission and a
    revoked session. CMMS and Workforce do not adopt it in this item.
  - **085b, generic module runtime:**
    - one parameterised Dockerfile target;
    - `build-module-image.sh <module>`;
    - a Compose overlay and credentials generated per module from the manifest (`spec.runtime`).

    Existing modules keep their current wiring.
  - **085c:** the `module:new` generator (`scripts/module-new.mjs`, templates under `scripts/module-template/`).
  - **085d:** the conformance suite (`scripts/module-conformance.mjs`).
  - **085e:** the proof in a throwaway copy (reusing the WI-OI-083d copy approach).
- **Out of scope:**
  - mobile packages (WI-OI-084);
  - relay and inbox wiring between modules (added per module when needed);
  - moving CMMS or Workforce onto the new SDK pieces (a separate, certified change).

## G3 — test plan

- **SDK:** unit tests for every refusal path of the guard, and for the transactional audit and outbox writes.
- **Generator:**
  - a generated module type-checks, builds and passes its own tests;
  - a second run refuses to overwrite;
  - invalid names are refused.
- **Conformance:** passes on a generated module, and fails on deliberately broken copies (RLS not forced, the
  guard removed, a manifest error).
- **Live:** a generated module migrates and serves, is isolated between tenants, writes audit and outbox rows,
  and appears in the sidebar.
- **Regression:** full chain; CMMS and Workforce web paths; Playwright/axe 14 of 14.

## 085a — SDK guard, command helpers and runtime configuration for new modules (2026-09-28)

**Implementation (`packages/module-sdk`, core):**
- `signed-context.ts`: `SignedContextGuardBase` (options: label, moduleKey, entitlementName, permissionPrefix,
  publicKey, audience), plus the `RequirePermissions`, `CurrentPrincipal` and `CommandContext` decorators.
  - It checks the signature, audience and expiry, the entitlement for this module, the tenant id format, the
    route's permissions (handler overrides controller; `*`, `<prefix>:*` or the exact permission), and revocation
    (503 when the revocation store is unavailable).
  - The principal comes from the signed token only.
  - Metadata is read through `reflect-metadata`, so the SDK takes no `@nestjs/core` dependency.
- `module-command.ts`:
  - `moduleErrors(codePrefix, label)`: parseInput, assertUuid, notFound, versionConflict, translateConstraint.
  - `recordMutation(client, { schema, topic }, context, mutation)`: audit and outbox in the caller's transaction.
    The schema, topic and action are validated before any SQL.
- `module-runtime-config.ts`: `loadModuleRuntimeConfig({ prefix, audience, schemaContractVersion })`, strict
  `<PREFIX>_*` parsing that names the variable in every refusal.
- CMMS and Workforce are unchanged. They keep their own guards until a separately certified adoption.

**Evidence:**
- **SDK tests** (`signed-context.test.ts`, 24 cases) with real Ed25519-signed contexts:
  - admitted, with the principal from the token;
  - 401 for no header, another scheme, another key, another audience, or an expired token;
  - 403 for another module's entitlement or a missing permission;
  - the controller-level permission applies when the handler has none;
  - revoked session gives 401 and an unavailable revocation store gives 503;
  - the wildcard rules;
  - audit and outbox SQL, and refusal of an unsafe schema or topic;
  - prefixed error codes;
  - 7 runtime-config refusals.
- **Signing:** a disabled entitlement cannot even be signed, because the context format allows only `ENABLED`.
- **Parity with the certified CMMS guard** (`modules/physical-operations-cmms/apps/api/src/auth/sdk-guard-parity.spec.ts`):
  - The SDK guard configured as CMMS gives the same outcome, error type, status and principal as
    `CmmsAuthorizationGuard` in 14 cases: valid, scoped departments and places, flat tenant, both wildcards,
    missing permission, another entitlement, an invalid tenant id, another audience, another key, expired, no
    header, another scheme, revoked, and store down.
  - Removing the `<prefix>:*` rule from the SDK made exactly the "module wildcard" case fail.
- **Chain:** build; full suite 223 files / 2,030 tests; all 8 audits pass. The deployment profile still reports
  only the pre-existing `WORKFORCE_API_URL` drift.
- **No image rebuilt:** no running service uses the new code yet.
- **Review:** Security & Privacy should review `SignedContextGuardBase` before a generated module is listed.

## 085b + 085c — generic module runtime and the `module:new` generator (2026-09-28)

The runtime and the generator were built and proven together: neither can be verified without the other.
Conformance is next (085d), then the navigation proof (085e).

**Generic runtime (085b), for modules declaring `spec.runtime.generated`:**
- **Manifest:** `spec.runtime` holds `generated`, `appendOnlyTables` and `readOnlyTables`. Everything else is
  derived and checked, so the manifest stays the single source:
  - the package, from `<api.application>/package.json`;
  - the environment prefix, from `spec.api.upstream.environmentKey`;
  - the service hostname `<name>-api`;
  - the signing-key variable;
  - the schema;
  - the migration version, from the last runtime-manifest entry.
- **Generated files:** `pnpm modules:catalog` writes `infra/compose/generated/modules.json` and
  `generated/compose.<name>.yaml`:
  - migrations and API services, with the same hardening and labels as the hand-written module overlay;
  - the web's `<PREFIX>_API_URL` and signing key.

  Drift and stale files fail the audit.
- **Dockerfile:** a `generated-module-build` stage and `generated-module` target, chosen by build arguments. It uses
  the root workspace, which matches the lockfile, installs only the module's dependency closure, and copies only
  the runtime-manifest migrations.
- **Scripts:**
  - `build-generated-module-image.sh <module>`: disk guard, source identity, and the same image checks as the
    other builds.
  - `generate-generated-module-credentials.sh <module>`: writes `.env.module.<name>` (image, runtime role URL,
    Ed25519 key pair) and never replaces it.
  - `refresh-source-identity.sh` updates every `.env.module.*` image identity.
- **Existing modules** keep their hand-written wiring.

**Generator (085c):**
- **Command:** `pnpm module:new <name> --title … --group … [--icon] [--prefix] [--port] [--work-item]`
  (`scripts/module-new.mjs`, templates in `scripts/module-template/*.tmpl`).
- **Checks before writing:**
  - the name, title, group, icon, prefix and port;
  - collisions with existing modules, routes, `/api` folders, catalogue keys, prefixes and ports.
- **Writing:** it renders every file before writing anything, and refuses to overwrite.
- **Output:** the manifest, the API on the SDK (config, database, guard subclass, health, a `records` resource with
  idempotent create and versioned update, audit and outbox), the migration, the runtime manifest, a README and
  tests.
- **Regeneration:** it then regenerates everything the manifests drive, and rolls the module back if the manifest
  audit fails.
- **Screen:** a generated module's page uses a new core screen, `RecordsWorkspace` in `@gigalibs/web-sdk`
  (Medusa UI, `ui-*` tokens), with its gateway as a property. That needs **no shell edit**. A module gets its own
  web package when it needs its own screens. `web-sdk` gains `@medusajs/ui` as a peer, following `cmms-web`.
- **SDK:** exports `SafeParser` and `ModuleErrors`, needed for declaration emit in generated modules.

**Findings:**
- Nothing outside the SDK writes `auth_revocation_events`. Module revocation checks can never fire today;
  revocation relies on the expiry of the context the web signs (at most 300 s, `apps/workflow-platform/lib/platform-context.ts`; the verifier checks `exp` but does not cap the lifetime). This predates this item. Generated modules keep the same
  table, so they are ready when a revocation fan-out exists.

**Evidence** (throwaway copy of the working tree under the session scratchpad; the repository has no sample module):
- **Generator:** `module:new field-inspections --title "Field Inspections" --group "Workforce & Operations"
  --icon scale`.
  - It wrote 16 files and chose port 4800, prefix `FIELD_INSPECTIONS`, schema `gigalibs_field_inspections`, and
    catalogue entry `/field-inspections`.
  - A second run and an invalid name were both refused.
  - After `pnpm install --offline`, the dependency build and type-check pass, and the module's 9 tests pass
    (configuration, guard on the real routes, contract).
  - The manifest audit passes and lists the generated module. The page and overlay were generated.
- **Defects found and fixed during the run:**
  - the placeholder pattern mis-read `___SNAKE___`;
  - a failed render left a partial module (rendering now happens before any write);
  - `SafeParser` was not exported.
- **Runtime proof** (`runtime-proof.sh`, with a throwaway git commit for a source identity):
  - Credentials were created, and a second run refused.
  - The generic image built (52 s): component `field-inspections-api`, `generated-module=true`, user
    65532:65532.
  - The generated overlay renders. Migrations exited 0, the API became healthy, and `/v1/health/ready` returned
    200 at migration version 1.
  - `/v1/records` without a signed context gave 401.
  - The runtime role is not superuser, cannot bypass RLS and cannot create roles.
  - RLS is forced on records, audit, outbox and revocation tables.
  - Runtime privileges: `audit_events` INSERT and SELECT only; `auth_revocation_events` SELECT only.
  - Clean-up verified 0 schemas, 0 roles and 0 containers left, and removed the image and the copied secrets.

## 085d — conformance suite and listing gate (2026-09-28)

**Implementation:**
- **Command:** `pnpm module:conformance <name> [--live] [--record]` (`scripts/module-conformance.mjs`).
- **Static checks (15):**
  - manifest and layer audits pass, and the generated runtime is current;
  - the required API files exist;
  - the guard is the SDK `SignedContextGuardBase`, the database is `ModuleDatabase`, and configuration comes from
    `loadModuleRuntimeConfig`;
  - there is no copied token verification;
  - every non-health controller has `AuthorizationGuard`, and every route names a permission;
  - every write records audit and outbox;
  - every table has `tenant_id`, forced RLS and a tenant policy;
  - audit is append-only and revocations read-only;
  - every permission uses the module prefix;
  - the tests exist and pass;
  - the probe routes are declared.
- **Live checks (`--live`):** a runner in the pinned Node image on the Compose network, with the repository mounted
  read-only, calls the module API using contexts signed with the module's own key.
  - Health is at the schema contract.
  - 401 for no context, another key or another audience; 403 for another module's entitlement or a reader who
    writes.
  - Tenant A creates (201), and a repeated request key replays (200, `Idempotency-Replayed`).
  - Tenant B can neither list, read nor change A's record.
  - A stale version gets 409, and the current version updates.
  - Then from the host: audit and outbox rows for each change, and RLS as the runtime role (no tenant: 0 rows;
    tenant B: 0 rows).
  - The synthetic tenants `conformance-<run>-a|b` are deleted afterwards.
- **Recording:** `--record` writes `modules/<name>/conformance.json` only when every check passes, including live.
  It carries the fingerprint of the module manifest, complete API package (excluding build/dependency output) and
  database files (`scripts/lib/module-code-hash.mjs`). The normal manifest audit is rerun after recording.
- **Listing gate:** `audit:module-manifests` fails if a generated module has a catalogue entry above `PLANNED`
  without a passing live record for its current fingerprint. The conformance runner alone may defer the old-record
  check for the named module while refreshing it; the final ordinary audit has no bypass.

**Evidence** (fresh throwaway copy, `conformance-proof.sh`):
- Static conformance: 15 of 15 pass.
- Broken copies, each refused by the right check:
  - forced RLS removed: S11;
  - guard not extending the SDK guard: S5 and build/test refusal;
  - invalid manifest readiness: S1.
- Live conformance with `--record`: 35 of 35 pass, and the record was written.
- Listing gate:
  - `CONTAINED` with the current record passes the ordinary audit;
  - `CONTAINED` without a record is refused;
  - `CONTAINED` after a manifest/code change is refused;
  - a healthy container built from a stale source identity is refused before recording.
- **Defects found and fixed during the run:**
  - the live runner resolved `auth-core`'s absent CommonJS entry (it now reads the ES module entry);
  - a psql `COMMIT` line was read as a row count.
  - a clean copy could not run generated tests until dependencies were built; S14 now builds the module dependency
    closure before testing;
  - the code fingerprint omitted `module.yaml`, so permission/route changes could retain a stale record;
  - cleanup was reported as passing even when `psql` failed; it now uses `ON_ERROR_STOP` and validates every delete;
  - promotion above `PLANNED` deadlocked against the stale-record gate; the named-module refresh is now scoped and
    followed by the ordinary no-bypass listing audit;
  - live conformance could test an old healthy image; L0 now binds health to the exact Git revision and source-state
    digest;
  - generated conformance evidence was entering the runtime source digest; `conformance.json` is now excluded from
    the Docker context and image source-state hash.
  - the listing gate accepted a hand-written record with an empty check list; it now requires the named module,
    valid timestamp and the exact 35 unique static/live check identifiers.
- Clean-up verified 0 schemas, 0 roles, 0 containers and 0 generated module image tags; the throwaway copy and
  copied secrets were removed.
- **Chain on the main tree after the fixes:** build 107/107; full suite 223 files / 2,030 TypeScript tests plus 4
  execution-plane tests; all eight required repository audits plus module-manifest and layer audits pass. The layer
  audit truthfully retains 14 baselined violations and reports zero new violations.
- **Coverage honesty:** conformance covers part of the vision's certification gates 2, 5, 6 and 7 only. It is not
  certification (docs/GIGALIBS_PRODUCT_VISION.md §6).

## Owner decisions, 2026-09-28 (align with the product vision)

Checked against `docs/GIGALIBS_PRODUCT_VISION.md` and the mobile strategy. The owner chose to follow the vision
on all three points:
1. **Runtime: modular monolith by default (vision §8).** New modules run inside one shared module host by
   default. A module gets its own service only when scale, data isolation, team ownership or failure isolation
   justifies it.
   - CMMS, Workforce and Geospatial stay services, because they were split out for data isolation.
   - 085b's separate-service runtime becomes the extraction path. The generator's default becomes the host.
     Rework: slice **085e** (module host); the navigation proof moves to **085f**.
2. **Mobile code: one codebase (mobile vision §4).** The field app is a native shell (Capacitor) around the same
   web components, with native plugins for GPS, NFC, camera, biometrics and offline storage. This matches the
   manufacturing plan §5.1 (`/m` in the Next.js shell) and WI-OI-084.
3. **Mobile API: no separate BFF (mobile vision §11).** Mobile uses the same gateway routes as the web. The gateway
   also accepts mobile bearer sessions, and only sync and offline endpoints are added.

**Also against the vision, to be registered as work items:**
- Catalogue truth must use the vision's six maturity states (§5). Four entries claim `AVAILABLE` without evidence.
- Horizon 1 gaps come before the factory (§12): session revocation fan-out to modules; a clean workspace build;
  backup, restore and deployment profiles.
- `VISION_AND_PHASED_IMPLEMENTATION_PLAN.md` phase 5 (GAAP ledger) conflicts with ADR-0013's "no general ledger".
  Owner decision pending.

## 085d review fixes: independent verification (2026-09-29)

- **Provenance:** the hardening above was made by a Codex review session after commit `a3db758`, which already
  contained one of its changes: the fingerprint's inclusion of `module.yaml` and the whole API package. It edited:
  - `.dockerignore`;
  - `scripts/compute-source-state-sha256.mjs`;
  - `scripts/module-conformance.mjs`;
  - `scripts/module-manifests.mjs`;
  - this file.
- **How it was verified:** Claude checked it in isolation, using a copy of HEAD `a3db758` plus only those files
  (`codex-verify.sh`).
- **Results:**
  - The manifest, layer and SDLC audits pass.
  - Static conformance: 15 of 15. The three broken copies were refused (S11, S9, S5).
  - Readiness `REVIEW` is refused before a record exists.
  - Live conformance with `--record`: 35 of 35.
  - The ordinary audit passes with the current record. Writing the record leaves the source identity unchanged.
  - The audit refuses when the record is removed, and after a code change.
  - Live conformance refuses a healthy container built from older code (L0).
  - Clean-up left 0 schemas, roles, containers and secrets.
- **Promotion order:** to move a generated module above `PLANNED`:
  1. change the readiness;
  2. regenerate with `node scripts/module-manifests.mjs --write --conformance-module <name>`;
  3. commit and refresh the source identity;
  4. build and start the image;
  5. run `pnpm module:conformance <name> --live --record`.

  Skipping step 2 leaves a stale catalogue, and L0 then correctly refuses the image.

## 085e — shared module host (2026-09-29)

Implements owner decision 1 (vision §8): new modules run in one module host by default.

**Implementation:**
- **Host (`apps/module-host`, layer `shell`, a composition root):**
  - One NestJS process imports every module that declares `spec.runtime.hosting: host`, from the generated
    `src/hosted-modules.generated.ts`, and mounts each one under `/<name>`.
  - `/health/live`. `/health/ready` returns 200 only when each hosted module's own `/<name>/v1/health/ready`
    returns 200.
  - Each hosted module keeps its own schema, least-privilege runtime role, Ed25519 key and audience, guard,
    database pool and migrations service. Only the process and the image are shared.
- **SDK:** listener settings moved out of `loadModuleRuntimeConfig` into `loadModuleListenerConfig({ prefix })`, so
  a hosted module's `AppModule` needs no port of its own.
- **Manifest:** `spec.runtime.hosting: host | service`, default `host`.
  - Host: service hostname `module-host`, port 4790, `spec.api.upstream.basePath: /<name>`.
  - Service: `<name>-api` and no base path.
  - The audit checks that the host's `package.json` depends on every hosted module's package.
  - Generated: `hosted-modules.generated.ts` and `generated/compose.module-host.yaml` (one host service, plus one
    migrations service per hosted module). Service modules keep `generated/compose.<name>.yaml`.
- **Gateway:** `localModuleUpstreamUrl` adds the base path (empty for every existing module) and refuses empty or
  dot segments.
- **Image:** `module-host` Dockerfile target and `build-module-host-image.sh`. It checks:
  - disk guard, source identity, user 65532 and labels;
  - no secrets or development paths;
  - `pg` for the migrations runner, and each hosted module's migrations;
  - exactly one copy of `@nestjs/common`.
- **Generator:** `--hosting host | service`, default `host`.
  - `--port` applies only to a service; the names `host` and `module-host` are reserved.
  - It adds the module's package to the host's dependencies, and removes it on rollback.
  - The credentials script writes `.env.module.host` for hosted modules, and no per-module image line.
- **Conformance:** for hosted modules it targets `module-host:4790/<name>`, and L0 checks the host container's
  source identity.
- **Unchanged:** CMMS, Workforce, Geospatial, Connector Hub and Analytics (base path empty).

**Evidence** (throwaway copy, `host-proof.sh`): two hosted modules (`field-inspections`, `site-visits`) and one
service module (`vendor-checks`).
- **Generation:**
  - The generator refused the reserved name `host`.
  - It produced `compose.module-host.yaml` and `compose.vendor-checks.yaml`, and the host list names both hosted
    modules.
  - The audit refused a host that lacked a hosted module's dependency.
  - Static conformance passed 15 of 15 for each module. Hosted modules have no image of their own.
- **Runtime:**
  - The host image and the service image built and passed their checks.
  - Migrations exited 0 for all three modules, and the host and the service became healthy.
  - Host readiness returned 200, listing both modules as ready.
- **Isolation inside one process:**
  - Three distinct runtime roles; none is superuser or can bypass RLS.
  - `field-inspections`'s role reads its own records (0 rows under RLS with no tenant). Reading `site-visits`
    fails with `permission denied for schema gigalibs_site_visits`.
  - A context signed for `field-inspections` gets 200 at `/field-inspections` and 401 at `/site-visits`.
- **Live conformance:** 35 of 35 for all three modules.
- **Clean-up:** 0 schemas, roles, containers, secrets and proof images left.
- **Defects found and fixed during the runs:**
  - hosted migrations exited 1 because the runner imports `pg`, which the host lacked; the host now depends on
    `pg` directly;
  - the image check looked for `pg/package.json` through a pnpm link; it now checks the link and its target.

  Three proof-script faults were also fixed:
  - the clean-up crashed on an empty image list;
  - the cross-read check read psql output out of order;
  - a helper file changed the copy's source identity.
- **Not proven yet:** a hosted module through the web gateway and sidebar. The web image was not rebuilt; that is
  085f. A unit test covers the gateway's base-path URLs for a hosted module and refuses climbing out of the base
  path.
- **Chain on the main tree:**
  - build 108 of 108;
  - full suite 225 files / 2,040 TypeScript tests (2,041 with the hosted gateway test added afterwards), plus 4
    execution-plane tests;
  - all eight required audits, plus the manifest and layer audits (14 baselined violations, 0 new);
  - the profile verifier still reports only the pre-existing `WORKFORCE_API_URL` drift.
- **No running service was rebuilt.**

## 085f — generated navigation and web-gateway proof (2026-09-29)

The proof used a fresh throwaway working-tree copy and generated `field-inspections` with the documented command.
No sample module or proof credentials were retained in the repository. The existing web on port 5180 was not
rebuilt, restarted, or replaced; the proof web ran on `127.0.0.1:5190`.

**Listing gate and exact runtime:**
- The throwaway manifest moved from `PLANNED` to `REVIEW`, regenerated with the scoped conformance bypass, and
  received a local-only Git source identity before either image was built.
- The shared host and web images carried the same exact source identity:
  `61c00ef350de6936326d3ebb608696685b07028e` /
  `7a748619dc6d230a28ec63aaf5f7b064b28fdcdfc3390d97518b9edca73d7534`.
- `field-inspections` live conformance passed 35 of 35 and recorded code fingerprint
  `bc9f027867048dd9c81bce05360a302aca45eb6df83fec98182fa820c28b0a6f`; the ordinary manifest audit then passed
  without a bypass.
- Trivy 0.74.0 scanned unfixed findings in both exact images. Module host: 0 Critical, 0 High, 25 total. Web: 0
  Critical, 0 High, 23 total. This is a local vulnerability-policy result, not a claim of zero risk.

**Real-session web and gateway proof:**
- An entitled Tenant Admin with `field-inspections:*` saw `Field Inspections` in the manifest-driven sidebar and
  opened the generated `RecordsWorkspace` page. Missing-permission and missing-entitlement users did not see the
  navigation entry, and direct workspace access failed closed through the gateway.
- Through the same-origin BFF and a freshly signed platform context: create returned 201, the same request key
  replayed the same record with `Idempotency-Replayed`, list/read succeeded, a stale version returned 409, and a
  current version updated successfully.
- Another entitled tenant could not list, read, or change the first tenant's record. A request without a browser
  session returned 401.
- Chrome/Playwright passed the permitted, missing-permission, and missing-entitlement journeys (3 of 3). The
  generated workspace had zero serious/critical violations under the automated WCAG 2.2 A/AA axe rules. Video,
  screenshots, and traces were disabled so credentials and tenant data were not retained.
- After the module host was stopped deliberately, the authenticated shell and sidebar still loaded, the page
  showed a controlled service-unavailable state, and the BFF returned the typed
  `FIELD_INSPECTIONS_RUNTIME_UNAVAILABLE` 502 (1 of 1 outage journey passed).

**Regression and cleanup:**
- Main tree: build 108 of 108; 225 TypeScript test files / 2,041 tests plus 4 execution-plane tests; all mandatory
  data, dependency, API-boundary, navigation and SDLC audits passed; layer audit passed with 14 baselined and zero
  new violations; ordinary manifest audit passed.
- The separate configuration-deployment-profile verifier still reports only the pre-existing
  `WORKFORCE_API_URL` contract/example drift (`ENV_UNKNOWN`, `ENV_EXAMPLE_DRIFT`); it is not caused by 085f.
- Cleanup verified zero proof users, active sessions, schemas, runtime roles, containers, images, credentials, and
  throwaway copies. The volume-safe disk guard prune completed, and the existing web on port 5180 remained healthy.

**G4 conclusion:** 085a–085f satisfy the bounded local implementation and proof scope of WI-OI-085. The item is in
Review for independent QA/SDET and Documentation decisions. It does not certify a customer module, production or
cloud deployment, external distribution, or the wider manufacturing release.
