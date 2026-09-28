# External Data Analytics & Reporting production implementation plan

Status: Revised G0-G3 design — source-agnostic universal ingestion architecture; no Build or release authorization  
Revision: Vision-aligned rewrite; scopes the module exclusively to external-source analytics and reporting  
Work item: Unassigned. `WI-OI-043` is the proposed next identifier, but the SDLC Orchestrator must confirm the next free stable ID and reconcile current Build governance before registering it.  
Required sequence: One entitled module and one work item deliver a complete PostgreSQL-source vertical slice through chart, dashboard and CSV report; later sources are separate enhancement items.  
Required reviewers: Product, Solution Architecture, Security & Privacy, Backend & Data, QA/SDET, SRE/Release Operations and Accessibility.  
Primary requirements: FR-02, FR-03, FR-05, FR-08, FR-11, FR-12, FR-14, FR-15, FR-16 and applicable NFR-GOV, NFR-DATA, NFR-PERF, NFR-SEC, NFR-REL, NFR-UX, NFR-OBS and NFR-OPS requirements.

---

## 1. Product boundary

This plan covers the **External Data Analytics & Reporting** module — a separately entitled SaaS module within GigaLibs. It:

- lets a tenant connect supported external systems, ingest and model their data, build charts and dashboards, and generate or schedule reports, entirely inside GigaLibs;
- operates alongside the other GigaLibs business modules;
- does not depend on another business module for its data, semantics, release or entitlement.

GigaLibs remains the broader operational-intelligence and action platform. Analytics & Reporting is one module within it.

### 1.1 Product invariant

The module's supported production path is source-agnostic:

**External system → Connector → Ingestion → Dataset → Semantic model → Chart/Dashboard/Report**

No internal business module appears in this work item's requirements, contracts, migrations, tests or
release claims. Adding a GigaLibs business module as a source is outside this plan and would require a new
accepted work item.

### 1.2 Architecture relationship to GigaLibs SaaS

This plan adopts the intended GigaLibs SaaS architecture:

1. `packages/db` and `apps/playground-api` remain the identity, tenant, membership, entitlement and organization control plane.
2. `apps/workflow-platform` is an authenticated BFF and web experience. Browser code never supplies trusted tenant identity.
3. Modules consume the shared `PlatformContextV1` contract from `@gigalibs/contracts`, verify its Ed25519 signature and exact audience, and enforce entitlement, permissions and organization scope.
4. Persona selects experience; it never grants authority.
5. `FLAT_TENANT` means tenant-wide access. `SCOPED_DEPARTMENTS` means the explicit department list is the maximum authorized set. Empty scoped list fails closed.
6. Tenant isolation supports `ROW_LEVEL_SECURITY`, `SCHEMA_ISOLATED` and `DEDICATED_DATABASE`.
7. The connected external system remains the source of truth. Connector Hub owns connection and ingestion
   evidence; Data Studio owns mapping/profile definitions; Analytics owns published analytical datasets,
   semantic models and queries; the Reports sub-capability owns report definitions, runs and artifacts.
8. Tenant-authored analytics metadata is compiled from an allowlisted DSL. It may define approved labels,
   dimensions, aggregations, filters, joins and layouts, but never arbitrary SQL/code, authentication,
   tenant isolation, secret access or retention enforcement.

### 1.3 Governance prerequisite

`.pi/PLAN.md`, `.pi/WORK_ITEMS.md` and `config/sdlc-governance.json` currently disagree about whether WI-OI-039 or WI-OI-042 is the sole active Build item. The SDLC Orchestrator must record one canonical active Build item before any code from this plan is changed.

---

## 2. Business outcomes

### 2.1 Analytics first release

A non-technical tenant user can:

1. Enable the Analytics & Reporting module.
2. Add a supported external source (PostgreSQL first, then CSV).
3. Authenticate through OAuth or approved credentials.
4. Browse available tables, endpoints or sheets.
5. Select what to synchronize.
6. Review detected field types and quality problems.
7. Rename, classify and safely transform fields.
8. Publish a tenant analytical dataset.
9. Create measures using an allowlisted no-code builder.
10. Select dimensions and filters.
11. Choose a chart type and preview real data from their source.
12. Save charts to a configurable dashboard with shared filters.
13. Drill from an aggregate into authorized source rows.
14. See last synchronization time, freshness, failures and lineage.

The first release contains only the universal ingestion path proven against one PostgreSQL source. It does
not contain the generic 36-chart catalog, industry KPI presets or self-service SQL.

### 2.2 Reports first release

An authorized tenant user can request a report from a pinned analytical dataset snapshot. The server creates an immutable run, generates a bounded CSV artifact, encrypts it in object storage, audits creation and download, and expires it according to retention policy. Re-running against the same snapshot produces equivalent rows.

## 3. Explicit exclusions from the first releases

- Any internal GigaLibs business module as a source or prerequisite.
- Metabase, Superset, Tableau or another separately operated/embedded BI runtime.
- A blind full-repository fork of Lightdash or another BI product. Selective source adoption is allowed
  only through the OSS adoption gate in this plan.
- Recharts, Nivo, ECharts, Tremor or other OSS code without source provenance, license/SBOM/security review
  and an accepted adoption decision.
- Arbitrary tenant-authored SQL, JavaScript, expressions or formulas.
- Generic cross-domain executive KPIs before their owning domains release reconciled facts.
- Browser-side production CSV/XLS/JSON generation.
- PDF format, XLS format and email or webhook delivery beyond the weekly schedule are excluded until CSV lifecycle evidence passes. Weekly scheduled CSV delivery is part of the first release (Phase 6).
- Platform-wide or cross-tenant customer payload visibility for operators.
- Treating existing Demo Lab or hardcoded chart catalog data as production functionality.

---

## 4. Module responsibilities

