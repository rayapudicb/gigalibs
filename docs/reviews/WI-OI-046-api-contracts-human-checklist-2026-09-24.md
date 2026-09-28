# WI-OI-046 API Contracts — Human Reviewer Checklist

**Date:** 2026-09-24  
**Reviewer role:** Independent API Contracts  
**Work item:** WI-OI-046 — Tenant Profile TP-1 Local Development  
**Scope:** SP-01–SP-03 (authority and compatibility), SP-05 (safe errors), SP-06 (adapter registry)  
**Preparation note:** Agent B produced the initial standalone draft under
`docs/plans/WI-OI-046-parallel-review-agent-b-prompt.md`; the primary agent subsequently reconciled its
commands and claims against the repository. It remains a human execution guide only. No implementation
was created and no status was changed.

---

## Before you begin

1. Confirm you are **not** a producer of WI-OI-046 implementation code.
2. Read `docs/reviews/WI-OI-046-api-contracts-decision-request-2026-09-24.md` in full.
3. Read `docs/reviews/WI-OI-046-sp01-sp07-resolution-request-2026-09-23.md` lines 14–61.
4. Review `docs/audits/2026-09-22-wi-oi-046-g3-readiness.md` lines 86–183 for contract audit context.
5. This checklist does not authorize G4 implementation, production, cloud, external release, or
   TP-2–TP-6. Your completed decision records the pre-Build API Contracts disposition only.

---

## Section 1 — Agent-verified baseline (confirm, do not re-run unless you choose to)

Results verified on 2026-09-24 and recorded in
`docs/audits/2026-09-24-wi-oi-046-focused-prebuild-baseline.md`.

| # | Claimed result | Re-run command | Your independent result |
|---|----------------|----------------|------------------------|
| 1.1 | `@gigalibs/contracts` build: **PASS** | `pnpm --config.verify-deps-before-run=false --filter @gigalibs/contracts build` | ☐ PASS / ☐ FAIL |
| 1.2 | `@gigalibs/configuration-core` build: **PASS** | `pnpm --config.verify-deps-before-run=false --filter @gigalibs/configuration-core build` | ☐ PASS / ☐ FAIL |
| 1.3 | Contract/compiler tests: **4 files, 30 tests PASS** | `pnpm --config.verify-deps-before-run=false exec vitest run --config vitest.config.ts packages/contracts/src/configuration/response-contracts.test.ts packages/configuration-core/src/index.test.ts packages/configuration-core/src/index.property.test.ts packages/configuration-core/src/compatibility.test.ts` | ☐ PASS / ☐ FAIL |
| 1.4 | Configuration contract audit: **11 outcomes, 32 operations documented** | `CONFIGURATION_CONTRACT_EVIDENCE_PATH=/private/tmp/wi-oi-046-contract-review.json pnpm --config.verify-deps-before-run=false audit:configuration-contracts` | ☐ PASS / ☐ FAIL |

**Important:** Green baseline proves current contract compatibility only. It does not prove the future
TP-1 routes, new strict schemas, preview boundary, or adapter registry.

---

## Section 2 — Source code inspection

Run each command from `/Users/rayapudi/dev/gigalibs`:

### 2.1 — Current runtime query and response contracts

```
sed -n '258,288p' packages/contracts/src/configuration/index.ts
sed -n '565,590p' packages/contracts/src/configuration/index.ts
```

Verify you can see:
- [ ] The current strict runtime query accepts module, entity, surface, environment and cohort;
      environment/cohort currently default to `local-uat`/`all-users`
- [ ] The separate strict response contains exactly activation ID, published-version ID, activation time,
      manifest and checksum
- [ ] No TP-1 current-runtime (`/manifest/current`) schema exists yet (expected gap)

**Your finding:**

```
[paste key lines here]
```

### 2.2 — Error contract baseline

```
sed -n '1094,1115p' docs/contracts/configuration-studio/openapi.yaml
```

Verify:
- [ ] Existing OpenAPI `Problem` schema allows `additionalProperties`
- [ ] No stable `CONFIGURATION_*` error codes are defined yet (expected — TP-1 gap)
- [ ] The five new required stable codes are **absent**: `CONFIGURATION_ADAPTER_NOT_FOUND`,
      `CONFIGURATION_ADAPTER_INCOMPATIBLE`, `CONFIGURATION_RUNTIME_SCOPE_UNAVAILABLE`,
      `CONFIGURATION_RUNTIME_SCOPE_DENIED`, `CONFIGURATION_MANIFEST_UNAVAILABLE`

**Your finding:**

```
[paste key lines here]
```

### 2.3 — OpenAPI: current runtime response

```
sed -n '184,204p' docs/contracts/configuration-studio/openapi.yaml
sed -n '1090,1108p' docs/contracts/configuration-studio/openapi.yaml
```

