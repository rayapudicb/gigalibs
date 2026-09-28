# Universal Configuration Studio implementation status

Date: 2026-09-24
Work item: WI-OI-039  
Canonical state: Review / no active G4 Build item / no production release authorization

> **2026-09-22 F2 requalification:** the static deployment-contract audit found that the claimed Helm and
> Compose profiles do not match current API/web environment, probe, signing or image-provenance contracts.
> The earlier CS-10/P0 deployment-packaging check is withdrawn as completion evidence. See
> [the F2 closure audit](../2026-09-22-configuration-f2-closure-audit.md) and WI-OI-047. Local-source evidence
> remains valid within its stated limits; production-profile certification is No-Go. The Product Owner/
> Solution Architecture reviewer subsequently selected `configuration-local-development-v1` on the
> existing Docker/PostgreSQL/MinIO stack and deferred all production/cloud infrastructure evidence.

> **2026-09-24 Local Development closure:** WI-OI-047 repaired and certified the selected local deployment
> profile with source-bound non-root images, real PostgreSQL/MinIO dependencies, runtime/outage/restore
> evidence and a zero Critical/High image policy. A later exact-image database review found a
> `Department.updatedAt` canonical-schema mismatch; the bounded WI-OI-042 correction aligned Prisma to the
> intentional deployed default without editing applied migrations or targeting the live database.
> Replacement clean replay and representative 35→37 upgrade now have zero physical-schema diff and preserve
> tenant isolation. WI-OI-039, WI-OI-042 and WI-OI-047 remain in Review because independent human decisions
> and repository-wide routed failures remain open.

## Percentage

| Measurement | Current | Meaning |
| --- | ---: | --- |
| Core Studio engineering | 98% | Contracts, PostgreSQL, compiler, control-plane surface registry, visual Studio, runtime renderer, tenant apps, field policy, bounded conditions, record-aware impact, activation guards, rollback, packages, metrics, read/list view, mask/export policy, template catalog, saved filters, zero schema drift, enforced 250-field surface envelope, strict v1 response projections, aligned portable manifest/OpenAPI, Java 11 client conformance plus authenticated local HTTP transport, and local multi-replica convergence are implemented. Richer authoring/components, indexed projection and target-profile TLS/client integration remain. |
| Executable local UAT journey | 98% | Primary journeys run against the real local API and PostgreSQL; clean replay/logical restore, 33→35 upgrade, application restart, PostgreSQL-container restart and two-replica restart/resynchronization pass. Wider database/outbox failure matrices remain. |
| Production release certification | 60% | Planning estimate unchanged pending independent decisions. Local backup/restore, database restart, two-replica, bounded 250-field/two-tenant load and automated Chromium/Firefox/WebKit accessibility evidence pass; deployment-profile recovery/replicas/performance/accessibility, manual assistive-technology review, security, architecture, QA and product acceptance remain. |
| Adoption by existing GigaLibs business modules | 5% | Tenant profile is the reference adapter and tenant-defined non-core applications work. AR and the other business modules do not yet have accepted adapters. |

These percentages measure different things. An operational local form does not make all GigaLibs modules dynamically configurable or production certified.

The 98% figure measures the bounded governed core defined by WI-OI-039. It does not mean 98% parity with every control shown in the retired Dynamic Forms demo, and it does not mean 98% adoption across GigaLibs modules.

## Implemented and evidenced

- Strict typed metadata for 13 allowlisted field types and components.
- Three-pane visual builder with an add-component palette, central desktop/mobile canvas and contextual property inspector.
- Visual field, section, column, classification, permission and basic constraint editing, including field ordering.
- An authenticated control-plane surface registry drives the designer target list. The UI no longer contains its own module/surface allowlist.
- The universal compiler reserves only platform-owned record keys. Domain adapters supply any additional module-specific protected keys explicitly.
- Deterministic compilation, canonical SHA-256 checksums and immutable published versions.
- Fixed-seed generative coverage exercises 600 arbitrary JSON documents, 180 valid definitions after deep
  object-key reordering and 180 generated runtime-value sets. The compiler fails closed without throwing,
  preserves checksums across equivalent key ordering and returns deterministic validation results.
