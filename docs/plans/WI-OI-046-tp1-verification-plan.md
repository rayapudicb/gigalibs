# WI-OI-046 TP-1 verification plan

Status: Proposed for QA/SDET acceptance; no G4 implementation authority  
Date: 2026-09-23  
Profile: `configuration-local-development-v1`

## 1. Purpose

Verify only TP-1: code-owned Tenant Profile adapter conformance and server-resolved normal runtime scope.
The plan must prove compatibility, tenant isolation, fail-closed configuration and accessible web states
without implementing or claiming TP-2 jobs, TP-3 events, TP-4 connection governance, TP-5 audit integrity,
cloud, Helm or production release.

## 2. Evidence identity

At an authorized Build entry, create a new evidence directory:

```text
infra/compose/evidence/wi-oi-046-tp1-<UTC timestamp>/
```

Record before testing:

- Git revision and source-state SHA-256;
- dirty-tree disposition and the revalidated candidate manifest;
- Local Development Compose render hash;
- migrations/API/web exact image IDs and labels;
- PostgreSQL and MinIO container identities;
- profile key and non-secret resolved environment key; and
- test-user/test-tenant provenance.

Never record tokens, cookies, credentials, signing keys or private material. Every JSON evidence record has
`verifier`, `timestamp`, `workItem`, `profile`, `status`, `outcomes`, `failures`, `limitations` and
`testDataCleanup` fields.

## 3. Requirement and decision matrix

| Scope | Required proof | Automated owner | Human owner |
| --- | --- | --- | --- |
| D1 / D5-CTX-001–002 | Required valid server environment starts; missing/invalid value fails before Ready | Backend/API tests and exact-image startup | Architecture, SRE, QA |
| D2 / D5-CTX-003–004 | Cohort comes from authenticated code-owned policy; browser cannot select membership | API unit/integration and two-tenant HTTP tests | IAM/Tenancy, Security, QA |
| D3 / D5-CTX-005–008 | Current route is server-resolved; legacy query is match-only; preview requires admin permission | Contract and authenticated HTTP matrix | API Contracts, Security, QA |
| D4 / D5-META-001–002 | Activation omitting environment/cohort is rejected; explicit Studio activation remains compatible | Contract, controller and BFF tests | API Contracts, Product, QA |
| D5 / D5-META-003–008 | Exact Tenant Profile descriptor preserves keys, locked fields, slot, permissions and storage ownership | Contract/adapter fixtures and service tests | Architecture, Backend, Product |
| D6 / D5-META-009–012 | Exact registry lookup, duplicate rejection, immutable return, safe unknown/incompatible denial | Registry unit/startup tests | Architecture, Security, QA |
| Web / NFR-UX | Loading, absent, denied, conflict, invalid scope, retryable failure and success are explicit | Component/BFF and axe automation | Web/Accessibility, Product |
| Tenancy / NFR-SEC | Two tenants cannot enumerate or influence adapter, manifest, value or cache state | Real PostgreSQL authenticated matrix | Security, IAM/Tenancy, QA |
| Compatibility / NFR-REL | Existing surface response, compile/publish/activate/value/idempotency behavior remains green | Existing regression suites and fixtures | API Contracts, Backend, QA |

## 4. Required focused tests

The implementer may add focused files, but must not rename or rewrite unrelated suites merely to get green
output.

### Contracts

- strict `ModuleAdapterDescriptorV1` and runtime-scope parsing;
- unknown-field rejection and additive v1 fixture compatibility;
- activation requires explicit environment and cohort;
- normal current-runtime query accepts only module/entity/surface;
- legacy assertion and privileged preview queries are distinct; and
- stable error response fixtures contain no tenant/database/permission oracle.

Preserve and run:

- `packages/contracts/src/configuration/response-contracts.test.ts`;
- `packages/configuration-core/src/index.test.ts`;
- `packages/configuration-core/src/index.property.test.ts`; and
- `packages/configuration-core/src/compatibility.test.ts`.

### API and domain

- duplicate adapter key fails at startup;
- exact lookup and immutable descriptor return;
- unknown adapter/version/capability/owner fails closed;
- Tenant Profile descriptor exactly preserves existing serialized registration;
- missing/invalid `CONFIGURATION_RUNTIME_ENVIRONMENT_KEY` fails readiness/startup;
- current route accepts no client scope authority;
- legacy matching assertion succeeds, while a mismatch returns the accepted denied code;
- preview requires authenticated tenant plus `configuration:read`;
- normal runtime requires `configuration-runtime:read`;
- suspended tenant/user/membership and role downgrade deny without restart;
- two tenants with different activations cannot observe each other's manifest/value/cache; and
- missed invalidation and API restart reload PostgreSQL authority.

Preserve and run:

- `apps/playground-api/src/configuration-studio.service.spec.ts`;
- `apps/playground-api/src/configuration-manifest.cache.spec.ts`;
- `apps/playground-api/src/configuration-invalidation.consumer.spec.ts`; and
- `apps/playground-api/src/configuration-outbox.publisher.spec.ts`.

### Web and BFF

- `ConfiguredTenantFields` uses `/runtime/manifest/current` without environment/cohort query values;
- BFF never derives tenant, cohort or authority from browser-provided identity;
- explicit Studio activation still submits both visible values;
- loading, absent-manifest, denied, invalid-scope, conflict, retryable dependency and success states render;
- error announcements use an accessible live region and focus moves predictably; and
- keyboard-only and reduced-motion behavior remain intact.