| Module | Role in Analytics & Reporting |
| --- | --- |
| Control Plane | Tenant, entitlement, users, permissions, department scope and isolation profile. Every API and worker operation goes through here. |
| Connector Hub | Source connectors, connection lifecycle and synchronization adapters. Provides the catalog of supported external systems. |
| OAuth / Credential Vault | OAuth grants, API keys, database credentials, token rotation and revocation. Analytics never handles raw credentials. |
| Workflow Studio | Schedules and coordinates discovery, synchronization and refresh jobs. Orchestrates; does not become the database driver or query engine. |
| Data Studio | Schema discovery, profiling, field mapping, type correction and safe transformation. Produces the typed analytical dataset. |
| Analytics Studio | Datasets, semantic models, query execution, charts, dashboards, filters and drill-through. The core of this feature. |
| Reports sub-capability | Report definitions, execution, schedules, CSV/XLS/PDF exports, storage and delivery under the same product entitlement. It may run in a separate worker, but it is not a separate customer product for this plan. |
| Audit / Lineage | Trace source → sync → dataset → semantic definition → chart / report. |
| MCP | Optional governed source or action adapter. Not the main bulk-ingestion engine. |
| Other business modules | Out of scope. They are neither dependencies nor source owners for this work item. |

---

## 5. Core data flow

```text
Tenant enables Analytics & Reporting module
  ↓
Add external data source (PostgreSQL)
  ↓
Connector Hub + OAuth / Credential Vault
  (connection lifecycle, secure credential reference)
  ↓
Workflow Studio schedules / coordinates sync job
  ↓
Ingestion engine pulls data + writes to raw tenant-isolated staging
  (sync run recorded: rows, timestamps, errors, watermark)
  ↓
Schema discovery and data profiling
  (Data Studio: field types, quality issues, relationship suggestions)
  ↓
Customer: rename fields, set types, apply safe transforms (no code)
  ↓
Published analytical dataset
  (versioned, tenant-owned, freshness + completeness metadata)
  ↓
Customer: define measures and dimensions (no-code builder)
  ↓
Semantic model
  (dimensions · measures · calculated fields · relationships)
  ↓
Governed query engine
  (tenant-bound SQL; enforces RLS and department scope; returns asOf + freshness)
  ↓
Charts · Dashboards · Filters · Drill-through
  ↓
Reports · CSV · Schedules · Delivery
  ↓
Lineage · Audit · Freshness · Failure/retry
```

The external system is the source of truth. GigaLibs stores an attributable analytical copy; publishing a
dataset never transfers operational ownership to Analytics.

---

## 6. Current implementation disposition

| Existing area | Disposition | Required action |
| --- | --- | --- |
| `modules/analytics-studio/apps/api` | Retain as Analytics runtime candidate | Replace development auth, direct operational-schema joins, swallowed errors, fabricated telemetry and fake actions. Add manifest and deployment evidence. |
| Analytics migrations 000001-000003 | Immutable migration history | Do not edit in place. Inventory deployed state and add forward migrations only. No runtime DDL. |
| `metrics.service.ts` | Replace implementation | Stop querying external operational schemas and platform billing tables directly. Stop reporting unconditional lineage. Replace with governed query engine backed by ingested datasets. |
| `telemetry.service.ts` | Remove from production paths | Delete production seeding and numeric fallbacks. Preserve only legitimately useful typed code after review. |
| `actions.service.ts` | Contain | Remove synthetic audit/freeze success. Future actions call registered domain module commands through the Action Gateway. |
| `oidc-dev.service.ts` | Local test support only | Production BFF must mint `PlatformContextV1`; insecure token issuance must be disabled in all production profiles. |
| `industry-charts-catalog.ts` | Presentation metadata only | Remove all hardcoded KPI numbers, fake live flags and business-value claims. Keep approved chart layout metadata if useful. |
| `@gigalibs/charts-react` | Retain for first slice; certify or replace | Add accessibility, responsive, precision and performance certification. If it fails, create ADR comparing Recharts or Nivo adoption with ADR + license/SBOM review. |
| `/api/reports` containment route | Preserve until Reports gate passes | Do not return production report data early. |
| `reports-engine.ts` | Retire fabricated calculations | Remove fabricated financial calculations and tests that require fake rows. |
| `packages/reports-core` | Rework as shared contracts/utilities | No persistence, authorization, tenant lookup or storage credentials in the pure package. |
| `packages/reports-nest` | Use only after runtime ownership ADR | May expose reusable Nest adapters but cannot be the unnamed owner of report state. |
| `packages/reports-react` | Build against server API only | No authoritative calculations or export generation in React. |
| `packages/reports-grid-react` | Keep quarantined | Promotion requires source, dependency, license, security and consumer evidence. |

---

## 7. Target ownership

| Concept | Authoritative owner | Persistence / contract |
| --- | --- | --- |
| Identity, session, tenant, entitlement, isolation mode, department scope | Canonical control plane | `packages/db`, `apps/playground-api`, signed `PlatformContextV1` |
| External source connection and credential | Connector Hub | Connector-owned persistence and secret references |
| Source discovery, source sync runs, raw record versions, source cursors/checkpoints and connector outbox | Connector Hub | `gigalibs_connectors` — Connector worker performs all source I/O; owns `sync_runs`, `raw_record_versions`, `sync_checkpoints` and `connector_outbox` |
| Schema profile and field mapping | Data Studio | Versioned field mapping definitions; no domain truth |
| Workflow orchestration — orchestration runs, timers, idempotent command delivery and workflow outbox | Workflow Studio | Workflow-owned orchestration run records and `workflow_outbox`; sends versioned start commands to Connector Hub; does not perform source I/O and does not own source cursors or checkpoints |
| Published analytical datasets and attributable record versions | Analytics Studio | `gigalibs_analytics` — immutable dataset versions and as-of-capable record versions |
| Semantic model and metric definitions | Analytics Studio | Versioned metric definitions with owner, formula ref and checksum |
| Analytics projections and query results | Analytics Studio | `gigalibs_analytics` — projections, snapshots and lineage |
| Report definition, run, artifact, schedule and delivery | Reports sub-capability of this module | `gigalibs_reports`; artifact bytes in approved object storage |
| Dashboard layout and chart presentation | Web experience / governed configuration | Versioned allowlisted layout metadata; never an authorization source |
| Audit stream | Canonical audit owner plus module outbox evidence | Correlated immutable records |

---

## 8. Trust boundaries and request flow