- Compatibility classification now lives in the shared compiler core. Optional/presentation changes remain
  compatible; required, tightened, permission-reduction and projection changes are conditional; type/key,
  invariant-relaxation and authority-broadening changes are breaking. A required field with a default still
  requires a checkpoint rather than being treated as automatically safe.
- Draft, validate, submit, distinct-reviewer approve/reject, publish and environment/cohort activation.
- Explicit older-version rollback with audit and outbox evidence.
- Real PostgreSQL persistence for metadata, activations, tenant profile values and tenant application records.
- Dynamic tenant application navigation plus create, edit, list and soft-delete actions.
- Server-side field read/write enforcement; unauthorized fields are removed from manifests and records, request tampering is denied, and hidden values survive permitted updates.
- Sensitive fields require explicit permissions; credential-like fields and sensitive metadata defaults are rejected.
- Signed Ed25519 definition-only package export/import, configured trust registry and tamper rejection. Import creates validated drafts and cannot publish or activate.
- Optimistic concurrency, idempotency, tenant isolation, audit log, outbox events and lifecycle metrics.
- A self-contained real-HTTP authorization run on a disposable PostgreSQL 16 database proves current-state
  denial for suspended membership, user and tenant plus live TENANT_ADMIN→VIEWER downgrade. Viewer runtime
  read remains allowed while Studio authoring and extension-value writes are denied. It also receives the
  minimal transaction-coupled PostgreSQL notification and proves that a five-minute-old Configuration
  outbox claim is reclaimed and replayed with the same `eventId` on attempt two. An invalid envelope fails
  permanently on attempt one with an audit record and no notification. See the
  [HTTP boundary result](evidence/uat/configuration-studio-http-boundary-result.json).
- Record-aware field diff and impact reports scan active PostgreSQL records in bounded batches; unsafe activation and rollback are denied under a transaction-scoped PostgreSQL lock.
- Conditional visibility and requiredness use a bounded typed AST with reference, operator/type, depth, node-count, self-reference and cycle checks. The React renderer and API validator share the browser-safe evaluator; unreadable dependencies fail closed at manifest filtering.
- Hostile metadata/value rendering escapes executable markup.
- An isolated tenant-admin Chromium journey verifies the three-pane builder, all 13 palette components, add-field/inspector behavior, responsive preview controls and registry-loaded surfaces without page or server errors. See [browser result](evidence/uat/configuration-studio-browser.json) and [visual evidence](evidence/uat/configuration-studio-visual-builder.png).
- The workflow tabs expose explicit tab/tabpanel relationships and roving Arrow Left/Right, Home and End focus. Twenty-one authenticated axe-core scans of optimized Chromium, Firefox and WebKit builds report zero supported WCAG 2.2 A/AA violations across desktop, mobile preview, compact viewport, reduced-motion and all five workflow states. See the [accessibility result](evidence/uat/configuration-studio-accessibility-result.json). This is automated local evidence, not manual assistive-technology, contextual-overlay or deployment-profile acceptance.

## Recently completed (2026-09-14, commit b96e093)

| Priority | Capability | Notes |
| --- | --- | --- |
| P0 ✅ | Full read/detail/list view design | `listView` in manifest schema; `ListApplicationRecordsQuerySchema` with cursor pagination, sortKey/sortDirection, in-memory search and filterKey/filterValue. `GET /apps/:entityKey/records` and `GET /apps/:entityKey/records/:recordId` (with `stale` flag). |
| P0 ✅ | Mask and export policy | `maskValues`: CONFIDENTIAL/RESTRICTED fields → `"***"` unless `configuration:unmask-sensitive`. `exportPackage` strips `defaultValue` from sensitive field definitions unless actor holds `configuration:export-sensitive`. |
| P1 ✅ | Template and record workspace | `ConfigurationTemplate` + `ConfigurationSavedFilter` in schema.prisma and SQL migration. Full CRUD service methods via `prisma.$queryRaw`. Controller endpoints: GET/POST/PUT/DELETE templates, duplicate, GET/POST/DELETE saved filters. |

