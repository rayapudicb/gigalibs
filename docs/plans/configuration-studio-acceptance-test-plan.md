# Configuration Studio acceptance test plan

Status: Proposed G3 test design for WI-OI-039; independent QA acceptance required  
System under test: CS-01 through CS-09 and one module-owned reference adapter

## 1. Certification outcome

Certification proves that an authorized configuration change becomes a checksummed active manifest and a
module-owned persisted value without tenant leakage, permission bypass, fabricated data or unsafe rollback.
Package tests and UI screenshots alone do not satisfy this result.

## 2. Required environments and evidence

- clean and upgraded PostgreSQL 16 databases plus a restored-backup copy;
- at least two isolated tenants, distinct admin/member/viewer roles and one suspended member;
- two application replicas to exercise cache/event convergence;
- attributable synthetic UAT records excluded from value reporting and deleted after retention checks;
- browser, API, database, audit/outbox, metrics/trace and migration evidence tied to correlation IDs;
- no enabled AI or external provider for the base certification.

## 3. Reference journeys

### Journey A: tenant profile extension

1. Tenant A administrator creates optional `operating_region_note` for the registered profile edit surface.
2. The compiler validates the field, classification, permissions, layout and compatibility.
3. A distinct authorized reviewer approves the exact checksum.
4. An activator publishes and activates the immutable version for Tenant A UAT.
5. Tenant A member writes a permitted value through the profile API.
6. The value survives refresh and application/database restart and appears in authorized export.
7. Tenant A viewer receives masked or denied behavior according to policy.
8. Tenant B cannot discover the definition, manifest, value, search projection, audit or cache entry.
9. Rollback selects the last-good manifest; historical value remains retained and governed.
10. Erasure/export behavior follows the owning profile record policy.

### Journey B: AR invoice extension

1. Register `customer_po_reference` as an optional non-financial field on customer and invoice-draft surfaces.
2. Persist it through the owning AR API and PostgreSQL transaction.
3. Issue an invoice and pin the field value, schema version, manifest checksum and template version.
4. Change/deprecate the active field configuration.
5. Prove the issued invoice still renders and exports from its immutable snapshot.
6. Prove the field cannot change quantity, unit price, currency, tax basis, totals, ledger state or invoice transitions.

## 4. Test matrix

| Area | Required scenarios | Pass condition |
| --- | --- | --- |
| Registry | Unknown, duplicate, reserved and unauthorized keys; incompatible component/type | Invalid entries rejected before storage/publication |
| Change sets | Create, edit, abandon, stale `If-Match`, concurrent authors | One deterministic winner; no overwritten draft |
| Compilation | Same input, unknown properties, invalid reference, cycle, depth/size abuse | Stable checksum; unsafe documents fail closed |
| Expressions | Every operator/type pair, missing value, hostile content, deep AST | Client/server parity within resource limits; no code/network execution |
| Compatibility | Optional add, rename label, required add, tighten rule, type/key change, used-option removal | Correct class and migration/activation gate |
| Review | Self-approval denial where required, checksum changed after approval, unauthorized reviewer | Approval binds exact checksum and separation policy |
| Publication | Retry/replay, concurrent publish, transaction failure | One immutable version and one auditable outcome |
| Activation | Preview/UAT/canary/all, missing dependency, event loss, replica restart, failure and rollback | All replicas converge or fail closed; last-good restored |
| Rendering | Create/edit/read/list; loading/empty/denied/stale/error/success; unknown component | Accessible complete states; unsupported component fails closed |
| Field security | Read/write/read-only/write-only/masked/export permissions | Server response and mutation enforce effective field policy |
| Module adapter | Unknown field, stale checksum, invariant violation, partial transaction failure | No partial record/value/audit/outbox write |
| Persistence | Refresh, app restart, DB restart, backup/restore | Version, activation and values remain consistent |
| Tenancy | API, DB, cache, search, export, audit and package negative cases | Zero cross-tenant disclosure or mutation |
| Projection | Approved index, backfill checkpoint, rebuild, failure, permission filtering | Activation waits where required; query preserves policy |
| ALM | Export/import signature, dependency, environment binding, drift, secret/business-data scan | Definitions only; tampering and unsafe drift rejected |
| Observability | Correlation, metrics, trace, alert and runbook | Operator can identify actor/tenant/version/outcome without sensitive payload |
| Performance | Cold/warm manifest, 250 fields, concurrent reads/edits, projection load | Meets independently agreed budgets without bypassing validation/security |
| Accessibility | Keyboard, focus, labels/errors, screen reader, zoom, locale, reduced motion | WCAG 2.2 AA automation plus recorded manual review |
| Recovery | Bad activation, cache poison, lost event, restore, forward fix | Tested recovery preserves immutable snapshots and audit lineage |
| AI, optional | Provider disabled/down, hostile prompt, sensitive input, malformed output, publish request | Manual Studio works; proposal is bounded; publish/activation impossible |