```text
Control-plane session
  → BFF validates session, tenant, entitlement and route permission
  → BFF mints ≤300s PlatformContextV1 for exact module audience
  → Analytics module verifies signature, issuer, audience, expiry,
    entitlement, scopes and organization scope
  → tenant database router selects accepted isolation binding
  → transaction sets tenant and actor context
  → query intersects requested filters with verified org scope

Ingestion job
  → worker carries tenant ID, binding version, correlation ID and sync run ID
  → opens tenant-aware transaction
  → pulls from external source through Connector Hub
  → writes to tenant-isolated raw staging partition
  → records sync run: rows, watermark, errors, completed_at

Report request
  → immutable run pins dataset version, metric definition, scope digest and asOf
  → worker reads only authorized analytical snapshot
  → bounded CSV formatter with formula escaping
  → encrypted artifact in object storage with opaque key
  → short-lived authorized download; expiry and deletion audited
```

No downstream service trusts `x-tenant-id`, request-body tenant IDs, browser-selected departments or caller-supplied object keys as authority.

---

## 9. Canonical contracts

Contracts belong in `packages/contracts` and use strict validation. No local interface may duplicate a shared contract.

### 9.1 Platform context

Reuse `PlatformContextV1Schema` exactly. Analytics uses audience `gigalibs-analytics-api` and entitlement module key `analytics-studio`. The shared guard attaches the verified context; services receive a typed principal.

Minimum analytics scopes for the first slice:

- `analytics:sources:read`, `analytics:sources:write`, `analytics:sources:test`
- `analytics:syncs:read`, `analytics:syncs:run`, `analytics:syncs:cancel`
- `analytics:datasets:read`, `analytics:datasets:write`, `analytics:datasets:publish`
- `analytics:semantic:read`, `analytics:semantic:write`, `analytics:semantic:publish`
- `analytics:queries:run`, `analytics:records:read`
- `analytics:charts:read`, `analytics:charts:write`
- `analytics:dashboards:read`, `analytics:dashboards:write`
- `analytics:reports:read`, `analytics:reports:run`, `analytics:reports:schedule`
- `analytics:artifacts:download`, `analytics:lineage:read`, `analytics:admin`

Scopes are granted separately; `analytics:*` is not assigned to ordinary tenant roles. Enabling the module
does not automatically grant dataset publishing, source credentials, raw-row drill-through or report
delivery permissions.

### 9.2 Source, discovery and synchronization contracts

The first vertical slice defines strict shared contracts:

- `AnalyticsSourceConnectionV1`: connector definition reference, display name, environment, secret
  reference, network/TLS policy reference, status and optimistic version. It contains no raw secret.
- `SourceResourceV1`: stable source resource identifier, schema/catalog/table metadata, estimated row count,
  primary-key candidates, cursor candidates and discovery watermark.
- `SyncDefinitionV1`: selected resource, selected fields, mode (`SNAPSHOT` or `INCREMENTAL_CURSOR`), stable
  record key, cursor field, schedule, accepted limits and schema-drift policy.
- `SyncRunV1`: immutable attempt identity, definition version, state, timestamps, checkpoint before/after,
  rows/bytes read, inserted/updated/tombstoned counts, error class and reconciliation result.
- `SourceRecordEnvelopeV1`: tenant, source, resource, stable record key, source version/cursor, observed time,
  payload checksum, schema fingerprint, classification summary and raw payload/object reference.

Supported sync states are `QUEUED`, `DISCOVERING`, `RUNNING`, `SUCCEEDED`, `PARTIAL`, `FAILED`, `CANCELLED`
and `RECONCILING`. A failed fetch never creates a `SUCCEEDED` run with zero rows.

### 9.3 Analytical dataset contract

Each published dataset version includes:

- dataset ID and version;
- source connector reference and sync run ID/watermark;
- tenant ID and isolation profile;
- field definitions: source name, mapped name, detected type, set type, transform applied, nullable, classification;
- row count, byte size, profile stats;
- freshness status, last sync time, next scheduled sync;
- completeness status and failed-field list;
- created/updated timestamps and publishing user.

### 9.4 Semantic model and query contract

Tenant users build semantics through an allowlisted AST, not SQL. Each immutable published semantic-model
version includes:

- stable ID/version/checksum and owning tenant/user;
- pinned dataset and field versions;
- dimensions with source field, semantic type, time grain and labels;
- measures using allowlisted operations such as count, distinct count, sum, minimum, maximum and average;
- calculated measures expressed only through a bounded typed expression AST accepted at G2;
- allowlisted filters, sorts, limits and date ranges;
- declared relationships with join keys, cardinality, direction and fan-out policy;
- unit, currency, timezone, rounding, null and divide-by-zero semantics;
- row/column access policy, classification, masking and required scopes;
- freshness/completeness policy and drill-through definition.

`SemanticQueryV1` references IDs from the published model. Values are parameterized; identifiers are
resolved only from the registry. The compiler rejects unknown fields, raw SQL fragments, unsupported joins,
unbounded queries and measures that mix currencies or units without an accepted conversion definition.

### 9.5 Query response

Every metric response includes:

- metric key and definition version/checksum;
- `asOf`, source watermark and projection timestamp;
- freshness status (`FRESH | STALE | PARTIAL | REBUILDING | UNAVAILABLE`) and lag; authorization failures are rejected before query execution with 401/403 and return no dataset result;
- completeness status and missing/failed source list;
- scope summary (without leaking unauthorized department identifiers);
- unit/currency and value or dimension series;
- row count, precision/rounding metadata and drill-through availability;
- correlation ID.

A database failure never becomes an empty series. A truthful zero never becomes a fallback value.

### 9.6 Chart and dashboard contracts

- `ChartDefinitionV1`: dataset/model version, semantic query, chart type, field encodings, format rules,
  accessible title/description/table alternative and optimistic version. It contains no result payload.
- `DashboardDefinitionV1`: immutable published version containing chart references, responsive grid layout,
  global filter definitions, filter-to-field mappings and display metadata.
- Preview responses are explicitly non-published and still use the same authorization/query budget.

### 9.7 Report contracts