## Release-evidence continuation — 2026-09-16

| Priority | Capability | Evidence and limit |
| --- | --- | --- |
| P0 ✅ | Clean migration and logical recovery | PostgreSQL 16 replayed all 35 migrations, passed generated-client probes and an empty physical-schema diff, preserved 112 `timestamptz` columns, and restored a 420,338-byte same-major backup with matching record and migration integrity. Disposable databases and dump were removed. This is not WAL/PITR or representative-volume evidence. |
| P0 ✅ | Local cache-aware multi-replica convergence | Two real NestJS API replicas shared one authoritative PostgreSQL database. The bounded 30-second manifest cache served a connected hit; activation on A invalidated and reconciled online B through the adopting PostgreSQL notification consumer; B then restarted after missing a third activation and read the authoritative version; rollback on B invalidated A's primed cache. Both listener gauges reported connected and all four activation/rollback outbox records reached `PUBLISHED`. Deployment-profile replica/failure rehearsal remains open. |
| P0 ✅ | Schema drift repair | A failed first replica run exposed snake_case/camelCase drift in the 20260914 Saga/Governor/tenant migration. Two new forward migrations align physical names and the canonical Prisma datamodel, retain database actor foreign keys/defaults and add the missing activation lookup index. Recovery notes are included; no prior migration was edited. |
| P0 ✅ | Incremental upgrade and application restart | An accepted 33-migration database with representative tenant hierarchy, Saga, Governor and active Configuration state upgraded to 35 migrations. Its semantic checksum and active manifest were preserved, the generated client read every repaired model, and the upgraded API served the same manifest after restart. The generated database and temporary migration directory were verified removed. |
| P0 ✅ | Local PostgreSQL process and transport-transaction recovery | A guarded drill stopped and restarted only the verified `gigalibs-postgres` PostgreSQL 16 container while the API remained alive. Successful probes retained the active checksum; 261 unavailable requests returned sanitized 503s with `Retry-After`, one request had a network interruption and no unexpected HTTP status occurred. A pending Configuration event became due during the outage, then reached `PUBLISHED` on attempt one and emitted a valid notification after recovery. A certification trigger paused a separate publish after notification enqueue and before commit: the interrupted transaction rolled back with zero receipt, then the stale claim recovered on attempt two with exactly one receipt. The same API recovered the pre-restart value and committed a new version; both manifest and value survived a later application restart. The generated database was removed and the container remained running. This is not WAL/PITR, failover, host/storage-loss or deployment-profile RPO/RTO evidence; adopting-consumer convergence is covered by separate local replica/replay evidence. |
| P1 ✅ | Bounded local high-field/concurrent load | The contract and tenant-app surface share and enforce the accepted 250-field ceiling. In the latest post-contract run, one real API and PostgreSQL 16 served two isolated tenants: warm manifest p95 was 30.236 ms; manifest p95 during 16 competing edits was 78.377 ms with exactly one winner; a 100-record/250-field list was 260.818 ms p95; and the same read under second-tenant writes was 262.524 ms p95. All were below the provisional two-second NFR-PERF-002 read budget, durable writes produced audit/outbox evidence and the database was removed. This is local characterization, not deployment-profile or independent performance acceptance. |
| P1 ✅ | Portable manifest, route and response-contract convergence | AJV 2020-12 validates real compiler output across all 13 field types/eight components and rejects executable metadata plus field overflow. Runtime constants match the schema. Parsed OpenAPI matches all 32 controller method/path pairs and each operation uses a named success schema. Strict shared response projections normalize dates and reject undeclared ORM fields before serialization; the real high-field HTTP lifecycle passes with them enabled. A separately implemented dependency-free Java 11 client passes eleven positive/hostile offline conformance outcomes. Its Java 11 HTTP transport also decodes the real bearer-authenticated local API response and passes invalid-token, cleartext, redirect, media-type and response-size controls. Artifact/source hashes are recorded. Target-profile TLS/trust-chain behavior and independent review remain. |
| P1 ✅ | Compiler fuzz and compatibility transitions | Three fixed-seed generative properties pass 960 cases, and 13 focused policy tests cover optional/required additions, label/layout changes, type/key changes, used-option removal, constraint tightening/relaxation, permission reduction/broadening and list-projection changes. The contract audit binds all 11 impact kinds across Zod/OpenAPI and hashes the shared classifier source. Independent Architecture/Security/QA review remains. |
| P1 ✅ | Local HTTP suspension, role-downgrade and transport-replay matrix | A self-contained harness replays 35 migrations, starts the real API with one-run secrets and passes fifteen outcomes: unauthenticated denial, tenant/RBAC enforcement, maker-checker, lifecycle, suspension, current database role downgrade, record-aware activation guard, signed-package tamper denial, live Java 11 bearer-manifest decoding, transaction-coupled PostgreSQL notification receipt, stale Configuration-outbox replay on attempt two, adopting-consumer deduplication after successful processing and audited permanent-envelope rejection on attempt one without notification. The Java sub-certification adds six transport-hardening outcomes, the replayed event has two receipts, and the run verifies cleanup and persists no raw credential. Target-profile TLS, custom-role/provider interoperability, deployment profiles and independent Security/QA acceptance remain; interrupted-commit rollback/retry is covered separately by the local PostgreSQL recovery drill above. |
| P1 ✅ | Static and local live operations observability | Thirteen Configuration database/cache/consumer metrics are cross-checked between producer and authenticated live-scrape verifier. Six module alerts, a sixteen-panel Grafana dashboard and the operations runbook parse and pass naming, runbook-routing and cardinality safeguards. A real local API/PostgreSQL run passes scraper authentication, collector health, listener connectivity, metric-family, empty-state and cardinality checks, then removes its database. This does not prove deployment-profile scraping, dashboard import, alert evaluation/delivery or an independent operator rehearsal. |
| P1 ✅ | Local automated accessibility baseline | The optimized workbench passes 21 authenticated axe-core scans for supported WCAG 2.2 A/AA rules with no violations or incomplete checks across Chromium, Firefox and WebKit. Each engine covers desktop, mobile preview, a 390×844 viewport, reduced motion and all workflow tabs; each also proves Arrow Left/Right, Home and End roving focus and reports no browser or HTTP 5xx errors. Generated identities are deactivated after the run. Manual keyboard, screen-reader, 200%/400% zoom, high-contrast and contextual-overlay local review remain; production-profile review is deferred. |
| P0 ✅ | Local Development foundation | WI-OI-047 repaired the Docker/PostgreSQL/MinIO profile and replacement certification passes. WI-OI-042 subsequently corrected and recertified the Department canonical-schema contract. The exact local images are non-root and pass the recorded zero Critical/High/secret policy; clean replay, representative upgrade, runtime, tenant isolation and restore checks pass. Independent decisions remain open and production/cloud infrastructure is deferred. |
| Historical gate ✅ | 2026-09-16 repository baseline | The previously recorded 100/100 build-task, 587 TypeScript-test and static-audit result remains historical evidence for its source state; it is not the current repository result. |
| Current gate ❌ | 2026-09-24 repository baseline | `pnpm build` and `pnpm test` fail on routed Analytics and frozen CMMS conditions. `audit:production-data` and `audit:all-runtime-data` fail on seven existing quarantine/local-Redis findings. Package-dependency, API-boundary, navigation and SDLC audits pass. These failures are not waived by the Local Development closure. |

