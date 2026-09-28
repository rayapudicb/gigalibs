# WI-OI-046 API Contracts decision request

Date: 2026-09-24  
Scope: SP-01–SP-03, SP-05 and SP-06 for bounded TP-1 Local Development  
Status: agent-executable contract precheck complete; named human decision pending

## Decision boundary

This packet asks a named API Contracts reviewer to accept, condition or reject the pre-implementation
wire-compatibility and registry contract. It does not claim TP-1 is implemented, authorize product code,
or authorize production, cloud, external release or TP-2–TP-6.

Security, IAM/Tenancy, Web/Accessibility and QA decisions remain separate. API acceptance cannot waive
them.

## Current contract truth

| Current behavior | Verified fact | TP-1 implication |
| --- | --- | --- |
| Legacy runtime query | Strict schema accepts module/entity/surface plus environment/cohort and silently defaults the latter to `local-uat`/`all-users` | Preserve the route but replace default/selection semantics with optional match-only assertions |
| Legacy runtime response | Strict five-field response: activation ID, published-version ID, activation time, manifest and checksum | Preserve this exact response for strict existing decoders |
| OpenAPI legacy response | `additionalProperties: false` and the same five required fields | Adding resolved scope fields to this response would break strict compatibility |
| Normal runtime route | Only `/configuration/runtime/manifest` exists | Add separate `/configuration/runtime/manifest/current` route and contract |
| Preview boundary | No TP-1 privileged-preview route exists | Add a distinct preview query/response boundary; do not overload normal runtime |
| Activation input | Environment and cohort silently default | Remove defaults; administrative activation/rollback omission becomes invalid |
| Error contract | Generic `Problem` permits additional properties and current service uses string exceptions | Add a separately named strict safe TP-1 error envelope and stable codes |
| Adapter registry | TP-1 registry/descriptor does not exist | Add exact-key, duplicate-rejecting, deeply immutable code-owned registry |

The current contracts, controller and service are the compatibility baseline. Their green tests do not
prove the future TP-1 routes or registry.

## Agent-executable baseline

- `@gigalibs/contracts` build: PASS.
- `@gigalibs/configuration-core` build: PASS.
- Four preserved contract/compiler files: 30 tests PASS.
- Configuration contract audit: PASS with 11 outcomes and all 32 controller operations documented.
- The audit explicitly retains independent API/client review as a release limitation.

## Contract decisions required

### 1. Legacy/current compatibility — SP-02

The reviewer must accept, amend or reject all of these rules:

1. Legacy `GET /configuration/runtime/manifest` keeps its exact strict five-field response.
2. Legacy `environmentKey` and `cohortKey` become optional assertions only; no silent defaults remain.
3. If a supplied assertion differs from server resolution, return
   `CONFIGURATION_RUNTIME_SCOPE_DENIED` before manifest cache or database access.
4. New `GET /configuration/runtime/manifest/current` has a separately named strict v1 query containing
   only `moduleKey`, `entityKey` and `surfaceKey`.
5. The current-runtime response is separately named and strict. It contains the legacy manifest identity
   plus versioned server-resolved environment, cohort and policy evidence.
6. Existing camel-case HTTP field names remain unchanged.
7. Legacy deprecation and sunset metadata are documented. Removal requires measured absence of legacy
   consumers and a separately accepted compatibility change.

### 2. Preview and authority inputs — SP-01/SP-03

1. Preview uses a distinct strict query accepting explicit environment/cohort assertions for privileged
   Studio use.
2. Preview requires both `configuration-runtime:read` and `configuration:read` and remains tenant-bound.
3. Browser tenant/environment/cohort values never establish authority or normal cohort membership.
4. Normal current-runtime accepts no browser-supplied scope authority.
5. The adapter policy maps Configuration identity to canonical entitlement key `tenant-access` without
   changing serialized module/entity/surface keys.

### 3. Activation compatibility

1. Remove `local-uat` and `all-users` defaults from `ActivateConfigurationSchema` and OpenAPI.
2. Activation and rollback require explicit environment and cohort.
3. Existing callers that already send both values remain compatible.
4. Callers relying on omission must fail validation; this is an intentional correction of unsafe
   omission behavior and must be documented as such.

