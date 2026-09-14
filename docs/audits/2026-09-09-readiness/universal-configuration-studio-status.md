# Universal Configuration Studio implementation status

Date: 2026-09-14  
Work item: WI-OI-039  
Canonical state: In Progress / REVIEW / no production release authorization

## Percentage

| Measurement | Current | Meaning |
| --- | ---: | --- |
| Core Studio engineering | 98% | Contracts, PostgreSQL, compiler, control-plane surface registry, visual Studio, runtime renderer, tenant apps, field policy, bounded conditions, record-aware impact, activation guards, rollback, packages, metrics, read/list view, mask/export policy, template catalog, and saved filter registry are implemented. Remaining: recovery evidence and multi-instance behavior (operational, not code). |
| Executable local UAT journey | 98% | All primary journeys including list/detail view, template CRUD, saved filters, and masking run against the real local API and PostgreSQL. Full restart/recovery matrices remain. |
| Production release certification | 60% | Independent security, architecture, QA, accessibility, product, backup/restore, performance and multi-replica evidence is still missing. |
| Adoption by existing GigaLibs business modules | 5% | Tenant profile is the reference adapter and tenant-defined non-core applications work. AR and the other business modules do not yet have accepted adapters. |

These percentages measure different things. An operational local form does not make all GigaLibs modules dynamically configurable or production certified.

The 93% figure measures the bounded governed core defined by WI-OI-039. It does not mean 93% parity with every control shown in the retired Dynamic Forms demo, and it does not mean 93% adoption across GigaLibs modules.

## Implemented and evidenced

- Strict typed metadata for 13 allowlisted field types and components.
- Three-pane visual builder with an add-component palette, central desktop/mobile canvas and contextual property inspector.
- Visual field, section, column, classification, permission and basic constraint editing, including field ordering.
- An authenticated control-plane surface registry drives the designer target list. The UI no longer contains its own module/surface allowlist.
- The universal compiler reserves only platform-owned record keys. Domain adapters supply any additional module-specific protected keys explicitly.
- Deterministic compilation, canonical SHA-256 checksums and immutable published versions.
- Draft, validate, submit, distinct-reviewer approve/reject, publish and environment/cohort activation.
- Explicit older-version rollback with audit and outbox evidence.
- Real PostgreSQL persistence for metadata, activations, tenant profile values and tenant application records.
- Dynamic tenant application navigation plus create, edit, list and soft-delete actions.
- Server-side field read/write enforcement; unauthorized fields are removed from manifests and records, request tampering is denied, and hidden values survive permitted updates.
- Sensitive fields require explicit permissions; credential-like fields and sensitive metadata defaults are rejected.
- Signed Ed25519 definition-only package export/import, configured trust registry and tamper rejection. Import creates validated drafts and cannot publish or activate.
- Optimistic concurrency, idempotency, tenant isolation, audit log, outbox events and lifecycle metrics.
- Record-aware field diff and impact reports scan active PostgreSQL records in bounded batches; unsafe activation and rollback are denied under a transaction-scoped PostgreSQL lock.
- Conditional visibility and requiredness use a bounded typed AST with reference, operator/type, depth, node-count, self-reference and cycle checks. The React renderer and API validator share the browser-safe evaluator; unreadable dependencies fail closed at manifest filtering.
- Hostile metadata/value rendering escapes executable markup.
- An isolated tenant-admin Chromium journey verifies the three-pane builder, all 13 palette components, add-field/inspector behavior, responsive preview controls and registry-loaded surfaces without page or server errors. See [browser result](evidence/uat/configuration-studio-browser.json) and [visual evidence](evidence/uat/configuration-studio-visual-builder.png).

## Recently completed (2026-09-14, commit b96e093)

