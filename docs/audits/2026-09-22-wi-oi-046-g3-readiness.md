# WI-OI-046 G3 readiness and human decision packet

Status: Proposed for independent G3 review; no G4 implementation authority

Date: 2026-09-22

Work item: WI-OI-046

Foundation: WI-OI-044, WI-OI-045 and proposed ADR-0005

## 2026-09-23 dependency update

WI-OI-047 completed its bounded local technical certification and entered Review. The evidence at
`infra/compose/evidence/phase-a-20260923T103641Z/` resolves the agent-executable F2 predecessor, including
two-tenant lifecycle/revocation, 250-field boundary, latency, restart, outages and semantic restore. It does
not accept ADR-0005, D1–D6 or the remaining specialist risks. This packet remains Proposed and the current
decision request is `docs/reviews/WI-OI-046-g3-decision-request-2026-09-23.md`.

On 2026-09-23 Chinni babu Rayapudo accepted D1–D6 as Product Owner/Solution Architecture for the bounded
TP-1 Local Development slice. The declaration explicitly does not waive Security, IAM/Tenancy, API
Contracts, Web/Accessibility or QA decisions and does not authorize production or cloud release.

## 1. Decision requested

Approve, reject or amend one bounded slice: make the existing Tenant Profile configuration surface the
first `ModuleAdapterDescriptorV1` adopter and make its normal runtime manifest selection server-resolved.
The slice preserves the existing Configuration Studio compiler, activation, cache, extension-value table,
settings renderer and public surface response. It creates no metadata service, business-record gateway,
database migration or new dependency.

Approval of this packet does not accept WI-OI-039, WI-OI-044 or WI-OI-045, authorize another Delta 5
slice, or authorize release. WI-OI-046 may enter G4 only after every pre-flight item in the work item is
recorded as accepted and the SDLC Orchestrator makes it the sole active Build item.

## 2. Repository truth found during G3 inspection

- `ConfigurationStudioService.listBaseSurfaces()` owns an inline `tenant-profile-extension` registration.
- `saveExtensionValues()` already performs real tenant-scoped PostgreSQL persistence, optimistic version
  checking, field authorization, validation, audit and idempotency in one transaction.
- `GET /api/v1/configuration/runtime/manifest` currently accepts `environmentKey` and `cohortKey` from the
  query while requiring only `configuration-runtime:read`.
- `ConfigurationRuntimeQuerySchema` silently defaults those values to `local-uat` and `all-users`.
- `ConfiguredTenantFields` and `StudioMode` send those same constants from the browser.
- `ActivateConfigurationSchema` also supplies silent environment/cohort defaults. Activation is an
  administrative operation and must instead require an explicit scope.
- Configuration Studio deliberately supports explicit environment/cohort activation. That administrative
  choice is not proof that a normal runtime actor belongs to the selected cohort.
- Other Configuration Studio application paths also contain `local-uat`/`all-users`. They are recorded
  technical debt but are outside this Tenant Profile slice unless a shared helper can replace them without
  broadening behavior. No document may claim that every Configuration consumer is remediated by TP-1.

## 3. Proposed decisions for human acceptance

### D1 — Deployment environment source

Add required server configuration `CONFIGURATION_RUNTIME_ENVIRONMENT_KEY`.

- It is parsed during API startup by `runtime-config.ts` with the existing configuration-key grammar:
  `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`, length 2–80.
- There is no default. Missing or invalid configuration prevents the API from becoming ready.
- The currently supported Local Development profile supplies the value explicitly through Compose and
  may use `local-uat`. Managed/customer staging and production profiles remain `DEFERRED_EXTERNAL`; a
  future authorized profile must supply its own approved stable key without a fallback.
- The value identifies a Configuration activation environment, not a tenant, region, database, namespace
  or secret. Tenant authority continues to come from the authenticated server context.
- Helm, Compose, local certification launchers and the environment example must declare the setting.
  An unconfigured production-shaped profile fails; it never falls back to local UAT.

### D2 — Initial cohort policy

Introduce code-owned policy `ALL_ENTITLED_USERS_V1` for the first adopter.

- After authentication, active tenant membership, entitlement and permission checks, it resolves the
  Tenant Profile runtime cohort to the serialized key `all-users`.
- `all-users` means all currently authorized users of that tenant for this surface. It does not mean all
  platform tenants and does not bypass field-level permission filtering.
- The policy identifier and resolved key are server evidence, not browser inputs.
- TP-1 does not claim beta, internal, percentage, attribute or organization-subscope targeting. Those need
  an accepted cohort-membership contract, deterministic precedence, privacy review and separate tests.