- `ReportDefinitionV1`: stable key/version, source dataset/metric versions, accepted parameters, columns, sort, masking policy, output formats, row limit and retention class.
- `ReportRunV1`: tenant, actor, department-scope digest, definition version, parameter digest, `asOf`, source watermark, status, attempts, timestamps and idempotency key.
- `ReportArtifactV1`: run ID, storage object reference, media type, byte size, row count, checksum, encryption key reference, created/expiry/deleted times and classification.

The browser receives neither raw storage credentials nor an unrestricted permanent object URL.

---

## 10. Additive persistence design

Do not edit applied migrations. Inventory the Connector Hub 000001-000002, Data Studio 000001-000002 and
Analytics 000001-000003 migrations, then add forward migrations only.

### 10.1 Connector Hub ingestion records

| Record | Purpose and controls |
| --- | --- |
| `source_resources` / `source_resource_fields` | Versioned discovery results for an authorized connection; no credentials. |
| `sync_definitions` / `sync_definition_versions` | Selected resource/fields, mode, record key, cursor, limits, drift policy and schedule command reference. |
| `sync_runs` | Durable attempt state, counts, checkpoint, error classification and reconciliation. Replaces the current false-complete behavior. |
| `sync_checkpoints` | Last committed source cursor/watermark under optimistic locking. Advanced only after the raw batch commits. |
| `raw_record_versions` | Append-only attributable source envelopes keyed by tenant/source/resource/record/version; payload may be in bounded JSONB or encrypted object storage. |
| `connector_outbox` | Durable events for discovery completed, sync completed/failed and raw batch ready. |

The legacy `raw_ingestion_journal` is not treated as the new analytical store. Its `ON DELETE CASCADE`,
caller-supplied `source_records`, weak provider fetch and insufficient checkpoint semantics must be
contained. New production paths use the new records after migration/backfill review.

### 10.2 Data Studio records

| Record | Purpose and controls |
| --- | --- |
| `schema_profiles` / `schema_profile_fields` | Profile version, schema fingerprint, inferred types, null/distinct statistics and bounded quality findings. |
| `mapping_definitions` / `mapping_versions` | Draft/published mappings using allowlisted typed transforms and immutable checksums. |
| `quality_rule_versions` / `quality_run_results` | Bounded assertions and attributable results for a source batch/dataset version. |
| `transformation_runs` | Input batch, mapping version, output dataset build, counts, rejected rows and failure evidence. |

The forward migration must add tenant ownership and RLS to `contract_versions`, `field_mappings` and
`quality_assertions`; the current schema enables RLS on two tables that have neither `tenant_id` nor an
isolation policy. Add tenant-safe composite relationships and backfill only attributable rows.

### 10.3 Analytics tables

| Record | Purpose and controls |
| --- | --- |
| `datasets` / `dataset_versions` | Stable tenant dataset plus immutable published versions pinned to source batch and mapping version. |
| `dataset_fields` | Typed mapped fields, semantic hints, classification, masking and department-scope binding. |
| `dataset_record_versions` | Append-only canonical JSON records with stable source key, valid-from/to sync sequence, checksum and tombstone; supports as-of queries for the bounded first release. |
| `semantic_models` / `semantic_model_versions` | Stable model plus immutable published AST/checksum and dataset dependencies. |
| `semantic_dimensions`, `semantic_measures`, `semantic_relationships` | Normalized allowlisted definitions used by the compiler. |
| `query_runs` / `query_snapshots` | Authorized query request, budget/latency/result metadata and optional reproducible snapshot. |
| `chart_definitions` | Saved chart specification referencing a published semantic model; never stores fabricated business data. |
| `dashboard_definitions`, `dashboard_versions`, `dashboard_tiles` | Saved and published layouts, chart references and global filters. |
| `analytics_audit_log` | Append-only: actor, operation, object ref, scope digest, result class, correlation ID. |
| `analytics_lineage_edges` | Connection/resource → sync run/raw version → mapping/dataset/model → query/chart/report. |

For the first release, `dataset_record_versions.payload` may use bounded JSONB, but this is an explicit
capacity-limited storage adapter, not an unlimited warehouse claim. Product, Data and SRE must accept
maximum fields, records, bytes, sync frequency, query scan, result rows and retention before G3. A later
columnar/warehouse adapter must preserve the same contracts.

### 10.4 Reports tables

| Record | Purpose and controls |
| --- | --- |
| `report_definitions` / `report_definition_versions` | Immutable accepted definitions. |
| `report_runs` | Durable state machine: `QUEUED → RUNNING → SUCCEEDED / FAILED / CANCELLED / EXPIRED`. |
| `report_artifacts` | Metadata only; encrypted bytes in object storage. |
| `report_schedules` | First release (Phase 6): timezone, next run, recipient policy, status; weekly cadence and DST semantics required. |
| `report_deliveries` | Delivery attempts, receipts, retry classification. |
| `report_audit_log` | Definition, run, download, cancellation, expiry and administrative actions. |

All tables: `tenant_id`, composite keys, `ENABLE` plus `FORCE ROW LEVEL SECURITY`, and tenant-safe foreign keys. Grant only the operations a runtime role is permitted to perform: read-write tables receive `SELECT`, `INSERT`, `UPDATE`; append-only tables (`analytics_audit_log`, `analytics_lineage_edges`, `report_audit_log`, `raw_record_versions`, `connector_outbox`, `report_runs` history) receive only `SELECT` and `INSERT` — never `UPDATE` or `DELETE`. Disallowed privileges must be explicitly revoked. Runtime roles cannot bypass RLS or own tables. Migration roles are separate and distinct from runtime roles.

---

## 11. Tenant isolation and authorization

### 11.1 Request boundary

1. BFF calls `requireVerifiedSession` and verifies active tenant entitlement and route permission.
2. BFF mints `PlatformContextV1` using the shared signer and exact audience.
3. Module uses `PlatformContextGuard`; dev token endpoints are not part of production routing.
4. Every published dataset has an accepted access policy:
   - `TENANT_WIDE`: requires an explicit tenant-wide dataset permission; persona does not imply it;
   - `DEPARTMENT_BOUND`: identifies one validated canonical department field and its mapping;
   - `DENIED`: default when policy is missing, stale or invalid.