Verify:
- [ ] The current `/configuration/runtime/manifest` path is documented
- [ ] Response schema is strict with `additionalProperties: false` and the five required fields
- [ ] No TP-1 `/manifest/current` path exists yet in the spec (expected gap)

**Your finding:**

```
[paste key lines here]
```

### 2.4 — OpenAPI: activation schema

```
sed -n '545,560p' docs/contracts/configuration-studio/openapi.yaml
```

Verify:
- [ ] `environmentKey` and `cohortKey` currently have defaults (`local-uat` and `all-users`)
- [ ] These defaults would need to be removed in TP-1 (you will decide this as a required change)
- [ ] You can observe that removing defaults would break callers relying on omission (intentional correction)

**Your finding:**

```
[paste key lines here]
```

### 2.5 — Controller: current route coverage

```
sed -n '390,415p' apps/playground-api/src/configuration-studio.controller.ts
```

Verify:
- [ ] Only `/configuration/runtime/manifest` exists (no `/manifest/current`, no preview route)
- [ ] The route requires `configuration-runtime:read` permission
- [ ] Browser-supplied environment/cohort query values currently select the requested scope, while omitted
      values receive schema defaults; TP-1 must convert supplied legacy values to match-only assertions

**Your finding:**

```
[paste key lines here]
```

### 2.6 — Service: current runtime query

```
sed -n '1796,1840p' apps/playground-api/src/configuration-studio.service.ts
```

Verify:
- [ ] The service receives environment/cohort strings after query parsing and uses them directly in the
      manifest cache/database scope; the current query schema applies the silent defaults upstream
- [ ] No server-resolved scope evidence is returned in the response (TP-1 gap)
- [ ] Adapter registry lookup does not yet exist (TP-1 gap)

**Your finding:**

```
[paste key lines here]
```

---

## Section 3 — Legacy/current compatibility decision (SP-02)

For each rule, mark **Accept**, **Conditional**, or **Reject**:

| Rule | Your decision |
|------|---------------|
| 3.1 Legacy `GET /configuration/runtime/manifest` keeps its exact strict five-field response | ☐ Accept / ☐ Conditional / ☐ Reject |
| 3.2 Legacy `environmentKey`/`cohortKey` become optional assertions only; no silent defaults remain | ☐ Accept / ☐ Conditional / ☐ Reject |
| 3.3 If a supplied assertion differs from server resolution → `CONFIGURATION_RUNTIME_SCOPE_DENIED` before cache or DB access | ☐ Accept / ☐ Conditional / ☐ Reject |
| 3.4 New `GET /configuration/runtime/manifest/current` uses a separately named strict v1 query with only `moduleKey`, `entityKey`, `surfaceKey` | ☐ Accept / ☐ Conditional / ☐ Reject |
| 3.5 Current-runtime response is separately named/strict; adds versioned server-resolved environment, cohort, and policy evidence to the legacy manifest identity | ☐ Accept / ☐ Conditional / ☐ Reject |
| 3.6 Existing camel-case HTTP field names remain unchanged | ☐ Accept / ☐ Conditional / ☐ Reject |
| 3.7 Legacy deprecation/sunset metadata documented; removal requires measured absence of legacy consumers and a separately accepted compatibility change | ☐ Accept / ☐ Conditional / ☐ Reject |

**Conditions or findings for SP-02:**

```
[your text here]
```

---

## Section 4 — Preview and authority inputs decision (SP-01/SP-03)

| Rule | Your decision |
|------|---------------|
| 4.1 Preview uses a distinct strict query accepting explicit environment/cohort assertions for privileged Studio use only | ☐ Accept / ☐ Conditional / ☐ Reject |
| 4.2 Preview requires both `configuration-runtime:read` and `configuration:read`; remains tenant-bound | ☐ Accept / ☐ Conditional / ☐ Reject |
| 4.3 Browser-supplied tenant/environment/cohort values never establish authority or normal cohort membership | ☐ Accept / ☐ Conditional / ☐ Reject |
| 4.4 Normal current-runtime accepts no browser-supplied scope authority | ☐ Accept / ☐ Conditional / ☐ Reject |
| 4.5 Adapter policy maps Configuration identity to `tenant-access` without changing serialized module/entity/surface keys | ☐ Accept / ☐ Conditional / ☐ Reject |

**Conditions or findings for SP-01/SP-03 API boundary:**

```
[your text here]
```

---

## Section 5 — Activation compatibility decision