- Tenant Profile activation to a cohort unsupported by this policy is allowed only as an administrative
  preview candidate and cannot silently become the normal runtime selection.

This is an explicit bounded policy, not a fallback. If Product requires targeted Tenant Profile cohorts in
TP-1, this decision must be rejected and the cohort contract designed before Build.

### D3 — Runtime and preview HTTP boundaries

Use three explicit semantics during a compatibility window:

1. `GET /configuration/runtime/manifest/current` is the normal path. Its strict query contains only
   `moduleKey`, `entityKey` and `surfaceKey`. The server resolves environment/cohort and requires
   `configuration-runtime:read`.
2. Existing `GET /configuration/runtime/manifest` is a deprecated compatibility alias to current-runtime
   resolution. It may accept legacy environment/cohort fields only as assertions. A supplied value that
   differs from the server result returns a stable denied error; it never changes the selected scope.
3. `GET /configuration/runtime/manifest/preview` accepts an explicit environment/cohort for Studio users
   and requires the administrative `configuration:read` permission in addition to the authenticated tenant
   boundary. Preview does not mutate activation or establish cohort membership.

The current response remains backward-decodable. New scope evidence is additive and includes contract
version, resolved environment, resolved cohort and policy identifier. Existing Configuration HTTP naming
remains camel case; the implementation documents its semantic mapping to the logical Delta 5 contract.
API Contracts must explicitly accept this compatibility mapping before G4.

### D4 — Activation input

Remove defaults from `ActivateConfigurationSchema` and OpenAPI. Administrative activation and rollback
must supply both environment and cohort deliberately. The Studio controls may initialize a visible value,
but omission at the API boundary is invalid. This changes unsafe omission behavior, not a valid explicit
request.

### D5 — Tenant Profile adapter

The code-owned descriptor has this bounded meaning:

| Field | TP-1 value |
| --- | --- |
| Adapter ID | `gigalibs.tenant-settings.tenant-profile.v1` |
| Module/entity | `tenant-settings` / `tenant-profile` |
| Surface | existing `profile-extension` registration |
| Adapter version | `1.0.0` |
| Capabilities | `READ`, `UPDATE` |
| Permission map | existing `configuration-values:read` and `configuration-values:update` |
| Storage | `OWNER_EXTENSION_TABLE` |
| Owner rule | owner type `tenant-profile`; owner ID must equal authenticated tenant ID |
| Core fields | existing locked `name`, `slug`, `status`, `region` descriptors, unchanged |
| Extension slot | existing `profile-details` types and 100-field maximum, unchanged |
| Filter contract | no executable filter capability in TP-1 |
| Jobs/events | none in TP-1; TP-2/TP-3 remain separate |
| Audit policy | existing Tenant Profile extension-value policy, referenced by stable code-owned ID |
| Compatibility | Configuration definition/manifest v1 and adapter runtime v1 only |

Unknown adapters, versions, owners, capabilities, fields and operations fail closed. The adapter exposes no
table name, SQL, repository callback, URL or tenant-authored executable handler.

### D6 — Registry transition

Create one adapter registry keyed by exact `(moduleKey, entityKey, surfaceKey)` and reject duplicates at
startup. The Tenant Profile entry moves out of the inline array and is projected back to the existing
`ConfigurationSurfaceRegistration` response. The existing tenant-application surface remains in its
current path during TP-1; that is an explicit migration boundary, not a second adapter implementation.

`assertRegisteredSurface()` and `assertExtensionOwner()` delegate Tenant Profile decisions to the adapter.
The Configuration service retains transaction and persistence ownership. No generic repository is added.

## 4. Stable error behavior

The accepted implementation should expose bounded codes while retaining safe messages:

| Code | HTTP | Meaning |
| --- | ---: | --- |
| `CONFIGURATION_ADAPTER_NOT_FOUND` | 404 | Exact code-owned adapter does not exist |
| `CONFIGURATION_ADAPTER_INCOMPATIBLE` | 409 | Contract/runtime version is unsupported |
| `CONFIGURATION_RUNTIME_SCOPE_UNAVAILABLE` | 503 | Required server scope cannot be resolved |
| `CONFIGURATION_RUNTIME_SCOPE_DENIED` | 403 | Legacy assertion or preview access is not allowed |
| `CONFIGURATION_MANIFEST_UNAVAILABLE` | 404 | No active manifest exists for resolved exact scope |