5. Service intersects requested filters with verified organization scope:
   - `FLAT_TENANT`: access remains limited by the dataset policy and scopes;
   - `SCOPED_DEPARTMENTS`: a `DEPARTMENT_BOUND` dataset is filtered to the intersection with
     `org_scope.department_ids`; a dataset without a valid department binding is denied;
   - empty scoped list: no accessible rows, never tenant-wide fallback.
6. Query transaction sets `app.tenant_id`, actor, correlation ID and allowed department scope.
7. SQL includes explicit tenant and department predicates as application-layer defense.

### 11.2 Isolation profiles

- `ROW_LEVEL_SECURITY`: shared tables with forced RLS.
- `SCHEMA_ISOLATED`: database router selects the control-plane-approved schema binding. Identifiers resolved from trusted binding data, never concatenated from browser input.
- `DEDICATED_DATABASE`: router selects the approved connection binding. Pool quotas, rotation and lifecycle follow the tenant binding.

### 11.3 Background jobs

Every ingestion, projection and report job carries tenant ID, binding version, correlation ID, sync run ID and definition/version identifiers. Workers open the same tenant-aware transaction boundary as HTTP services. Retry payloads cannot omit or override tenant context.

### 11.4 True SaaS: every object is tenant-owned

Every object created by or for a tenant is independently authorized and isolated:

- Data source connection
- Credential reference (opaque; vault-managed)
- Sync job and checkpoint
- Raw staging partition
- Dataset version
- Field and relationship definition
- Semantic model and metric version
- Chart and dashboard
- Dashboard filter
- Report definition, run and artifact
- Schedule and recipient
- Lineage edge and audit event

Tenant A must not discover Tenant B's source names, schemas, fields, row counts, charts, cache entries, reports or storage artifacts.

### 11.5 External-source security boundary

- Database credentials are read-only, least privilege and stored as secret-manager references. The current
  database ciphertext and fixed `master-kms-key-01` reference are not a production vault design.
- Connector configuration contains no raw password, token, client secret or private key.
- PostgreSQL connections require an accepted TLS policy, certificate verification and configurable CA.
- Egress policy blocks loopback, link-local, metadata, control-plane and internal service ranges unless a
  reviewed private-connectivity binding explicitly permits the target. DNS is revalidated to prevent
  rebinding; redirects are disabled.
- Discovery and sync use allowlisted registered identifiers, quoted by the driver. Browser input never
  becomes SQL, schema, table, column or connection text.
- Source sessions are read-only with bounded connection, statement, lock and idle timeouts. Limit rows,
  bytes, fields, concurrent syncs and retry duration.
- Logs and audit records contain secret references and redacted endpoints, never credentials or source
  payloads.

---

## 12. Open-source strategy

Open source is allowed and strategically useful for this module. Adoption is not a deviation from the
vision; it is an implementation decision. Before importing code or a dependency, record an OSS adoption
decision with upstream URL/commit, selected files/packages, license/NOTICE duties, modifications, SBOM,
vulnerability status, bundle/runtime impact, accessibility evidence, upgrade owner and removal plan.

| Library | Purpose | Status |
| --- | --- | --- |
| Existing `@gigalibs/charts-react`, Recharts, Nivo or ECharts | Visualization primitives | Compare against accepted chart types, accessibility, performance, bundle size and maintenance; select one primary renderer or an explicit bounded combination. |
| Tremor source/components | Dashboard presentation | Selectively adopt only needed components; preserve Apache-2.0 notices and replace styling with GigaLibs tokens. |
| `react-grid-layout` | Dashboard canvas arrangement | May be adopted after license, keyboard/accessibility and responsive-layout proof. |
| Lightdash concepts or selected source | Semantic exploration/query-building reference | Separate source-level architecture decision; do not delete its auth and copy its query path wholesale. |
| Superset / Metabase | Feature and UX reference benchmarks | Do not embed, iframe, or install as runtime |

GigaLibs must own the resulting implementation. No iframe. No separately branded BI application. No
external authentication authority. No uncontrolled direct database access. License/provenance retained.
GigaLibs permissions, tenancy, deployment and audit boundaries apply throughout.

---

## 13. Implementation sequence and exit gates

### Phase 0 — Govern and contain

Owners: SDLC Orchestrator, Solution Architecture, Security, Product.

1. Reconcile WI-OI-039/WI-OI-042 active-Build records.
2. Register one stable External Data Analytics & Reporting work item using the next available identifier
   (`WI-OI-043` only if still free). Link requirements, risks, reviewers, accepted capacity limits and the
   complete PostgreSQL-to-report exit scenario.
3. Record one product entitlement and lifecycle. `analytics-studio` is the proposed canonical module key;
   existing `reports` entitlements require an explicit compatibility/migration decision and must not grant
   new authority silently.
4. Assign any containment code change to an authorized current work item before editing product paths.
5. Contain seeded/hardcoded analytics responses and fake actions; preserve `/api/reports` 503.
6. Remove inaccurate module-catalog and UI `Live`, `Verified`, `GA` or cryptographic-lineage claims.
7. Record the `org_scope.department_ids` adapter drift and Data Studio RLS omissions as P0 prerequisites.
8. Accept the data-flow/threat model, OSS adoption decision, permission matrix, retention policy and
   first-release capacity limits.

Exit: one canonical Build item; stable work item with accepted DoR; containment is truthful; no code was
placed under an unassigned work item.

### Phase 1 — One entitlement, production trust boundary and migrations

Owners: Control Plane, Connector, Data Studio and Analytics Backend/Data; Security and API Contracts review.

1. Define the single product entitlement and dependency graph for Connector/Data/Workflow platform services.
2. Add granular scopes from Section 9.1 without broad default grants.
3. Replace Analytics, Connector Hub, Data Studio and Workflow Studio trusted-header/dev-token paths with
   audience-specific `PlatformContextV1` verification. Browser input cannot supply canonical tenant/user.
