# WI-OI-046 QA/SDET decision request

Date: 2026-09-24  
Scope: SP-01–SP-07 and bounded TP-1 Local Development verification  
Status: agent-executable QA precheck complete; named human decision pending  
Agent QA recommendation: **Conditional**

## Decision boundary

This packet asks a named QA/SDET reviewer to accept, condition or reject the WI-OI-046 verification
contract. It does not claim TP-1 is implemented, authorize product code, or authorize production, cloud,
external release or TP-2–TP-6.

The green baseline proves that the current foundation is stable. It does not prove the future adapter,
registry, server-owned scope, entitlement check, API contracts, web states or accessibility journey.
Security, IAM/Tenancy, API Contracts and Web/Accessibility decisions remain independently required.

## Fresh baseline result

The exact focused sequence in `docs/plans/WI-OI-046-tp1-verification-plan.md` was rerun on 2026-09-24:

| Check | Result |
| --- | --- |
| Contracts build | PASS |
| Configuration Core build | PASS |
| Contract/compiler tests | PASS — 4 files, 30 tests |
| Playground API tests | PASS — 10 files, 47 tests |
| Workflow Platform typecheck | PASS |
| Focused workflow tests | PASS — 3 files, 10 tests |
| Configuration contract audit | PASS — 11 outcomes, 32 operations |
| Local deployment-profile audit | PASS — 51 required API environment keys |
| Static observability audit | PASS — 13 metrics, 6 alerts, 16 panels, 8 outcomes |

Total focused tests: **87 passing across 17 files**. No product code, dependency, schema, migration or
lockfile was changed by this QA precheck.

## Current verification-plan assessment

The proposed plan correctly includes:

- strict contract, unknown-field and compatibility tests;
- duplicate registry rejection and deep immutability;
- required/invalid/missing server environment startup behavior;
- current, legacy assertion and privileged-preview boundaries;
- current-state revocation and two-tenant isolation;
- real PostgreSQL authenticated HTTP, cache/invalidation and restart evidence;
- complete visible web states and post-Build accessibility review;
- exact-image Local Development certification;
- repository gates, stop rules and generated-data cleanup; and
- explicit exclusion of TP-2–TP-6, cloud, Helm and production claims.

The plan is not yet an unconditional QA acceptance contract because several release-evidence details are
implicit. The following amendments must be accepted before G4 and implemented before G5 handoff.

## Required QA amendments

### QA-01 — Stable requirement-to-test trace

Create one machine-readable trace record mapping every applicable ID below to design decision, changed
file, executable test, evidence file and result:

```text
D5-CTX-001 through D5-CTX-008
D5-META-001 through D5-META-012
FR-01, FR-05, FR-14, FR-15
applicable WI-OI-046 NFR-GOV, NFR-SEC, NFR-DATA, NFR-REL,
NFR-PERF, NFR-OBS, NFR-UX and NFR-OPS requirements
```

No ID may pass through a source link or producer statement alone. A not-applicable result requires a
reason and named reviewer acceptance.

### QA-02 — Real-dependency classification

Every recorded check must declare one execution class:

| Class | Permitted use |
| --- | --- |
| Unit/contract test double | Logic and hostile-fixture coverage only; never real-dependency proof |
| Real local dependency | PostgreSQL 16, authenticated control-plane HTTP, web BFF/browser and two real API replicas |
| Controlled fault injection | Missing/invalid environment, PostgreSQL interruption, stale notification and process restart |
| Manual human review | Product comprehension, keyboard, screen reader, zoom and high contrast |

The release evidence must use attributable non-production identities and persisted tenant data. A mocked
token, in-memory tenant, fabricated manifest, static successful payload or browser-only authorization is
not acceptable integration evidence.

MinIO may remain healthy as part of the accepted Local Development profile, but TP-1 must not claim object
storage behavior because the reference slice does not use it. External providers remain disabled.

### QA-03 — Exact HTTP and authority matrix

The authenticated real-HTTP matrix must record request, status, stable code and safe response shape for:

