# WI-OI-085 — `module:new` generator and module conformance suite (Wave 0, C9)

Status: In Progress (2026-09-28, owner chose it after WI-OI-083).  
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