4. Use canonical tenant IDs; remove `moduleTenantBindingId` from this flow.
5. Implement tenant database routing/transactions for all three isolation profiles.
6. Add the forward Connector, Data Studio, Analytics and Reports migrations from Section 10, forced RLS,
   least-privilege runtime/migration roles and migration/recovery verification.
7. Remove Analytics runtime DDL. Add manifests, configuration validation, readiness and dependency health.

Exit: forged/missing/expired/wrong-audience/wrong-entitlement tokens fail; two-tenant/two-department live
PostgreSQL isolation passes across HTTP and worker paths; migrations replay cleanly; no data feature is
enabled yet.

### Phase 2 — PostgreSQL source, discovery and durable ingestion

Owners: Connector Hub API/worker and SRE. This is the core missing layer.

1. Implement PostgreSQL-specific connection creation using a vault secret reference, TLS/network policy,
   read-only test and explicit source limits.
2. Discover catalogs/schemas/tables/views and fields through the PostgreSQL adapter. Return bounded row
   estimates, keys and cursor candidates without unrestricted scans.

3. Persist selected `SyncDefinitionV1`; require a stable record key per resource. Support `SNAPSHOT` and one accepted monotonic-cursor incremental mode. CDC, arbitrary SQL and unrestricted joins are excluded. Incremental ingestion semantics must be recorded in the definition before a connector is activated: ordering is deterministic by `(cursor_value, stable_record_key)` so equal-cursor ties are resolved consistently; pagination uses keyset predicates `cursor_value > checkpoint OR (cursor_value = checkpoint AND stable_record_key > last_key)` — never offset; a full rebuild at a pinned watermark must produce identical record versions and checksums; the accepted deletion policy (tombstone field, snapshot diff or explicit delete event) must be named — cursor-only ingestion cannot infer arbitrary hard deletes; a source with no stable key or no monotonic cursor is unsupported until a source-specific design is accepted.
4. Workflow Studio sends a versioned idempotent start command; Connector worker executes the source I/O.
5. Persist a `RUNNING` run before I/O, stream bounded pages, write append-only raw record versions, commit
   checkpoint only after batch commit, and publish an outbox event.
6. Classify timeout, authentication, TLS, permission, rate/limit, schema-drift and data failures. Reconcile
   timeout-after-commit before retrying.
7. Remove production acceptance of caller-provided `source_records`; never mark a failed/no-fetch run
   `SUCCEEDED` merely because zero records were returned.
8. Add on-demand and scheduled sync status UI with counts, watermark, freshness and actionable errors.

Exit: an independent external PostgreSQL instance using read-only credentials produces attributable raw
record versions and an honest sync history. Initial and incremental sync, restart/retry and Tenant A/B
isolation pass.

### Phase 3 — Profiling, mapping and published dataset

Owners: Data Studio Backend/Data and Web Experience; Product, Privacy and Data review.

1. Consume a committed raw batch by reference; do not copy browser-supplied records into the transformer.
2. Profile schema fingerprint, inferred types, null/distinct statistics, bounded min/max/pattern findings,
   primary/cursor candidates and quality issues. Suggestions are not automatically authoritative.
3. Implement draft → validate → preview/diff → publish immutable mapping versions.
4. Support only accepted transforms: rename, null handling, typed parse, date/time normalization, trim/case,
   bounded split/concat and numeric cleanup. Currency conversion and arbitrary expressions are excluded
   unless separately designed with authoritative rates.
5. Let the user classify fields, choose masking, and bind an optional canonical department field.
6. Build append-only `dataset_record_versions` with source lineage and as-of sync sequence. Reject or
   quarantine invalid rows according to the published policy.
7. Publish immutable dataset version/checksum with row/rejection counts, freshness and completeness.

Exit: a user can preview and publish a renamed/typed dataset; rejected rows are attributable; changing a
mapping creates a new version; an as-of dataset rebuild matches the committed source batch.

### Phase 4 — Semantic model and governed query engine

Owners: Analytics Backend/Data and Web Experience; Architecture/Security review.

1. Implement draft/preview/publish semantic model versions using the allowlisted AST in Section 9.4.
2. First release supports one dataset and count, distinct count, sum, min, max and average. Relationships,
   ratios/rolling calculations and multi-dataset joins remain disabled until their fan-out/unit rules pass.
3. Implement the dimension/measure/filter builder; users never enter SQL or physical identifiers.
4. Compile registry IDs to parameterized tenant-bound SQL over the accepted storage adapter. Apply access,
   column masking, department policy, scan/result/time budgets and cancellation.
5. Cache only by tenant, scope digest, dataset/model version, query hash and source watermark.
6. Return as-of, source watermark, freshness, completeness, unit/rounding and correlation metadata.
7. Implement separately authorized, paginated drill-through to mapped dataset rows with lineage.

Exit: a non-technical user creates a measure and query without SQL; aggregates reproduce from authorized
dataset rows; stale/partial/zero/error states are truthful; query injection and budget tests pass.

### Phase 5 — Chart builder and dashboard canvas

Owners: Web Experience with Analytics and Accessibility review.

1. Complete the OSS adoption gate and use the accepted renderer/component sources.
2. Define chart specifications independent of result payloads. First release: table, KPI, bar, line and area;
   pie requires an accepted category/cardinality rule.
3. Map model dimensions/measures to allowlisted encodings and validate compatibility server-side.
4. Replace all static catalog values with query responses; chart-type examples may use isolated Storybook/
   test fixtures only.
5. Save draft/published chart definitions and dashboard versions; implement responsive grid, chart add/remove,
   reorder/resize and optimistic concurrency.
6. Implement global filters with explicit filter-to-field mappings and server validation.
7. Show as-of, freshness, completeness and source status. Provide accessible table/text alternatives,
   keyboard operation and honest loading/empty/stale/partial/unavailable/unauthorized states.

Exit: a user builds and saves a real chart/dashboard from the external source; totals match the query API;
hardcoded business data is unreachable; accessibility and responsive tests pass.

### Phase 6 — CSV report, schedule and delivery

Owners: Reports worker/API within the same product work item; Security, SRE, Web and Privacy review.