## 5. Required negative security cases

- forged tenant, role, field permission, published-version and checksum values;
- active token after user/member/tenant suspension or role downgrade;
- mass-assignment of canonical, immutable and hidden fields;
- HTML/script payloads in label, help, option and extension values;
- expression bombs, cyclic references, oversized payloads and unregistered pattern keys;
- IDOR across change set, version, activation, manifest, value, audit and package identifiers;
- cache-key omission for tenant, role/field policy, locale or checksum;
- package with secret reference value, business records, altered signature or undeclared dependency;
- replayed publication/activation/module-write commands with same and different request checksums.

## 6. Mandatory certification commands

The implementation work item must add focused contract, compiler, API, migration, renderer, adapter and
browser commands. The compiler and compatibility-policy suite is:

```text
pnpm --filter @gigalibs/configuration-core test
```

Its fixed seed (`0x5eedc0de`) covers 600 arbitrary JSON documents, 180 valid definitions after deep
object-key reordering and 180 generated runtime-value sets. Focused transition tests cover optional and
required additions, presentation-only edits, type/key changes, option removal, tightened/relaxed
constraints, reduced/broadened authority and list-projection changes. Seeded local generation does not
replace independent security/QA review or record-aware projection/backfill rehearsal.

The isolated real-HTTP authorization and lifecycle command is:

```text
CONFIGURATION_HTTP_EVIDENCE_PATH=docs/audits/2026-09-09-readiness/evidence/uat/configuration-studio-http-boundary-result.json \
  pnpm --filter @gigalibs/app-playground-api verify:configuration-studio-http-local
```

It requires an explicitly local PostgreSQL 16 endpoint, creates and removes a guarded certification
database, starts one real control-plane API with one-run secrets and exercises the HTTP verifier. It proves
that current database suspension and role downgrade override an already-issued token, while an allowlisted
viewer runtime read remains available. It also listens on the versioned PostgreSQL Configuration channel,
validates the minimal envelope emitted after the outbox commit, simulates a five-minute-old worker claim and
proves reclaim/republication by receiving the same `eventId` at an incremented attempt. The adopting
manifest consumer must process the first delivery successfully and increment its deduplication counter for
the replay. Finally the harness submits a test-attributable invalid envelope and requires one terminal
attempt, an immutable failure audit, null publication state and no notification. It is not
transaction-commit failure injection, external-IdP/custom-role, deployment-profile or independent-review
evidence; cache-aware multi-replica convergence is certified by the separate replica harness.

The bounded local performance command is:

```text
CONFIGURATION_PERFORMANCE_EVIDENCE_PATH=docs/audits/2026-09-09-readiness/evidence/uat/configuration-studio-performance-result.json \
  pnpm --filter @gigalibs/app-playground-api verify:configuration-studio-performance
```

This command creates two attributable tenants in a generated local PostgreSQL 16 database, exercises the
accepted 250-field bound, concurrent authors and second-tenant pressure, writes only aggregate measurements
after verified cleanup, and remains local characterization until independent reviewers accept both target
deployment profiles and budgets.

The guarded local database-process restart command is:

```text
POSTGRES_CERT_CONTAINER=gigalibs-postgres \
CONFIGURATION_RESTART_EVIDENCE_PATH=docs/audits/2026-09-09-readiness/evidence/uat/configuration-studio-database-restart-result.json \
  pnpm --filter @gigalibs/app-playground-api verify:configuration-studio-database-restart
```

It verifies the named container/port, stops and restarts the PostgreSQL service while the API stays alive,
requires checksum/value integrity plus a post-restart write, accepts only checksum-valid success, retryable
sanitized 503 or a network interruption during the outage, and verifies generated-database cleanup. A
test-attributable Configuration event becomes due while the database is stopped and must reach `PUBLISHED`
with a valid notification after recovery. A certification-only trigger also pauses another event after
notification enqueue and before the `PUBLISHED` commit; the database stop must yield no receipt and the
reclaimed attempt must yield exactly one. It is not WAL/PITR, host-loss, failover or target-profile RPO/RTO
evidence; adopting-consumer behavior is certified separately by the HTTP replay and cache-aware replica
harnesses.