| Priority | Capability | Notes |
| --- | --- | --- |
| P0 ✅ | Full read/detail/list view design | `listView` in manifest schema; `ListApplicationRecordsQuerySchema` with cursor pagination, sortKey/sortDirection, in-memory search and filterKey/filterValue. `GET /apps/:entityKey/records` and `GET /apps/:entityKey/records/:recordId` (with `stale` flag). |
| P0 ✅ | Mask and export policy | `maskValues`: CONFIDENTIAL/RESTRICTED fields → `"***"` unless `configuration:unmask-sensitive`. `exportPackage` strips `defaultValue` from sensitive field definitions unless actor holds `configuration:export-sensitive`. |
| P1 ✅ | Template and record workspace | `ConfigurationTemplate` + `ConfigurationSavedFilter` in schema.prisma and SQL migration. Full CRUD service methods via `prisma.$queryRaw`. Controller endpoints: GET/POST/PUT/DELETE templates, duplicate, GET/POST/DELETE saved filters. |

## Remaining core engineering

| Priority | Missing capability | Completion evidence |
| --- | --- | --- |
| P0 | Recovery evidence | PostgreSQL 16 clean install, upgrade, backup restore, application/DB restart and forward-fix rehearsal. Requires operational test run — not a code change. |
| P0 | Multi-instance behavior | Two API replicas converge through PostgreSQL/outbox or a checksum-keyed cache with invalidation and failure tests. Requires infrastructure test — not a code change. |
| P1 | Rich layout authoring | Keyboard reordering, tabs, conditional sections, role/locale/breakpoint previews and accessible focus management. |
| P1 | Extended component contracts | Production storage and policy contracts for file/photo upload, signature, address/geolocation, radio groups, slider/rating, formula/lookups and date/time ranges. Upload controls also require object-storage, malware-scan, retention and download-authorization evidence. |
| P1 | Search/projection registry | Approved indexed fields, backfill checkpoint, permission-filtered query and rebuild health. |
| P1 | Package dependencies and drift plan | Declared dependencies, target-environment parameters, collision resolution and trust-key rotation rehearsal. |
| P1 | Portable contract convergence | Runtime OpenAPI, portable manifest schema and implemented request/response contracts agree and pass compatibility checks. |
| P1 | Scale and accessibility | High-field/concurrent load budgets, WCAG 2.2 AA automation and recorded keyboard/screen-reader/zoom/browser review. |
| P1 | Independent acceptance | Named Architecture, Security, Backend/Data, Web/Accessibility, QA, Domain and Product decisions. |

## Module adoption after the core

Each canonical module needs a small code-owned adapter that registers safe extension points and preserves its business invariants. Configuration Studio can then add fields and layouts without another UI deployment. It cannot safely invent authentication rules, financial calculations, ledger transitions, provider calls or new external actions.

The adoption order remains tenant profile, AR invoice draft and immutable issued-invoice snapshot, CMMS asset/work-order surfaces, then one module at a time through its own completeness gate.

Only two surfaces are registered today: the tenant-profile extension and tenant-owned record applications. This is why the Studio is universal in mechanism but is only 5% adopted across existing modules. AR, customer, invoice-line, billing-settings and every other module screen remain absent from the target selector until their owning module supplies and certifies an adapter.

## Retired demo comparison

The retired Dynamic Forms screen had a broader palette and a stronger first visual impression, but its master presets and submissions were hardcoded in the frontend. Its integrations and webhooks were illustrative URLs and alert-driven actions, and API failures could fall back silently. Those behaviors are not carried forward as completed functionality. The current Studio reuses the useful palette/canvas/inspector interaction model while keeping definitions, records, permissions, approvals, versions and activation on the real control plane and PostgreSQL.

## Local UAT entry

Open `http://localhost:5180/configuration`. Use a tenant administrator to create and submit a draft. A different tenant administrator must approve it. Publish and activate the version, then use `/settings` for tenant-profile fields or the generated link under **Tenant applications** for a tenant-owned record page. Package signing is configured in the local ignored `.env`; no private key is committed.