1. Keep the Reports route contained until the full phase is ready.
2. Implement immutable report definition and durable idempotent run state machine.
3. Pin dataset/model/dashboard versions, filters, scope digest, as-of sync sequence and source watermark.
4. Generate CSV server-side with streaming/backpressure, spreadsheet-formula escaping and accepted row/
   byte/time/concurrency limits.
5. Store encrypted artifacts under opaque tenant/run keys, persist checksum/size/row count, and implement
   short-lived reauthorized download, revocation, expiry and verified deletion.
6. Implement weekly schedules with timezone/DST semantics, pause/resume, recipient classification policy,
   delivery provider receipt, bounded retry and duplicate suppression.
7. Audit definition, run, cancellation, download, delivery, expiry and deletion.
8. Expose the Reports UI under the same module entitlement and release it only when the API/worker passes.

Exit: scheduled CSV delivery succeeds with a real provider receipt; rerunning the same pinned snapshot
produces equivalent rows/totals; unauthorized/expired downloads fail; crash-after-upload reconciles without
duplicate artifacts or deliveries.

### Phase 7 — Operational certification and release packet

Owners: independent QA/SDET, Security, SRE/Release, Accessibility and Product reviewers.

1. Run the full authenticated PostgreSQL-source journey in Managed Cloud and Customer-Managed profiles.
2. Run Tenant A/B, flat/scoped/empty department, row/column masking and operator negative tests.
3. Run connector outage, credential revoke/rotation, schema drift, worker restart, database failover,
   checkpoint recovery, dataset rebuild, object-store outage and report reconciliation tests.
4. Run performance, quota and noisy-neighbor tests at accepted first-release limits.
5. Complete dashboards, alerts, runbooks, backup/restore, SBOM/license/vulnerability and release-manifest
   evidence.
6. Named human reviewers record independent decisions; agents do not self-approve.

Exit: the entire PostgreSQL → dataset → semantic query → chart/dashboard → scheduled CSV outcome meets the
Definition of Done. Only the supported scope is eligible for release.

### Later enhancement work items — not part of the first release

1. CSV upload using the same source/sync/dataset contracts, with malware/content/size handling.
2. Google Sheets and Salesforce OAuth adapters with provider-specific rate, token and reconciliation tests.
3. REST API adapter with explicit OpenAPI/contract, pagination and egress policy; never unrestricted URLs.
4. Multi-dataset joins, relationship suggestions, ratios, rolling calculations and advanced visualizations.
5. XLS/PDF formats after dependency/license, rendering, accessibility and retention review.
6. Selective Lightdash source adoption only if the accepted semantic/explorer gap remains.

---

## 14. Required test matrix

### 14.1 Ingestion and data quality tests

- Connector authenticates and pulls rows from a real external PostgreSQL.
- Read-only user cannot mutate the source; TLS/certificate rejection is enforced.
- Loopback, link-local, metadata, control-plane and unauthorized private-network destinations are blocked.
- DNS rebinding, redirect, connection exhaustion and oversized source responses are rejected.
- Discovery cannot execute browser-supplied SQL or unregistered identifiers.
- Snapshot sync is idempotent. Incremental sync adds/updates only eligible rows and advances the checkpoint
  only after batch commit.
- Duplicate stable key, missing key, non-monotonic cursor, out-of-order page, deleted row and source update
  follow the accepted policy and remain reconcilable.
- Full rebuild at a pinned watermark produces the same record versions/checksums.
- Sync run records rows/bytes, errors, start/end, checkpoint and reconciliation.
- Authentication revoke, source outage and timeout create honest failure/partial states; no fabricated rows.
- Caller-provided `source_records` is rejected on the production path.
- Two tenants: Tenant A's resources, checkpoints and raw versions are invisible to Tenant B's worker/query.

### 14.2 Authentication and authorization tests

- Missing, forged, expired, future-issued, wrong-issuer and wrong-audience tokens fail.
- Wrong module entitlement and missing granular scope fail.
- Tenant A cannot query, drill, export or download Tenant B data.
- Scoped Department A cannot observe sibling Department B or tenant-wide totals.
- Empty `SCOPED_DEPARTMENTS` remains empty/fail-closed.
- Platform operator gets no customer payload without separately authorized break-glass flow.

### 14.3 RLS and isolation tests

- Missing tenant context cannot return rows.
- Runtime role cannot disable/bypass RLS or run migrations.
- Tenant-safe foreign keys reject cross-tenant relations.
- ROW_LEVEL_SECURITY, SCHEMA_ISOLATED and DEDICATED_DATABASE profiles pass equivalent tests.
- Worker and HTTP paths enforce identical isolation.
- Data Studio contract versions, mappings and quality rules pass tenant-negative tests after the forward RLS repair.

### 14.4 Schema discovery and mapping tests

- Inferred types are deterministic for the same source batch and preserve original source metadata.
- Configured quality thresholds produce attributable findings for nulls, duplicate keys and parse failures.
- Preview cannot mutate the active version; publish uses expected-version concurrency and immutable checksum.
- Every allowed transform has success, boundary, invalid-input and locale/timezone tests.
- Unregistered transform/code/SQL is rejected.
- Field rename/type/classification is reflected only after publishing a new dataset version.
- Rejected rows retain source/run/mapping lineage and cannot silently disappear from completeness metadata.
- Schema add/remove/type change follows the accepted drift policy and never mutates a published dataset.

### 14.5 Semantic model and query tests

- Allowlisted measure, dimension, sort and filter IDs only; raw identifiers/SQL/comments/functions fail.
- Aggregate semantics pass null, zero, negative, decimal precision, timezone and divide-by-zero boundaries.
- Mixed currency/unit aggregation fails unless a published conversion definition explicitly permits it.
- Relationships and advanced calculations remain rejected in the first release.
- Pagination/cursor tampering and page-size cap.
- Query timeout, cancellation and cost/row limits.
- Empty, zero, stale, partial, rebuilding, unavailable and unauthorized responses are distinct.
- Error payloads do not expose SQL, schema, tenant IDs or customer data.
- Drill-through requires `analytics:records:read`; unauthorized request fails.
- Aggregate matches the as-of published dataset rows for the same scope/filter set.
- Cache cannot cross tenant, department scope, dataset/model version, query or source watermark.