- current-runtime success with no browser environment/cohort parameters;
- rejection of unknown current-runtime query fields;
- legacy omission, matching assertion and mismatching assertion;
- preview success with both permissions and denial with each permission absent;
- missing, disabled, future and expired `tenant-access` entitlement;
- inactive tenant, user and membership plus role downgrade without restart;
- unknown adapter, incompatible adapter and unavailable manifest;
- Tenant A/Tenant B URL, identifier, cache and value substitution attempts; and
- activation omission rejection while explicit environment/cohort activation remains compatible.

Denial fixtures must assert absence of other-tenant identifiers, activation IDs, role/permission detail,
entitlement timing, adapter inventory, database topology and raw exception text.

### QA-04 — Concurrency, restart and cache proof

Certification must prove:

- duplicate canonical adapter keys prevent readiness deterministically;
- concurrent identical value writes have one idempotent outcome;
- concurrent stale writes have one winner and an explicit conflict loser;
- a missed invalidation is repaired from PostgreSQL authority;
- two replicas converge on the accepted checksum without cross-tenant cache keys;
- API and web process restart reload authoritative state; and
- acknowledged values and immutable activation history survive the tested PostgreSQL interruption.

### QA-05 — Web state and accessibility trace

Tests must cover all nine accepted SP-04 states and transitions:

```text
loading | absent | denied | invalid-scope | retryable-error |
ready | saving | conflict | saved
```

The stable response-to-state mapping is jointly frozen by the API Contracts and Web/Accessibility
decisions. Evidence must include overlapping-request cancellation, retry bounds, double-submit prevention,
authoritative conflict reload, focus/live-region behavior, field-error association and preserved safe
input. The three-browser axe result and signed manual keyboard, screen-reader, 200%/400% zoom,
high-contrast and reduced-motion notes must cover the Tenant Settings consumer, not only Studio.

### QA-06 — TP-1 observability and audit assertions

Static F2 observability remains a baseline, not TP-1 proof. Post-Build tests must establish:

- correlation IDs on current, legacy, preview and value-write outcomes;
- a sanitized administrative-read audit event for privileged preview;
- accepted/denied/unavailable/conflict outcome telemetry for the new boundaries;
- no tenant ID, user ID, cohort, manifest/value payload or unbounded identifier in metric labels;
- logs and safe errors contain stable codes without credentials or protected database detail; and
- restart/outage evidence can be followed from request to authoritative recovery.

If no new metric is required, QA must record which existing bounded metric represents each TP-1 outcome
and prove it through a live scrape. A static source inspection is insufficient.

### QA-07 — Performance characterization

The exact-image local run must issue 100 authenticated current-manifest reads at concurrency 10 and
record sample count, success count, unexpected error count, p50, p95, p99 and maximum. The accepted Local
Development limits remain:

- p95 at most 500 ms;
- p99 at most 1 second;
- zero unexpected failures; and
- zero cross-tenant or stale-checksum outcomes.

Report cold-start/restart observations separately from the timed steady-state sample. This is local
characterization and cannot be presented as production capacity or availability.

### QA-08 — Schema and migration stop rule

TP-1 is designed without a new table or persistence owner. Before and after implementation, capture the
canonical schema and migration-tree diff. Any new database table, column, migration or ownership change
stops the slice and requires migration design, forward migration, clean/upgrade verification and recovery
review before testing continues. Applied migrations must never be edited.

### QA-09 — Rebuilt-image and supply-chain identity

The migrations, API and web images must be rebuilt from the final accepted source state. Evidence records
must bind source-state SHA-256, image ID/digest, Dockerfile/build context and runtime identity. Re-run the
accepted exact-image vulnerability, secret, non-root and filesystem/SBOM checks for all changed images.

QA does not accept vulnerability risk. Any Critical/High result, secret match, unexpected root runtime,
identity mismatch or missing scan result is routed to Security/Supply Chain and blocks handoff.

### QA-10 — Test-data provenance and cleanup

The evidence bundle must record generated prefixes/IDs, creator, creation time, classification and cleanup
method without credentials or raw business values. Cleanup verification must distinguish:

- active identities, memberships and tenants: zero remaining or explicitly deactivated;
- mutable test configuration/value records: removed or retained only under the accepted test-data policy;
- immutable audit/outbox evidence: retained, visibly test-attributed and excluded from customer metrics;
- processes, ports, temporary databases and containers: stopped/removed as applicable; and
- cleanup failure: recorded as a failed outcome, never hidden by overwriting the evidence file.

### QA-11 — Repository regression disposition

Run every mandatory repository command from `AGENTS.md` after focused and exact-image certification.
A new or worsened failure in WI-OI-046 scope blocks handoff. An unchanged Analytics, CMMS or quarantine
failure remains red and linked to its owner; it is not converted into a TP-1 pass. Record command, exit
code, timestamp and scoped comparison against the pre-Build baseline.

### QA-12 — Defects, limitations and immutable evidence

Each evidence JSON must contain `verifier`, `timestamp`, `workItem`, `profile`, `sourceIdentity`, `status`,
`outcomes`, `failures`, `limitations` and `testDataCleanup`. A failed run is retained under its original
identity; a corrected run creates a new timestamped record. Open P0/P1 defects, cross-tenant visibility,
browser-controlled authority, a production-reachable fallback, credential exposure, lost acknowledged
data, incompatible legacy removal or unexplained evidence mismatch is an immediate No-Go.

## Required execution order after authorized Build

1. Capture source/candidate/Compose identities and verify no unexpected migration change.
2. Run contract, registry, API, BFF and component tests.
3. Run authenticated real-HTTP authority, two-tenant and revocation matrices.
4. Run two-replica invalidation, restart and PostgreSQL interruption/recovery.
5. Run web state, three-browser automated accessibility and manual assistive-technology review.
6. Run current-manifest local performance characterization and live TP-1 observability checks.
7. Build and scan exact migrations/API/web images and bind their runtime identities.
8. Run all repository gates and compare known external failures truthfully.
9. Execute and verify cleanup; retain immutable failed and successful evidence.
10. Produce the requirement-to-test trace and obtain independent post-Build decisions.

The sequence stops at the first security, tenancy, data-loss, compatibility, secret or evidence-identity
violation. Continuing diagnostic work may use the failed environment, but no later result can overwrite
or transform that failure into a pass.

## Reviewer inspection commands

Run from `/Users/rayapudi/dev/gigalibs`:

```text
sed -n '1,260p' docs/plans/WI-OI-046-tp1-verification-plan.md
sed -n '1,130p' docs/reviews/WI-OI-046-iam-tenancy-decision-request-2026-09-24.md
sed -n '1,180p' docs/reviews/WI-OI-046-api-contracts-decision-request-2026-09-24.md
sed -n '1,220p' docs/reviews/WI-OI-046-web-accessibility-decision-request-2026-09-24.md
sed -n '1,230p' docs/reviews/WI-OI-047-WI-OI-046-security-decision-request-2026-09-24.md
sed -n '1,180p' docs/audits/2026-09-24-wi-oi-046-focused-prebuild-baseline.md
sed -n '1,180p' docs/audits/2026-09-24-wi-oi-046-prebuild-collision-audit.md
```

The focused command sequence is listed exactly in section 5 of the verification plan. A command that
selects zero tests, uses a test double as integration proof or exits non-zero cannot be reported as a
pass.

## Human decision form

```text
I, [full human name], reviewed WI-OI-046 as the independent QA/SDET reviewer against
docs/reviews/WI-OI-046-qa-sdet-decision-request-2026-09-24.md, the TP-1 verification plan and the frozen
WI-OI-046 design evidence. My decision for the SP-01–SP-07 verification contract is
[Accept with QA-01 through QA-12 incorporated / Conditional / Reject]. I confirm that the 87-test green
baseline proves only the current foundation and does not claim TP-1 is implemented. Conditions/findings:
[exact text]. This does not authorize G4 implementation, production, cloud, external release or
TP-2–TP-6. I am [independent / not independent] from the implementation producer. Date: [YYYY-MM-DD].
```

The reviewer must state their professional responsibility. A pre-Build QA plan decision cannot replace
post-implementation evidence, defect disposition or final release acceptance.