Preserve and run:

- `apps/workflow-platform/__tests__/configuration-renderer.test.tsx`;
- `apps/workflow-platform/__tests__/configuration-surface-bff.test.ts`; and
- `apps/workflow-platform/__tests__/configuration-surface-registry.test.ts`.

## 5. Exact command sequence

Use the workspace's existing install. If pnpm attempts an unrelated modules purge, set
`pnpm_config_verify_deps_before_run=false` for the checked-in command; do not alter dependencies merely to
make a test start.

### Focused static and automated checks

```text
pnpm_config_verify_deps_before_run=false pnpm --filter @gigalibs/contracts build
pnpm_config_verify_deps_before_run=false pnpm --filter @gigalibs/configuration-core build
pnpm_config_verify_deps_before_run=false pnpm exec vitest run --config vitest.config.ts \
  packages/contracts/src/configuration/response-contracts.test.ts \
  packages/configuration-core/src/index.test.ts \
  packages/configuration-core/src/index.property.test.ts \
  packages/configuration-core/src/compatibility.test.ts
pnpm_config_verify_deps_before_run=false pnpm --filter @gigalibs/app-playground-api test
pnpm_config_verify_deps_before_run=false pnpm --filter @gigalibs/workflow-platform typecheck
pnpm_config_verify_deps_before_run=false pnpm exec vitest run --config vitest.config.ts \
  apps/workflow-platform/__tests__/configuration-renderer.test.tsx \
  apps/workflow-platform/__tests__/configuration-surface-bff.test.ts \
  apps/workflow-platform/__tests__/configuration-surface-registry.test.ts
pnpm_config_verify_deps_before_run=false pnpm audit:configuration-contracts
pnpm_config_verify_deps_before_run=false pnpm audit:configuration-deployment-profile
pnpm_config_verify_deps_before_run=false pnpm audit:configuration-observability
```

Package names must be confirmed from their manifests immediately before execution. A command that selects
no project is a failure, not a pass.

The 2026-09-23 baseline proved that the package-local `@gigalibs/contracts test` script selects no files
because its shared include paths are root-relative. Therefore the explicit root-level Vitest paths above
are authoritative until the package test script is separately corrected. Zero selected tests never counts
as success.

### Exact-image local certification

Build new revision/source-state-bound migrations, API and web images using the accepted local image path.
Start only the existing Local Development topology, then run or extend the durable verifiers to prove:

```text
API live/ready and web live/ready
required/invalid/missing runtime-environment startup matrix
current, legacy-match, legacy-mismatch and preview HTTP matrix
two tenants with distinct activations and values
role, membership, user and tenant revocation
API/web restart and authoritative checksum/value reload
PostgreSQL outage/recovery
100 current-manifest reads at concurrency 10
automated Configuration accessibility
generated-data cleanup
```

Use the accepted F2 budgets unless named reviewers replace them: p95 at most 500 ms and p99 at most one
second for the 100-read local characterization. This is not a production availability or capacity claim.

### Repository gate

Run all mandatory commands exactly as required by `AGENTS.md`:

```text
pnpm build
pnpm test
pnpm audit:production-data
pnpm audit:all-runtime-data
pnpm audit:package-dependencies
pnpm audit:api-boundary
pnpm audit:navigation
pnpm audit:sdlc
```

The baseline Analytics/CMMS/quarantine failures are recorded in the WI-OI-047 gate summary. Re-run and
compare them. A new or worsened failure in WI-OI-046 scope blocks handoff. An unchanged external failure
must remain red and routed; it is never rewritten as a TP-1 pass.

## 6. Manual application review

Using two attributable non-production tenants and real persisted sessions, a human reviewer verifies:

1. Tenant A activates the optional Tenant Profile field for the visible explicit local environment/cohort.
2. A normal Tenant Settings user sees the active field without the browser sending environment/cohort.
3. The resolved policy/version evidence is safe and understandable.
4. Tenant B cannot observe Tenant A's descriptor, activation, field or value through URLs or payloads.
5. Revoking the user or membership removes access without service restart.
6. Missing manifest, denied, validation/conflict and dependency-failure states are visible and actionable.
7. Keyboard-only operation, screen reader, 200%/400% zoom, high contrast and reduced motion pass.

Record human name, responsibility, exact image/source identity, browser/assistive technology, decision,
conditions and date. Screenshots support UX review but do not prove security or persistence.

## 7. Stop and cleanup rules

Stop immediately for cross-tenant visibility, browser-controlled cohort authority, startup fallback,
credential exposure, lost acknowledged value, incompatible response removal, migration drift or a
production-reachable mock/fallback.

Deactivate or delete generated identities and tenant data through the accepted cleanup path. Record zero
active generated users, memberships and tenants. Preserve failed evidence records; create a later corrected
record rather than overwriting history.

## 8. QA decision

QA/SDET must record `Accept`, `Conditional` or `Reject` for this plan in the WI-OI-046 G3 decision record.
An agent cannot check the QA pre-flight box. Until that named decision and all other pre-flight decisions
exist, this document is a proposed verification contract only.