### 14.6 UI and accessibility tests

- Keyboard navigation and focus order through connector setup → dataset → chart → dashboard.
- Dashboard add/remove/reorder/resize and shared-filter mapping work without a pointer and survive reload.
- Screen-reader label and equivalent data table/summary for every chart.
- Color is not the sole carrier of meaning.
- Mobile/tablet/desktop and zoom/reflow.
- Large/negative/zero values, long labels, multiple currencies, locale formatting.
- No "Live", "Verified", "GA", "real-time" claim without returned evidence from the API.
- Entitlement removal, permission removal, session expiry and direct URL access fail closed.

### 14.7 Report and artifact tests

- Idempotent duplicate create request.
- Same snapshot/definition produces equivalent rows and totals.
- Scope/permission re-evaluated at request and download.
- CSV formula injection, delimiter, newline, Unicode and quoting safety.
- Row/byte/time/concurrency cap and cancellation.
- Object key guessing, tenant swap, expired URL and deleted artifact all fail.
- Worker crash and timeout-after-upload reconciliation.
- Weekly schedule handles tenant timezone and DST; pause/resume uses optimistic concurrency.
- Disabled/unauthorized recipient is rejected; delivery retry records a real provider receipt and suppresses duplicates.

### 14.8 Resilience and performance tests

Record p50/p95/p99 latency, ingestion lag, query rows/bytes, memory, CPU, pool use and tenant-attributed cost. Test connector outage, PostgreSQL restart/failover, partial dependency failure and noisy-neighbor load.

---

## 15. Observability and operations

Required metrics and alerts:

- Sync run: rows pulled, failed, connector errors, watermark advance and lag by source.
- Dataset freshness: time since last successful sync, completeness rate.
- Query: latency, timeout count, rejected query count, cache hit rate.
- Report: queue depth, duration, bytes/rows, failures, expiry and deletion failures.
- Database: pool saturation, RLS/authorization denial count, binding failures.
- Artifact: download authorization failures and anomalous volume.

Logs: structured, include correlation, causation, module, operation, outcome and tenant-safe identifier. Do not log tokens, source payloads, report rows, presigned URLs or secrets. Runbooks cover: sync failure, connector credential rotation, dataset rebuild, artifact cleanup, tenant binding failure and rollback.

---

## 16. Migration, compatibility and recovery

1. Inventory actual deployed migration state before selecting migration numbers.
2. Use expand/migrate/verify/contract; do not edit an applied migration.
3. Deploy tables dark; backfill/rebuild; reconcile; then enable traffic by cohort.
4. Keep `/api/reports` 503 and analytics containment as rollback position.
5. Feature flags switch back to contained/unavailable — never to seeded/fabricated.
6. A failed sync releases the sync run error state; the next scheduled run retries from the last watermark.
7. A failed report release stops new jobs, drains safely and preserves auditable run/artifact state.

---

## 17. Definition of Ready

Implementation cannot begin until all are true:

- Canonical active Build item is unambiguous across every governance record.
- A stable work item exists using the next free ID, with linked FR/NFRs, accepted external-source-only scope,
  named reviewers and the exact end-to-end exit scenario.
- Product records one module entitlement and the compatibility disposition of the old Reports catalog entry.
- OSS adoption decision and provenance packet are accepted for every imported dependency/source component.
- Connector, Data Studio, Analytics and Reports-sub-capability runtime/data ownership are accepted.
- PostgreSQL adapter scope, sync semantics, department policy and first-release capacity limits are accepted.
- Threat model, data classification, retention and permission matrix accepted.
- Migration/rebuild and compatibility plan accepted.
- First-slice performance/freshness limits accepted.
- No other module in Build contrary to the WIP rule.

## 18. Definition of Done

The slice is not Done until:

- Outcome → requirement → ADR/design → contract → migration/code → tests → release evidence → production metric traceability is recorded.
- No production-reachable mock, seed, fixture, fallback, default tenant or fake receipt remains.
- Real ingestion, tenant RLS/routing, permissions, audit, observability and recovery pass.
- Loading/empty/error/stale/partial/rebuilding/unauthorized states pass.
- Migration replay, restore and rebuild pass.
- Managed Cloud and Customer-Managed profile evidence passes for each claimed profile.
- Mandatory repository build, tests and audits pass.
- Security, architecture, QA, SRE and product reviewers record independent decisions.
- No agent marks human acceptance or production release on behalf of a named reviewer.

## 19. Evidence packet

Each work item must publish or link:

- Accepted requirements and ownership matrix.
- ADRs and threat/data-flow diagrams.
- OpenAPI/event schemas and compatibility results.
- Forward migrations, verification output and recovery plan.
- Unit, contract, integration, PostgreSQL, browser, accessibility, security, performance and resilience results.
- Tenant A/B and department A/B negative evidence.
- Ingestion reconciliation and report reproduction evidence.
- SBOM/license/vulnerability evidence for new dependencies.
- Dashboards, alerts and runbooks.
- Named independent review records.
- Production observation metric and enhancement/backout decision.

## 20. Mandatory repository verification

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

A passing static audit does not override a known runtime, data-truth or governance contradiction.

## 21. Required implementation order

```text
Reconcile governance and allocate the next stable work item ID
  → contain fabricated Analytics and Reports claims
  → accept one-module DoR, security/data/OSS decisions               [Phase 0]
  → production PlatformContext + tenant DB boundary + migrations     [Phase 1]
  → PostgreSQL discovery + durable raw ingestion                     [Phase 2]
  → profile + map + publish versioned analytical dataset             [Phase 3]
  → semantic model + governed query + drill-through                  [Phase 4]
  → chart builder + versioned dashboard + shared filters             [Phase 5]
  → report run + weekly schedule + CSV artifact + delivery           [Phase 6]
  → two-profile operational certification and independent review     [Phase 7]
  → later connectors/formats/advanced semantics only as enhancements
```

No agent may reorder this sequence or split Reports into a separate customer product for this work item.
The first deliverable is one real external PostgreSQL source producing a real saved chart/dashboard and a
reproducible scheduled CSV report under one tenant entitlement.