## Remaining core engineering

| Priority | Missing capability | Completion evidence |
| --- | --- | --- |
| P1 | Rich layout authoring | Keyboard reordering, tabs, conditional sections, role/locale/breakpoint previews and accessible focus management. |
| P1 | Extended component contracts | Production storage and policy contracts for file/photo upload, signature, address/geolocation, radio groups, slider/rating, formula/lookups and date/time ranges. Upload controls also require object-storage, malware-scan, retention and download-authorization evidence. |
| P1 | Search/projection registry | Approved indexed fields, backfill checkpoint, permission-filtered query and rebuild health. |
| P1 | Package dependencies and drift plan | Declared dependencies, target-environment parameters, collision resolution and trust-key rotation rehearsal. |
| P1 | Cross-client deployment acceptance | Repeat the passing Java bearer-manifest journey over the accepted local TLS/trust chain, add any consumer-specific renderer integration and obtain independent API/client review. Strict offline conformance and authenticated loopback HTTP already pass. |
| P1 | Deployment-profile scale acceptance | Repeat the 250-field/concurrent/noisy-neighbor harness in the Local Development profile; independently approve read/write, browser-render and indexed-projection budgets plus saturation/failure envelopes. |
| P1 | Deployment-profile observability acceptance | Import the dashboard, prove authenticated scraping, fire and resolve each alert through the real notification route, and have an independent operator execute the database/outbox/rollback runbook in the local profile. |
| P1 | Accessibility completion | Record manual keyboard, screen-reader, 200%/400% zoom and high-contrast review; repeat the accepted journey in the contextual overlay and Local Development profile. Local Chromium/Firefox/WebKit WCAG automation and workflow-tab keyboard behavior already pass. |
| P1 | Independent acceptance | Named Architecture, Security, Backend/Data, Web/Accessibility, QA, Domain and Product decisions. |