Errors contain no tenant existence oracle, database topology, role list or configuration value. Metrics use
bounded adapter/policy/outcome labels and never tenant, actor, record or raw scope values.

## 5. Exact implementation map after authorization

The first G4 commit is limited to these logical patch points:

1. Contracts
   - add focused adapter/runtime-scope schemas under `packages/contracts/src/configuration/`;
   - export through the existing configuration/root indexes;
   - split current-runtime, compatibility and preview query schemas;
   - make activation environment/cohort required;
   - update OpenAPI and strict response fixtures.
2. API registry and scope
   - add `configuration-module-adapter.registry.ts`;
   - add `tenant-profile-configuration.adapter.ts`;
   - add `configuration-runtime-scope.resolver.ts`;
   - validate `CONFIGURATION_RUNTIME_ENVIRONMENT_KEY` in `config/runtime-config.ts`;
   - register focused providers in `app.module.ts`.
3. Service/controller
   - inject the adapter registry and scope resolver;
   - project the existing Tenant Profile surface from the adapter;
   - delegate Tenant Profile surface/owner checks;
   - resolve scope before Tenant Profile manifest/value operations;
   - add current, compatibility and preview controller paths with the permissions in D3;
   - keep `runtimeManifest()` as the exact-scope cache/database primitive.
4. Web
   - change `ConfiguredTenantFields` and normal `StudioMode` reads to `/runtime/manifest/current` without
     environment/cohort query values;
   - retain explicit activation controls in `ConfigurationStudioWorkbench` and require both values;
   - render unavailable/denied/conflict/retryable states without inventing a manifest or values.
5. Deployment/evidence
   - add the required setting to the Local Development Compose profile and its real certification
     launchers; Helm, managed-cloud and customer-managed profiles are `DEFERRED_EXTERNAL`;
   - update the Configuration OpenAPI/runbook and collect focused contract, HTTP, two-tenant, cache/restart
     and accessibility evidence.

No Prisma schema or migration, dependency, lockfile, CMMS file, AR file or Analytics file is in scope.

## 6. Dirty-file preservation checkpoint

The worktree already contains changes not owned by WI-OI-046. G4 must re-hash and review every touched file
before applying minimal hunks. The 2026-09-22 checkpoint is:

| Candidate | State / diff | SHA-256 |
| --- | --- | --- |
| `apps/playground-api/src/app.module.ts` | modified, +18/-10 | `a231341cecb641b91903d144154eaebf7850860751520d8750e6d0f44716ecd4` |
| `apps/playground-api/src/configuration-studio.controller.ts` | modified, +237/-106 | `9ce11e2bf2e878cf7a5e1baa04e11a69474fc88e88e53ac63048db6603c6c193` |
| `apps/playground-api/src/configuration-studio.service.ts` | modified, +247/-169 | `2c709c89697657843234f33035ac408ff84c4a2c18a7d6ae34d2f6ae6940bbbd` |
| `packages/configuration-core/src/index.ts` | modified, +5/-1 | `50e251b86a6d9778266fc8420bc1d87b3ae93f05c14874a8d194a93bc0b2ea68` |
| `packages/contracts/src/configuration/index.ts` | modified, +297/-13 | `1a7001b2ba72ac32d73149a553548ade050447a0b193abc2fa432f59ea08f50b` |
| `packages/contracts/src/index.ts` | modified, +3/-0 | `7cdc1aa925099448d1f40dbb364335b0a68b931783cbc1d0ae19dfbb058c1f79` |
| `ConfiguredTenantFields.tsx` | tracked, no current diff | `53778045ee4066d9f2584a92bbefb7968e5fd264ca43926e136ff20d5ddded70` |
| `StudioMode.tsx` | modified, +628/-131 | `9d9467fdc4a8e2d2609a5b100c92a9bd77ac26c9e869d994fbc9b4c252140085` |
| `ConfigurationStudioWorkbench.tsx` | modified, +352/-151 | `7589cf499f4e4b9aa70c2899ef5a2d70fb6bfc66cf2b3361aa3e610e79b7aaed` |
| `docs/contracts/configuration-studio/openapi.yaml` | modified, +1033/-407 | `b984d50e599b82d03dfbf5cdff7fb3e5755a15821457a10a1e13bffcebfe9414` |
| `.env.example` | tracked, no current diff | `ec5139a28717d5d61ab0d1ccf41e56eba7ae98de739f4cab9d76ea8b9072d1d0` |
| `infra/compose/compose.yaml` | untracked | `26c610e983219e3571a797fb043c91aa36513d1d640bf61d326f8eaf41ddc001` |
| `infra/compose/.env.example` | untracked | `8f91172cc6f007f5a509f9cb0fcd764c59dcdde5412b9703d590b1d170c40226` |
| `infra/helm/workflow-platform/templates/api.yaml` | untracked; observed for collision only, excluded from local TP-1 | `3f214598198090022032b4d4e0325d2ef4b9dc915846ed83ede7d7392b93f148` |
| `infra/helm/workflow-platform/values.yaml` | untracked; observed for collision only, excluded from local TP-1 | `57c0efeeaafc5df571b660ae66698f31c09f7fc7bd8d390454ae67570d0ed615` |