| Rule | Your decision |
|------|---------------|
| 5.1 Remove `local-uat` and `all-users` defaults from `ActivateConfigurationSchema` and OpenAPI | ☐ Accept / ☐ Conditional / ☐ Reject |
| 5.2 Activation and rollback require explicit environment and cohort | ☐ Accept / ☐ Conditional / ☐ Reject |
| 5.3 Existing callers that already send both values remain compatible | ☐ Accept / ☐ Conditional / ☐ Reject |
| 5.4 Callers relying on omission must fail validation; this is an intentional correction of unsafe omission behavior and must be documented as such | ☐ Accept / ☐ Conditional / ☐ Reject |

**Conditions or findings for activation compatibility:**

```
[your text here]
```

---

## Section 6 — Strict safe error contract decision (SP-05)

Verify each required stable code and its HTTP status:

| Code | Required HTTP | Your decision |
|------|:-------------:|---------------|
| `CONFIGURATION_ADAPTER_NOT_FOUND` | 404 | ☐ Accept / ☐ Conditional / ☐ Reject |
| `CONFIGURATION_ADAPTER_INCOMPATIBLE` | 409 | ☐ Accept / ☐ Conditional / ☐ Reject |
| `CONFIGURATION_RUNTIME_SCOPE_UNAVAILABLE` | 503 | ☐ Accept / ☐ Conditional / ☐ Reject |
| `CONFIGURATION_RUNTIME_SCOPE_DENIED` | 403 | ☐ Accept / ☐ Conditional / ☐ Reject |
| `CONFIGURATION_MANIFEST_UNAVAILABLE` | 404 | ☐ Accept / ☐ Conditional / ☐ Reject |

Additionally confirm:
- [ ] Error envelope and messages **must not reveal**: another tenant, activation, entitlement, role,
      permission, adapter inventory, database topology, or configuration value
- [ ] Unknown response fields are rejected (strict envelope)

**Conditions or findings for SP-05:**

```
[your text here]
```

---

## Section 7 — Adapter/registry contract decision (SP-06)

| Rule | Your decision |
|------|---------------|
| 7.1 `ModuleAdapterDescriptorV1` is a strict versioned contract | ☐ Accept / ☐ Conditional / ☐ Reject |
| 7.2 Registry lookup uses exact `(moduleKey, entityKey, surfaceKey)` triple | ☐ Accept / ☐ Conditional / ☐ Reject |
| 7.3 Duplicate exact keys fail application startup before readiness | ☐ Accept / ☐ Conditional / ☐ Reject |
| 7.4 Returned descriptors are deeply immutable; nested mutation cannot alter stored registry state | ☐ Accept / ☐ Conditional / ☐ Reject |
| 7.5 Unknown adapter, version, capability, owner, field, or operation fails closed | ☐ Accept / ☐ Conditional / ☐ Reject |
| 7.6 Descriptor exposes no table name, SQL, URL, repository callback, or tenant-authored executable handler | ☐ Accept / ☐ Conditional / ☐ Reject |
| 7.7 Existing `ConfigurationSurfaceRegistration` serialization remains backward-decodable | ☐ Accept / ☐ Conditional / ☐ Reject |

**Conditions or findings for SP-06:**

```
[your text here]
```

---

## Section 8 — Post-Build evidence you will require

Confirm you will require all of the following before closing API Contracts review:

- [ ] Old strict query/response fixtures and new current/preview strict fixtures
- [ ] Unknown-field rejection for every new query, response, error envelope, and descriptor
- [ ] Legacy omission/match/mismatch tests proving no client assertion selects authority
- [ ] Preview permission matrix (both permissions, each missing, missing both) and tenant-negative tests
- [ ] All five stable error fixtures with information-disclosure assertions
- [ ] Duplicate-startup, exact-lookup, and nested-mutation registry tests
- [ ] Activation omission rejection and existing explicit-request compatibility tests
- [ ] Updated OpenAPI with full operation/response coverage
- [ ] Measurable deprecation/sunset criteria without immediate legacy removal

---

## Section 9 — Human decision

Complete this form and provide it to the primary agent for attachment to the WI-OI-046 decision record.

```
I, [full human name], reviewed WI-OI-046 as the independent API Contracts reviewer against
docs/reviews/WI-OI-046-api-contracts-decision-request-2026-09-24.md and the frozen WI-OI-046 design
evidence. My decision for SP-01–SP-03, SP-05 and SP-06, including exact legacy/current compatibility,
explicit activation scope, strict safe errors and exact-key immutable registry behavior, is
[Accept / Conditional / Reject]. I confirm that the green baseline proves only current compatibility and
does not claim TP-1 is implemented. Conditions/findings: [exact text or "None"]. This does not authorize
G4 implementation, production, cloud, external release or TP-2–TP-6. I am [independent / not independent]
from the implementation producer. Date: [YYYY-MM-DD].
```

---

*Initially drafted by Agent B and reconciled by the primary agent on 2026-09-24. Neither agent has
authority to close this review or mark human acceptance. WI-OI-046 remains Proposed and no implementation
was created by this checklist work.*