### 4. Strict safe errors — SP-05

The new strict error contract must support these stable outcomes:

| Code | HTTP status |
| --- | ---: |
| `CONFIGURATION_ADAPTER_NOT_FOUND` | 404 |
| `CONFIGURATION_ADAPTER_INCOMPATIBLE` | 409 |
| `CONFIGURATION_RUNTIME_SCOPE_UNAVAILABLE` | 503 |
| `CONFIGURATION_RUNTIME_SCOPE_DENIED` | 403 |
| `CONFIGURATION_MANIFEST_UNAVAILABLE` | 404 |

The envelope and messages must not reveal another tenant, activation, entitlement, role, permission,
adapter inventory, database topology or configuration value. Unknown response fields are rejected.

### 5. Adapter/registry contract — SP-06

1. `ModuleAdapterDescriptorV1` is a strict versioned contract.
2. Registry lookup uses exact `(moduleKey, entityKey, surfaceKey)` identity.
3. Duplicate exact keys fail application startup before readiness.
4. Returned descriptors are deeply immutable or defensive deeply immutable copies; nested mutation cannot
   alter stored registry state.
5. Unknown adapter, version, capability, owner, field or operation fails closed.
6. The descriptor exposes no table name, SQL, URL, repository callback or tenant-authored executable
   handler.
7. Existing `ConfigurationSurfaceRegistration` serialization remains backward-decodable.

## Required implementation evidence

After an authorized Build, the API reviewer must receive:

- old strict query/response fixtures and new current/preview strict fixtures;
- unknown-field rejection for every new query, response, error and descriptor;
- legacy omission/match/mismatch tests proving no client assertion selects authority;
- preview permission matrix and tenant-negative tests;
- all five stable error fixtures with information-disclosure assertions;
- duplicate-startup, exact-lookup and nested-mutation registry tests;
- explicit activation omission rejection and existing explicit-request compatibility tests;
- updated OpenAPI operation/response coverage; and
- measurable deprecation/sunset criteria without immediate legacy removal.

## Reviewer inspection commands

Run from `/Users/rayapudi/dev/gigalibs`:

```text
sed -n '250,310p' packages/contracts/src/configuration/index.ts
sed -n '565,595p' packages/contracts/src/configuration/index.ts
sed -n '184,204p' docs/contracts/configuration-studio/openapi.yaml
sed -n '1094,1115p' docs/contracts/configuration-studio/openapi.yaml
sed -n '390,415p' apps/playground-api/src/configuration-studio.controller.ts
sed -n '1796,1840p' apps/playground-api/src/configuration-studio.service.ts
sed -n '14,61p' docs/reviews/WI-OI-046-sp01-sp07-resolution-request-2026-09-23.md
sed -n '86,183p' docs/audits/2026-09-22-wi-oi-046-g3-readiness.md
```

Expected automated result is recorded by the refreshed focused baseline: both builds pass, the four
contract/compiler files pass 30 tests, and the Configuration contract audit passes all 11 outcomes across
32 documented operations.

## Human decision form

```text
I, [full human name], reviewed WI-OI-046 as the independent API Contracts reviewer against
docs/reviews/WI-OI-046-api-contracts-decision-request-2026-09-24.md and the frozen WI-OI-046 design
evidence. My decision for SP-01–SP-03, SP-05 and SP-06, including exact legacy/current compatibility,
explicit activation scope, strict safe errors and exact-key immutable registry behavior, is
[Accept / Conditional / Reject]. I confirm that the green baseline proves only current compatibility and
does not claim TP-1 is implemented. Conditions/findings: [exact text]. This does not authorize G4
implementation, production, cloud, external release or TP-2–TP-6. I am [independent / not independent]
from the implementation producer. Date: [YYYY-MM-DD].
```

The reviewer must state their professional responsibility. A design acceptance cannot replace the
post-implementation contract fixtures and authenticated HTTP evidence.