The portable contract convergence command is:

```text
CONFIGURATION_CONTRACT_EVIDENCE_PATH=docs/audits/2026-09-09-readiness/evidence/uat/configuration-studio-contract-convergence-result.json \
  pnpm audit:configuration-contracts
```

It compiles the JSON Schema with AJV 2020-12, validates a real compiler result, checks the shared enums,
impact-change kinds and resource ceiling, parses OpenAPI and requires exact method/path coverage for the Configuration controller.
All operations now use named strict v1 response schemas enforced at the controller boundary. Offline Java
11 client conformance is verified with:

```text
CONFIGURATION_JAVA_EVIDENCE_PATH=docs/audits/2026-09-09-readiness/evidence/uat/configuration-studio-java-client-result.json \
  pnpm certify:configuration-java-client
```

The command compiles the dependency-free client with `--release 11 -Xlint:all -Werror`, feeds it a real
TypeScript compiler/runtime-response fixture spanning all 13 field types and eight components, validates
conditional/list references and requires eight hostile fixtures to fail closed. It removes generated class
files before recording evidence. The disposable real-HTTP command above additionally compiles the Java
transport, passes its bearer token only through the child-process environment, fetches and strictly decodes
the live runtime manifest, proves invalid-token denial, and verifies non-loopback cleartext refusal, no
redirect following, JSON media type and the two-megabyte body ceiling. It removes temporary classes and
persists only aggregate hashes/results inside the HTTP evidence. Target-profile TLS/trust-chain behavior,
consumer-specific rendering and independent API/client review remain explicit follow-on work.

Static observability wiring is verified with:

```text
CONFIGURATION_OBSERVABILITY_EVIDENCE_PATH=docs/audits/2026-09-09-readiness/evidence/uat/configuration-studio-observability-result.json \
  pnpm audit:configuration-observability
```

That audit covers metric producer/scrape-verifier alignment, Prometheus rule parsing, dashboard signal and
cardinality checks, and runbook safety. A guarded local live scrape is run with:

```text
CONFIGURATION_LIVE_OBSERVABILITY_EVIDENCE_PATH=docs/audits/2026-09-09-readiness/evidence/uat/configuration-studio-live-observability-result.json \
  pnpm certify:configuration-observability-live
```

The local command creates and removes an isolated PostgreSQL database and never persists its one-run
scraper secret or raw metric body. Neither command replaces alert delivery, dashboard import or independent
operator rehearsal in either deployment profile.

The guarded local automated accessibility command is:

```text
DATABASE_URL=postgresql://<local-uat-user>:<password>@127.0.0.1:<port>/<local-uat-db> \
WORKFLOW_PLATFORM_TEST_URL=http://127.0.0.1:5180 \
CONFIGURATION_ACCESSIBILITY_BROWSERS=chromium,firefox,webkit \
  pnpm certify:configuration-accessibility
```

It creates attributable non-production identity and tenant data, signs in through the real control plane,
opens the optimized isolated workbench, exercises workflow-tab keyboard behavior and runs seven axe-core
scans per requested browser engine for supported WCAG 2.2 A/AA rules across desktop, mobile preview,
compact viewport, reduced-motion and all workflow states. It fails on any violation, incomplete browser
state, page error or HTTP 5xx and
deactivates generated identities after the run. Passing this command does not replace recorded manual
keyboard, screen-reader, 200%/400% zoom, high-contrast, contextual-overlay or either deployment-profile
review. Chromium is the safe default when `CONFIGURATION_ACCESSIBILITY_BROWSERS` is omitted; the recorded
release baseline requires Chromium, Firefox and WebKit.

Before G5 handoff it must also pass:

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

## 7. Release stop conditions

- WI-OI-013 authority or tenant lifecycle remains unaccepted for the target environment.
- Any tenant/RBAC/object/field negative case fails.
- Draft metadata reaches runtime or a renderer becomes a write authority.
- Runtime code, SQL, arbitrary URL or secret value is accepted by configuration metadata.
- PostgreSQL 16 clean/upgrade/restore, rollback/forward-fix or cache-aware multi-replica evidence is missing.
- An issued financial snapshot changes after current configuration changes.
- A production-reachable fixture, fabricated success or silent persistence fallback exists.
- Independent Architecture, Security, Backend/Data, Web/Accessibility, QA, affected Domain or Product decision is missing.