## Module adoption after the core

Each canonical module needs a small code-owned adapter that registers safe extension points and preserves its business invariants. Configuration Studio can then add fields and layouts without another UI deployment. It cannot safely invent authentication rules, financial calculations, ledger transitions, provider calls or new external actions.

The adoption order remains tenant profile, AR invoice draft and immutable issued-invoice snapshot, CMMS asset/work-order surfaces, then one module at a time through its own completeness gate.

Two surfaces are authoring-enabled today: the tenant-profile extension and tenant-owned record applications.
AR Customer and Invoice Draft are visible as inspection-only registrations with locked core fields, but
authoring fails closed until DC-06 owns validated transactional extension persistence and the immutable
issued-invoice snapshot. Invoice-line, billing-settings and every other module surface remain absent until
their owning module supplies and certifies an adapter. This is why the Studio is universal in mechanism but
is still only 5% adopted across existing modules.

## Retired demo comparison

The retired Dynamic Forms screen had a broader palette and a stronger first visual impression, but its master presets and submissions were hardcoded in the frontend. Its integrations and webhooks were illustrative URLs and alert-driven actions, and API failures could fall back silently. Those behaviors are not carried forward as completed functionality. The current Studio reuses the useful palette/canvas/inspector interaction model while keeping definitions, records, permissions, approvals, versions and activation on the real control plane and PostgreSQL.

## Local UAT entry

Open `http://localhost:5180/configuration` to enable contextual Studio mode and return to the module catalogue, then open a registered screen and use **Config**. The isolated full-workbench route is `http://localhost:5180/studio/configuration`. Use a tenant administrator to create and submit a draft. A different tenant administrator must approve it. Publish and activate the version, then use `/settings` for tenant-profile fields or the generated link under **Tenant applications** for a tenant-owned record page. Package signing is configured in the local ignored `.env`; no private key is committed.