Any mismatch requires a fresh diff review; it is not permission to overwrite the newer content. The frozen
C4 hashes in WI-OI-044 remain independently authoritative.

### 6.2 Fresh pre-Build checkpoint — 2026-09-23

The current checkpoint is recorded in
`docs/reviews/WI-OI-046-g3-prebuild-candidate-manifest-2026-09-23.sha256` and analyzed in
`docs/audits/2026-09-23-wi-oi-046-prebuild-collision-audit.md`. Thirteen product/API/web candidates remain
byte-identical to the 2026-09-22 checkpoint. Only `infra/compose/compose.yaml` and
`infra/compose/.env.example` changed, through authorized WI-OI-047 local deployment work. Helm candidates
remain byte-identical but are excluded from the Local Development TP-1 scope.

### 6.1 Collision assessment

Zero-context hunk inspection shows high overlap risk in the controller, service, configuration contracts,
`StudioMode`, workbench and OpenAPI; moderate overlap in `app.module.ts`; and small export-only overlap in
the package indexes. `ConfiguredTenantFields.tsx` currently has no diff. Therefore the authorized change
must put new logic in focused new files and limit existing-file edits to imports, dependency injection,
route delegation, the two runtime callers and exact schema/OpenAPI nodes. No formatter or generated bulk
rewrite may run across these files. This location audit does not satisfy the pre-flight semantic diff
review: the implementer must inspect the then-current hunks immediately before the first G4 patch.

## 7. Acceptance and evidence matrix

| Reviewer | Required decision |
| --- | --- |
| Solution Architecture | Accept D1–D6, bounded adapter migration and no-service/no-migration topology |
| Security & Privacy | Accept server-scope trust boundary, legacy assertion behavior, errors and metrics |
| IAM/Tenancy | Accept authenticated `ALL_ENTITLED_USERS_V1` meaning and tenant non-interference tests |
| API Contracts | Accept schemas, camel-case compatibility mapping, endpoint window and deprecation behavior |
| Web/Accessibility | Accept current-runtime UX and complete loading/absent/denied/error/conflict states |
| QA/SDET | Accept test commands, two-tenant matrix, deployment profiles and evidence locations |
| Product | Accept all-users-only normal Tenant Profile cohort in TP-1 and deferred targeting |

Each reviewer records name, decision, date, conditions and reviewed artifact checksum in repository
evidence. Role names alone are not sign-off.

## 8. G4 verification contract

Focused verification runs before the repository-wide gate:

- strict adapter/scope/query contract tests, unknown-field and compatibility fixtures;
- registry duplicate/exact-lookup/unknown/incompatible tests;
- required/invalid environment startup tests;
- current, legacy-match, legacy-mismatch and privileged-preview authenticated HTTP tests;
- Tenant Profile exact owner, cross-tenant, revoked permission and suspended membership tests;
- existing compile/impact/publish/activate/cache/restart/value/idempotency/audit tests;
- web state, keyboard, focus and error-announcement tests;
- Local Development Compose rendering plus local real-PostgreSQL certification. Managed-cloud and
  customer-managed rendering remain `DEFERRED_EXTERNAL` and cannot be credited as a pass.

Then run every mandatory command in `AGENTS.md`. Infrastructure-dependent evidence remains blocked if the
real dependency is unavailable; a mock result cannot replace it.

## 9. Current gate result

G3 agent preparation and the F2 technical predecessor are complete enough for human review.
Product/Solution Architecture has accepted D1–D6. G4 remains blocked because the applicable ADR-0005,
WI-OI-044/045 and D1–D6 specialist decisions are not accepted by Security, IAM/Tenancy, API Contracts,
Web/Accessibility and QA/SDET, WI-OI-047's independent review conditions remain open, and the SDLC
Orchestrator has not made WI-OI-046 Ready or the sole active Build item. No product code was changed while
producing this packet.
