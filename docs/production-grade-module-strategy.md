# GigaLibs production-grade module strategy

**Research date:** 2026-09-04  
**Decision horizon:** one production module at a time  
**Audience:** product, architecture, engineering, security, QA, SRE, finance/domain, and release authorities  
**Status:** architecture and delivery recommendation; not a production certification or legal opinion

## Executive decision

GigaLibs should not clone 20–100 upstream products into its monorepo. That would replace visible mock debt with license, upgrade, security, data-ownership, and operational debt.

The production strategy should be:

1. Keep `apps/playground-web` retired and make accidental reactivation impossible.
2. Finish the current Release 1 G5 evidence before putting a new product module into Build.
3. Promote exactly one bounded vertical slice at a time through the existing SDLC.
4. Own GigaLibs' canonical domain model and contracts.
5. Reuse permissive libraries inside a module; operate mature products as isolated sidecars when they genuinely remove hard infrastructure work; use official provider APIs for network/regulatory capabilities.
6. Never treat an upstream repository, a database table, a passing unit test, or a UI screen as production certification.

The recommended first module is **Customer Invoicing and Accounts Receivable (AR)**, implemented natively in the current Next.js + NestJS + PostgreSQL stack by hardening the existing legacy invoice tables. Invoice Ninja is useful as a requirements/reference implementation, but its Elastic License 2.0 creates a material hosted-service restriction. It is not the default code donor for a GigaLibs SaaS product.

## 1. What the repository actually says

### 1.1 The retired prototype is correctly outside the runtime boundary

The retirement controls are real:

- `apps/playground-web/package.json` identifies the package as `RETIRED` and contains no scripts.
- `apps/playground-web/RETIRED.md` prohibits runtime dependencies and copying its simulated records.
- `pnpm-workspace.yaml` excludes the app.
- `docs/runtime-quarantine.md` describes it as separately retired from the 109 quarantined roots.

This means the mock source is not, by itself, proof of a production-reachable mock. The immediate risk is **accidental resurrection, misleading reuse, and stale compiled artifacts**, not that the retired package currently serves production.

Two corrections to the supplied inventory matter:

- The current source declares **34** platform-admin navigation items, not 24: 17 operational, 6 administration, and 11 developer-sandbox items.
- Historical `dist/index.html` and compiled assets still exist below the retired directory. They should be removed under a reviewed cleanup work item, or the whole prototype should be moved into an explicitly non-runtime archive with hashes and retention rationale. Until then, CI must continue proving that no production manifest, dependency, image, route, or deployment context includes it.

The mock diagnosis itself is correct. Static searches confirm fabricated invoices, tickets, users, tenants, e-sign state, OCR text, geocoordinates, ledger entries, workflow runs, dashboards, and local state mutations.

### 1.2 The quarantine count is 109, but it has seven categories

The machine-readable authority contains:

| Category | Count | Meaning |
| --- | ---: | --- |
| Unimplemented stubs | 76 | Package shells or missing provider/runtime implementations |
| Fabricated adapters | 4 | AI Gateway, Razorpay, Sentry, and Stripe success-looking simulations |
| Showcase-only packages | 2 | Form engine React and CLI inventory |
| Incomplete applications | 2 | Docs and Storybook |
| Unpersisted runtime services | 5 | Chat, knowledge base, notifications, rules, and workflow Nest services |
| Unsafe financial runtime | 1 | `billing-nest` |
| Uncertified runtime packages | 19 | Source with insufficient end-to-end evidence |
| **Total** | **109** | Excluded and unavailable to production |

The four-category description in the request omits the showcase-only, incomplete-application, and unsafe-financial categories. Those omissions matter because each category has a different remediation path.

Another correction: `packages/tenancy-core` is quarantined. `packages/tenancy-nest` is active, but the two cannot be described together as an active certified pair in this snapshot.

### 1.3 The active platform is a production candidate, not a completed production platform

The repository recognizes the active boundary around:

- `apps/workflow-platform` — Next.js 15 App Router frontend;
- `apps/playground-api` — NestJS control plane;
- `apps/workflow-api` — FastAPI, PostgreSQL, Celery, and Redis execution plane;
- explicitly active shared packages, including authentication, RBAC, contracts, tenancy-Nest, and database packages.

However, `.pi/PLAN.md` says Release 1 is between G4 and G5. G5 is not passed because tracing/SLO evidence, security and supply-chain scanning, performance/resilience, accessibility/usability, clean migration/restore, and independent acceptance remain incomplete. `.pi/WORK_ITEMS.md` estimates 41% earned and 59% remaining across the blueprint. Those are stronger sources than a chat statement saying the active slices are fully certified.

Therefore the safe status language is:

> The active boundary has real implementation and local integration evidence for the Release 1 reference slice. It is not yet authorized as a complete production platform.

### 1.4 PostgreSQL persistence exists for many legacy concepts, but persistence is not completeness

The active Prisma schema already contains legacy tables for invoices, payments, clients, tickets, journal entries, e-signatures, documents, geofences, rules, fraud assessments, commerce, and other prototype concepts. The migration is explicitly named `legacy_module_baseline`.

For customer AR specifically, the schema has `Invoice`, `InvoiceLineItem`, `PaymentTransaction`, `Client`, plans, prices, and subscriptions. No production customer-AR controller/service or active Next.js journey was found. The active `/ap/invoices` endpoints operate on a separate, better-hardened `SupplierInvoice` model for accounts payable.

The legacy customer-AR schema is not safe to promote unchanged:

- `invoiceNumber` is globally unique instead of scoped to tenant, environment, and billing entity.
- Customer invoices lack `environmentId`, a bill-to snapshot, and an explicit billing-entity relation.
- `Int` totals and derived mutable balance fields lack database invariants and overflow planning.
- A payment defaults to `SUCCEEDED`, which is unsafe for any provider or manual-payment path.
- Provider transaction identity is nullable and globally unique rather than provider/tenant/environment scoped.
- Financial records cascade-delete with the invoice/tenant.
- Issued-document immutability, credit notes, allocations, delivery receipts, PDF hashes, idempotency, webhook inbox, and reconciliation are absent.
- Invoice/customer relations and financial audit semantics are incomplete.

The correct action is a **forward migration and model promotion**, not parallel `ar_*` tables created to avoid fixing the existing design.

### 1.5 Tenant isolation must be described precisely

The inspected snapshot contains a global Nest tenant-boundary guard and services that explicitly include tenant predicates. `packages/db/src/multi-tenant.ts` provides AsyncLocalStorage context and helper functions. That is valuable application-layer defense.

No SQL migration enabling PostgreSQL row-level security or defining row policies was found. The Prisma isolation-mode enum and mock strings such as `SCHEMA_ISOLATED` are not evidence that database isolation is implemented. PostgreSQL documents that row security becomes default-deny only after RLS is enabled and policies are applied; table owners and `BYPASSRLS` roles require particular care ([PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)).

This does not prove the deployed environment lacks external isolation controls. It means the repository snapshot cannot substantiate the stronger claim. WI-OI-005 and WI-OI-006 should either:

- add and test DB-enforced RLS with non-owner application roles and `FORCE ROW LEVEL SECURITY`, or
- document and certify a schema/database-per-tenant implementation, connection routing, migration fan-out, backup/restore, and failure isolation.

Application predicates remain necessary either way.

## 2. Risk assessment

| Priority | Finding | Why it matters | Required disposition |
| --- | --- | --- | --- |
| P0 if reachable | Fabricated payment/AI/provider success | Can create false money movement, external action, or evidence | Keep quarantined; replace with real sandbox/provider integration and deny on missing configuration |
| P0 if reachable | `PaymentTransaction.status` defaults to `SUCCEEDED` | A missing field can be interpreted as successful payment | Forward-migrate to `PENDING`; require verified transition evidence |
| P0 if reachable | Cross-tenant protection is not evidenced at the DB layer | A missed application predicate can disclose or mutate another tenant's data | Complete WI-OI-005 design and negative tests; adopt DB enforcement where selected |
| P0 if reachable | Cascade deletion of financial/audit records | Can erase acknowledged financial history | Restrict deletion; use retention/legal-hold and reversal/correction semantics |
| P1 | Legacy module tables exist without production APIs or lifecycle invariants | Invites accidental exposure of incomplete state | Mark inventory explicitly and promote only through one governed work item |
| P1 | Retired compiled artifacts remain | Confuses operators and can enter broad Docker/build contexts | Remove or archive under review; assert exclusion in CI |
| P1 | G5 evidence is incomplete | A real slice can still fail under load, recovery, security, or operations | Finish WI-OI-003 through WI-OI-010 before new Build work |
| P1 | Connector stubs and simulated success paths | External systems are asynchronous and ambiguous | Standard adapter contract, idempotency, receipts, reconciliation, DLQ, and runbooks |
| P2 | Package-per-feature scaffold sprawl | Increases ownership and dependency surface without user outcomes | Consolidate around vertical slices; extract packages only after two real consumers |
| P2 | “Real-time” labels on browser-local screens | Operators can act on stale or invented state | Commit → outbox → delivery → reconnect/resync path with latency SLO |

## 3. Do not clone products; choose one of five adoption modes

Every external project should receive an ADR decision using one mode:

| Mode | Use when | GigaLibs ownership |
| --- | --- | --- |
| Native vertical slice | The domain is differentiating, existing models need promotion, or integration would duplicate most of the work | UI, API, schema, rules, events, operations |
| In-process library | A narrowly scoped permissive component is stable and testable | Wrapper contract, version pin, SBOM, tests, failure handling |
| Isolated sidecar | A mature product solves a complex infrastructure problem and has a stable API | Canonical GigaLibs IDs, adapter, mapping, reconciliation, tenant/security boundary |
| Managed/provider API | The capability depends on regulated credentials, global networks, proprietary data, deliverability, or trust status | Provider abstraction, credential references, receipts, reconciliation, exit path |
| Reference only | License, architecture, or mismatch makes reuse unsafe, but workflows and edge cases are educational | Clean-room requirements; no copied source or UI |

“Standalone and unpluggable” should mean **replaceable behind an owned contract**, not “every module is a separate microservice.” A service boundary is justified by scaling, isolation, regulated data, or a distinct technology/runtime. Otherwise it adds more failure modes than independence.

### Required integration shape

```text
Next.js UI
    ↓ same-origin BFF, server auth
NestJS module and owned OpenAPI contract
    ↓ transaction
GigaLibs canonical PostgreSQL model + audit + outbox
    ↓ committed event
Worker / provider adapter / optional isolated OSS sidecar
    ↓ signed receipt or failure
Inbox + reconciliation + exception workflow
    ↓
SSE/WebSocket notification; authoritative REST resync
```

An external product never owns a second version of the same GigaLibs aggregate. Its schema is private to the sidecar. Mapping records carry tenant/environment, internal ID, external ID, version, sync status, last receipt, and reconciliation state.

## 4. Open-source candidate catalog and decisions

This is a curated production-capable shortlist covering the repository's module families. An exhaustive list of every open-source project is impossible and would be unsafe; inclusion here means “evaluate,” not “certified.” Recheck the exact license at the pinned tag, all enterprise directories, transitive dependencies, security advisories, maintenance activity, and deployment requirements before adoption.

### 4.1 Financial capabilities

| GigaLibs capability | Candidates | License observed | Recommended mode | Decision |
| --- | --- | --- | --- | --- |
| Customer invoicing and AR | [Invoice Ninja](https://github.com/invoiceninja/invoiceninja/blob/v5-stable/README.md?plain=1), [ERPNext](https://github.com/frappe/erpnext) | ELv2; GPL-3.0 | Native; references only by default | Promote existing GigaLibs models. Do not copy Invoice Ninja into a hosted product without written legal/commercial approval. ERPNext is a broad ERP and a poor in-process fit. |
| Subscription/usage billing | [Kill Bill](https://github.com/killbill/killbill); Lago as an optional AGPL evaluation | Apache-2.0; AGPL-3.0 | Sidecar after FR-16 design | Kill Bill is mature and modular but adds a Java service and its own domain. Do not adopt until metering, catalog, proration, and ownership requirements justify it. |
| Payment orchestration | [Hyperswitch](https://github.com/juspay/hyperswitch) | Apache-2.0 | Isolated sidecar or managed service | Strong candidate when multiple PSPs, routing, and failover are proven needs. Its architecture includes router, scheduler, PostgreSQL, Redis, and a locker, so operating cost is material ([architecture](https://github.com/juspay/hyperswitch/blob/main/docs/architecture.md)). |
| Double-entry ledger | [Formance Ledger](https://github.com/formancehq/ledger), [TigerBeetle](https://github.com/tigerbeetle/tigerbeetle) | Verify pinned Formance release; Apache-2.0 for TigerBeetle | Native first; sidecar benchmark later | Neither product is a complete accounting/GL policy layer. TigerBeetle is a financial transaction database. Evaluate only after transaction volume or multi-asset complexity exceeds PostgreSQL design targets. |
| Tax calculation and e-invoicing | No universal OSS clone recommended | Jurisdiction/data dependent | Provider API per market | Rules, rates, registrations, invoice clearance, and reporting change by jurisdiction. Keep tax inputs/snapshots in GigaLibs and certify each provider/country separately. |
| Fraud/KYC/sanctions | OPA/rules plus licensed data; managed fraud/KYC providers | Mixed; datasets often commercial | Managed data/provider behind owned evidence model | Do not fabricate an 0–100 score from IP/BIN fields. OpenSanctions explicitly separates open-source tooling from commercially licensed business data ([documentation](https://www.opensanctions.org/docs/)). |

### 4.2 Workflow, policy, data, and AI

| Capability | Candidates | License observed | Recommended mode | Decision |
| --- | --- | --- | --- | --- |
| Durable workflows | Existing FastAPI/Celery/Redis; [Temporal](https://github.com/temporalio/temporal) | Existing stack; MIT | Finish existing engine; Temporal only through ADR | Temporal provides durable replay and recovery, but replacing the current execution plane mid-release would reset certification. Evaluate for FR-08 gaps only after explicit migration/TCO proof. |
| Authorization/infrastructure policy | [Open Policy Agent](https://github.com/open-policy-agent/opa) | Apache-2.0 | Sidecar/library boundary | Good for declarative authorization and deployment policy. Business pricing/eligibility rules still need typed, versioned GigaLibs domain contracts and explanations. |
| Dynamic forms | [JSON Forms](https://github.com/eclipsesource/jsonforms) | MIT | In-process React library | Use as renderer only. Schema versions, submissions, authorization, validation, retention, and audit stay server-side. |
| Search and knowledge retrieval | [OpenSearch](https://github.com/opensearch-project/OpenSearch) | Apache-2.0 | Isolated sidecar | PostgreSQL remains the authority. Index through outbox, tenant-filter every document/query, monitor lag, and support rebuild. |
| Governed RAG | [Haystack](https://github.com/deepset-ai/haystack), vLLM where self-hosting is justified | Apache-2.0 | Python worker libraries/services | Frameworks do not provide authorization, citation validity, abstention, cost reconciliation, or data governance. Implement those under WI-OI-012. |
| Batch connectors / ELT | [Meltano](https://github.com/meltano/meltano) | MIT core; plugin licenses vary | Execution-plane sidecar/tool | Useful for read-oriented batch ingestion and checkpoints. Each Singer tap/target still needs separate quality, license, schema, credential, and reconciliation certification. It is not the default for external writes. |

### 4.3 Customer, operations, and collaboration

| Capability | Candidates | License observed | Recommended mode | Decision |
| --- | --- | --- | --- | --- |
| Support desk/SLA | [Chatwoot](https://github.com/chatwoot/chatwoot), [Zammad](https://github.com/zammad/zammad) | MIT; AGPL-3.0 | Chatwoot sidecar pilot; Zammad legal-gated | Do not clone Rails apps into NestJS. Choose a private-schema sidecar only if omnichannel demand justifies it; otherwise build a smaller native case/SLA slice. |
| CRM/leads/deals | [Twenty](https://github.com/twentyhq/twenty) | License review required at pinned tag | Reference or separately hosted pilot | Its TypeScript/NestJS/PostgreSQL stack is close, but copying creates a competing platform kernel and license/upgrade burden. Prefer integration with customers' existing CRM via official APIs. |
| Identity/SSO/MFA/SCIM | [Keycloak](https://github.com/keycloak/keycloak), [ZITADEL](https://github.com/zitadel/zitadel) | Apache-2.0; AGPL-3.0 with exceptions | IdP sidecar | Keycloak is the lower-license-risk default evaluation. Keep GigaLibs tenant membership, RBAC, object authorization, and audit authoritative. Never map “IdP authenticated” to unrestricted tenant access. |
| Notifications/inbox | [Novu](https://github.com/novuhq/novu) | MIT core plus commercial enterprise directories | Native outbox first; sidecar if channel complexity grows | A unified provider layer is useful, but delivery intent, provider receipt, retry, suppression/preferences, and audit must be durable in GigaLibs. |
| Outbound webhooks | [Svix](https://github.com/svix/svix-webhooks) | Verify exact pinned repository license | Sidecar evaluation | Strong fit for signing, retries, endpoint isolation, and observability. GigaLibs still owns event contracts, tenancy, endpoint authorization, and reconciliation. |
| Team chat | Zulip or Matrix/Synapse | Apache-2.0 for Zulip; AGPL/commercial considerations for Synapse | Sidecar only from validated demand | Do not build generic chat before an operational outcome requires it. Map rooms to tenant/object permissions and retain/export by policy. |
| Audio/video | [LiveKit](https://github.com/livekit/livekit), Jitsi Meet | Apache-2.0 | Sidecar | Only add for a named outcome. Consent, recording, retention, TURN, regional routing, abuse, and bandwidth operations dominate the UI work. |

### 4.4 Documents, maps, analytics, commerce, and platform services

| Capability | Candidates | License observed | Recommended mode | Decision |
| --- | --- | --- | --- | --- |
| OCR/document parsing | [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR), [Docling](https://github.com/docling-project/docling), [Tesseract](https://github.com/tesseract-ocr/tesseract) | Apache-2.0; MIT; Apache-2.0 | Python worker pipeline | Persist original hash, extracted fields with bounding boxes/confidence/model version, human corrections, and provenance. OCR output is evidence requiring review, not truth. |
| E-signature | [Documenso](https://github.com/documenso/documenso); OpenSign after license review | AGPL-3.0; verify | Sidecar or provider API | Technical signing is not automatically legally qualified. Identity proofing, consent, intent, attribution, tamper evidence, retention, jurisdiction, and trust-provider status need counsel and certification. See [EU Regulation 2024/1183](https://eur-lex.europa.eu/eli/reg/2024/1183/oj?locale=en) and the [U.S. ESIGN Act](https://www.govinfo.gov/content/pkg/USCODE-2008-title15/pdf/USCODE-2008-title15-chap96.pdf). |
| Maps/geofencing | [PostGIS](https://github.com/postgis/postgis), [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js), [OSRM](https://github.com/Project-OSRM/osrm-backend) | GPL-2.0-or-later; verify pinned licenses | PostGIS extension + map library; routing sidecar only if needed | Server performs authoritative geofence queries in PostGIS with SRID, precision, index, boundary, and dateline tests. Browser Haversine can be display assistance only. Tile/geocoder data licenses are separate. |
| BI/reporting | [Apache Superset](https://github.com/apache/superset) | Apache-2.0 | Separate analytics plane/embedded links | Do not point tenant users at unrestricted operational tables. Publish governed views/warehouse models, row filters, query limits, export audit, and freshness indicators. |
| Commerce/cart/orders | [Saleor](https://github.com/saleor/saleor) | BSD-3-Clause for core | Sidecar only for a real commerce product | A headless API is preferable to copying code. Define system of record for catalog, inventory, order, payment, refund, and tax before adoption. |
| Feature flags | Flagsmith or Unleash core | Verify exact pinned edition/license | Sidecar or small native client | Flags are operational controls, not authorization. Require environment scoping, audit, expiry, rollback, and safe defaults. |
| Object storage | S3-compatible contract; SeaweedFS only for a self-hosted requirement | Provider/project dependent | Provider abstraction | Keep object metadata, tenant/environment, classification, hash, retention, encryption key reference, and legal hold in PostgreSQL. Never store customer files only on local disk. |
| Observability | OpenTelemetry Collector + Prometheus-compatible metrics + selected backend | Component licenses vary | Shared platform service | Telemetry must use bounded labels, correlation IDs, tenant-safe redaction, sampling rules, alerts, SLOs, and runbooks. A Sentry-like stub is not telemetry. |

### 4.5 Disposition of all 109 quarantined roots

The table below closes the coverage gap between a product shortlist and the actual quarantine. It deliberately groups roots that share one production disposition. Promotion remains root-by-root and consumer-path-by-consumer-path.

| Quarantined roots/family | Count | Production disposition |
| --- | ---: | --- |
| `activity-feed-nest/react`, `audit-react`, `comments-nest/react`, `custom-fields-nest/react`, `tags-taxonomy-nest` | 8 | Build native only when required by the active vertical slice. Reuse canonical audit/outbox and tenant-scoped storage; do not create generic frameworks before two real consumers exist. |
| `api-keys-nest`, `orgs-nest/react`, `tenancy-react/core`, `users-nest/react`, `security-shield` | 8 | Continue with active auth/RBAC/tenancy contracts; evaluate Keycloak as external IdP for SSO/MFA/SCIM. `tenancy-core` needs its own promotion evidence. API keys need hashed-at-rest secrets, scopes, expiry, rotation, last-use, and audit. |
| `analytics-react`, `reports-grid-react`, `export-engine-core` | 3 | Native operational views first; Superset only as a governed analytics sidecar. Exports must be authorized, bounded, asynchronous, encrypted, expiring, and audited. |
| `data-import-export-nest/react`, `search-nest`, `storage-react/nest` | 5 | Meltano may assist read-oriented batch imports; OpenSearch is the search sidecar candidate; object storage stays behind an S3-compatible contract. GigaLibs owns schema contracts, checkpoints, metadata, retention, and tenant authorization. |
| `feature-flags-nest/react` | 2 | Evaluate Flagsmith/Unleash or a small native control after G2. Flags never grant authorization and must have environment scope, audit, expiry, safe default, and rollback. |
| `forms-engine-nest/react`, `form-engine-react`, `i18n-react` | 4 | JSON Forms may render UI. GigaLibs owns versioned schemas/submissions and server validation. Use the active Next.js localization approach rather than reviving a prototype package. |
| `presence-nest`, `scheduler-nest`, `workflow-react/nest`, `rule-engine-universal` | 5 | Finish the existing workflow execution plane and FR-06/FR-08 design. Evaluate Temporal/OPA only by ADR. Presence and schedules must derive from server leases/heartbeats and durable jobs, never timers alone. |
| `chat-nest/react`, `ai-chat-react`, `knowledge-base-core`, `notifications-nest`, `webhooks-nest/react` | 7 | Build against operational outcomes. Consider Chatwoot/Zulip for separate collaboration, Haystack for governed retrieval, Novu for channel orchestration, and Svix for outbound webhooks. Persist messages/intents/receipts and enforce tenant/document authorization. |
| `billing-nest/core`, `cart-core`, `orders-core`, `ledger-core` | 5 | AR is the first native financial promotion. Evaluate Kill Bill for subscription billing, Saleor for a real commerce product, and Formance/TigerBeetle only after quantified ledger needs. Never promote the current unsafe financial defaults. |
| `tickets-core/nest/react` | 3 | Choose either a bounded native case/SLA slice or a Chatwoot sidecar; do not port a whole help desk into NestJS. |
| `document-ocr-core`, `document-viewer-react`, `esign-core`, `integrations/azure-vision` | 4 | PaddleOCR/Docling/Tesseract worker pipeline or a real Azure Vision adapter for OCR; safe PDF viewer component after content-security review; Documenso/provider API for e-sign only after license and legal design. |
| `integrations/apple-auth`, `github-auth`, `google-auth`, `microsoft-auth` | 4 | Implement standards-based OIDC/OAuth through the selected IdP or official libraries. Each provider needs account-linking, domain/claim validation, revocation, and takeover tests. Do not maintain four unrelated auth kernels. |
| `integrations/anthropic`, `gemini`, `azure-openai`, `ai-gateway` | 4 | Replace canned responses with a provider-neutral contract, explicit model/version, timeouts, budgets, safety policy, data classification, citations, and usage reconciliation. Use official APIs/SDKs; Haystack/vLLM are optional execution components, not governance. |
| `integrations/agora`, `daily`, `jitsi`, `azure-acs` | 4 | Choose at most one media platform for a named outcome; LiveKit or Jitsi are OSS sidecar candidates. Certify JWT grants, tenant room isolation, TURN, recording consent/retention, webhooks, capacity, and regional routing. |
| `integrations/slack`, `telegram`, `whatsapp`, `vonage`, `exotel`, `msg91`, `twilio` | 7 | These are provider/network connectors, not products to clone. Implement only official APIs with per-operation capability matrices, webhook verification, idempotency, rate limits, delivery receipts, opt-out/consent, and reconciliation. |
| `integrations/apns`, `fcm`, `postmark`, `sendgrid`, `ses`, `resend` | 6 | Select the minimum providers demanded by a pilot. Novu can orchestrate after due diligence, but official delivery APIs remain authoritative. Track intent → attempt → accepted → delivered/bounced/complained; no accepted response may be called delivered. |
| `integrations/azure-blob`, `cloudflare-r2`, `gcs` | 3 | One S3/object-storage port with provider-specific adapters. Require server-side encryption, tenant-prefixed keys, checksums, signed-URL constraints, lifecycle/retention/legal hold, and restore tests. |
| `integrations/algolia`, `meilisearch`, `typesense` | 3 | Select one search backend after a relevance/scale/data-residency benchmark; OpenSearch is the current neutral default candidate. Never query without enforced tenant filters or expose provider admin keys. |
| `integrations/cal`, `google-calendar`, `microsoft-calendar` | 3 | Use standards/official calendar APIs, not a cloned scheduler. Persist external IDs, sync tokens, timezone/recurrence semantics, webhook renewal, conflicts, and reconciliation. Cal.com's licensing/product lineage must be rechecked before evaluation. |
| `integrations/google-maps`, `mapbox` | 2 | Treat tiles/geocoding as licensed provider data. Use PostGIS for authoritative geometry and MapLibre for rendering where appropriate; certify provider terms, caching, attribution, quotas, and privacy. |
| `integrations/hubspot`, `salesforce`, `quickbooks`, `xero` | 4 | Official API connectors with customer-owned credentials. Reads use checkpoints and schema drift handling; writes require approval, idempotency, receipts, conflict policy, and reconciliation. Meltano may help batch reads but does not certify writes. |
| `integrations/docusign`, `digio`, `digilocker`, `onfido` | 4 | Regulated identity/document/trust-provider integrations. Use official APIs and named legal/security review; persist consent, evidence, provider decision/version, callback signature, retention, and manual exception paths. |
| `integrations/lemonsqueezy`, `paypal`, `razorpay`, `stripe` | 4 | Keep quarantined until one PSP path is certified. Use provider-hosted/tokenized payment UI; require PENDING-first state, idempotency, verified webhooks, refund/dispute states, settlement reconciliation, and PCI review. Hyperswitch becomes relevant only when multi-PSP routing is a measured need. |
| `integrations/datadog`, `sentry`, `posthog` | 3 | Instrument once with OpenTelemetry where supported, then export to an approved backend. Explicitly classify/redact tenant and user data, control sampling/cardinality, verify ingestion, and test alert delivery. No stubbed telemetry. |
| `integrations/tesseract` | 1 | Use the real Apache-licensed engine in the isolated OCR worker if benchmarked accuracy is sufficient; otherwise use PaddleOCR/Docling or an approved provider. Store model/engine version and confidence. |
| `apps/docs`, `apps/storybook`, `cli` | 3 | Developer tooling only. Finish authentication/access, publishing, dependency scanning, secret handling, and non-production deployment controls before activation. They do not establish runtime module completeness. |

The counts above sum to 109. This mapping does not release any root from quarantine and does not imply that all listed upstream products should be installed.

## 5. Invoice Ninja: explicit decision

The local Invoice Ninja 5 reference checkout is a Laravel/PHP application with a mature invoicing domain and API. It is valuable for:

- a requirements checklist;
- terminology and lifecycle edge cases;
- import/export and interoperability exploration;
- a separately deployed internal/self-hosted proof of concept if its license permits the exact use.

It is not the recommended implementation base because its own README calls the code **source-available**, and ELv2 prohibits offering the software to third parties as a hosted or managed service when users receive access to a substantial set of its functionality. The official ELv2 FAQ describes the same restriction ([Elastic ELv2 FAQ](https://www.elastic.co/licensing/elastic-license/faq)).

Consequences:

- Do not copy its PHP source, schema, UI, or derived code into GigaLibs by default.
- Do not assume that rewriting it in TypeScript removes derivative-work risk.
- Do not strip notices, branding/license-key behavior, or protected features.
- Obtain written legal review and, if appropriate, a commercial license before any code reuse or hosted exposure.
- A clean-room native GigaLibs implementation should derive requirements from product needs, standards, and independently authored contracts—not line-by-line translation.

This is an engineering license-risk assessment, not legal advice.

## 6. One-module-at-a-time delivery model

### 6.1 Global WIP rule

- Exactly one new capability may be in **Build (G4)**.
- Later modules may be in discovery, but they may not add runtime code, tables, routes, package dependencies, or deployment resources.
- The active module cannot leave G4 while a P0/P1 gap remains.
- The next module cannot enter G4 until the current module reaches human-accepted G5 or is formally stopped/rolled back.
- Quarantine promotion is per package and per consumer path, not by family name.

Before the first new module enters Build, follow the current delivery sequence: close WI-OI-004 through WI-OI-010 and obtain independent Release 1 review under WI-OI-003. Starting another broad feature implementation first would conflict with `.pi/PLAN.md`.

### 6.2 Module gate packet

Every module needs one stable work item and this trace:

```text
measurable outcome
→ approved requirement/NFR and explicit non-goals
→ ADR, threat model, data classification, provider/license decision
→ UX + OpenAPI/events + schema/migration design
→ implementation across UI/API/domain/DB/jobs
→ negative, concurrency, recovery, migration, accessibility, and performance tests
→ dashboards, alerts, runbooks, SBOM/provenance, release evidence
→ named independent review
→ cohort rollout and observed production metric
```

For Customer AR, the SDLC orchestrator should decide whether to expand WI-OI-015 or create a new stable work item. The cleaner recommendation is a new `WI-OI-019` and an additive customer-AR requirement, because FR-16 currently covers GigaLibs usage metering and billing rather than a general tenant-facing receivables product. Do not renumber FR-01 through FR-16.

## 7. First module blueprint: Customer Invoicing and AR

### 7.1 Why this module first

- It replaces one of the clearest retired mocks with a measurable business workflow.
- Existing legacy schema gives a migration starting point without creating a parallel domain.
- It exercises the reusable production pattern: tenancy, money invariants, outbox, provider receipts, audit, exports, and real-time status.
- It can be bounded away from subscription metering, general ledger, tax calculation, e-signature, and card processing.

### 7.2 Outcome and roles

**Outcome:** an authorized finance user can create, issue, deliver, track, credit/void, and reconcile a customer invoice; the customer and auditor can see authoritative status; no money movement is invented.

**Initial roles:** AR clerk, AR manager/approver, tenant administrator, read-only auditor, customer portal payer/viewer, and platform support with explicitly approved break-glass access.

### 7.3 MVP scope

Include:

- customer and billing-contact selection with immutable bill-to snapshot on issue;
- draft invoice and line editing with integer minor units and explicit currency;
- deterministic server-side totals and tax inputs/snapshot;
- atomic invoice numbering on issue;
- immutable issued invoice plus correction through credit note or governed void;
- PDF generation, object storage, SHA-256 hash, template/version metadata;
- email delivery intent, provider attempt, durable receipt/failure, resend;
- manual payment recording with approval, and one real payment-provider webhook path if separately certified;
- payment allocations, partial payment, AR aging, overdue calculation, and customer statement;
- audit trail, export, operational metrics, exceptions, and reconciliation;
- committed status events delivered to the UI through SSE/WebSocket with REST resync.

Exclude from the first module:

- GigaLibs subscription/usage metering and plan billing;
- supplier invoices/AP, which already has its own production-reference slice;
- a general ledger or statutory accounting system;
- tax-rate determination/filing, country e-invoice clearance, foreign-exchange trading rates;
- storage or handling of raw card data;
- automated collections/dunning;
- e-signatures and contract lifecycle;
- cloning Invoice Ninja or ERPNext.

### 7.4 Data-model promotion

Use forward migrations to evolve existing models. The exact names belong in the G2 design, but the required concepts are:

| Existing model | Required hardening |
| --- | --- |
| `Client` | Add environment/billing-entity scope as required; version or snapshot billing address, tax identity, terms, locale, and contacts. Do not trust mutable aggregate counters as authoritative. |
| `Invoice` | Add environment, billing entity, client, sequence, issue/version dates, bill-to/tax snapshots, immutable document fields, BigInt minor-unit totals, creator/issuer, and status-version. Replace global number uniqueness with composite business scope. |
| `InvoiceLineItem` | Add stable line number, quantity in an exact decimal/microunit representation, unit/discount/tax amounts, product/source references, and server-calculated invariant checks. |
| `PaymentTransaction` | Default to `PENDING`; add tenant/environment, provider account, provider event/payment IDs, idempotency key, received/verified/settled times, raw-payload hash/reference, and failure/reconciliation state. |
| New sequence record | Lock by tenant + environment + billing entity + series/fiscal period; number allocation occurs in the issue transaction. |
| New credit note/allocation records | Append-only corrections and explicit allocation to invoice balances. |
| New artifact/delivery records | Object key, content hash, template version, generated time; delivery attempts, provider IDs, receipts, errors, retry schedule. |
| Existing outbox/audit | Reuse and extend the active canonical mechanisms instead of creating module-local alternatives. |

Database constraints must enforce, at minimum:

- currency matches `^[A-Z]{3}$` and all monetary values use integer minor units/declared scale;
- subtotal, discount, tax, total, paid, credited, and due reconcile exactly;
- payment allocation cannot exceed verified available payment or invoice balance;
- line totals reconcile to the header under the declared rounding policy;
- issued invoice identity is unique in its legal scope;
- provider event/idempotency identities cannot double-apply;
- issued financial records cannot be physically deleted or silently edited;
- every child record is provably in the same tenant/environment as its parent.

### 7.5 State machines

Invoice command state:

```text
DRAFT → ISSUING → ISSUED → PARTIALLY_PAID → PAID
  │        │         │             │
  └→ VOID  └→ ISSUE_FAILED         ├→ CREDITED/PARTIALLY_CREDITED
                         ISSUED ────└→ OVERDUE (derived or explicit policy)
```

Payment evidence state:

```text
RECEIVED → SIGNATURE_VERIFIED → PENDING/PROCESSING → SETTLED
    │              │                    │
    └→ REJECTED    └→ REJECTED          ├→ FAILED
                                          └→ RECONCILIATION_REQUIRED
```

No endpoint may accept an arbitrary final status. Every transition is a named command with preconditions, permission, idempotency, audit event, and failure state.

### 7.6 API and event surface

Illustrative commands/queries; finalize names through OpenAPI-first design:

- `POST /v1/ar/invoices` with an idempotency key — create draft.
- `PATCH /v1/ar/invoices/{id}` with expected version — edit draft only.
- `POST /v1/ar/invoices/{id}:issue` — atomic sequence allocation, snapshot, totals validation, audit/outbox.
- `POST /v1/ar/invoices/{id}:deliver` — durable delivery intent, not synchronous fake success.
- `POST /v1/ar/invoices/{id}:void` — governed transition with reason.
- `POST /v1/ar/credit-notes` — append-only correction.
- `POST /v1/ar/payments/manual` — permission/approval-controlled evidence.
- `POST /v1/webhooks/payments/{provider}` — verify raw body/signature, persist inbox, deduplicate, then process.
- `GET /v1/ar/invoices`, `/{id}`, `/aging`, `/statements/{clientId}` — bounded tenant-scoped queries.

Versioned events:

- `ar.invoice.issued.v1`
- `ar.invoice.delivery-requested.v1`
- `ar.invoice.delivery-status-changed.v1`
- `ar.payment.evidence-received.v1`
- `ar.payment.settled.v1`
- `ar.invoice.balance-changed.v1`
- `ar.invoice.reconciliation-required.v1`

The transaction that changes canonical state also writes the outbox event. Delivery happens after commit. Consumers keep an inbox/deduplication record. UI streams carry event sequence/cursor and reconnect instructions; on gaps or reconnect, the UI fetches the authoritative resource.

### 7.7 Payment and PCI boundary

Use provider-hosted checkout or tokenized payment elements so raw PAN/CVV never touches GigaLibs servers, logs, queues, databases, analytics, or support tools. This reduces, but does not automatically eliminate, PCI scope. The exact architecture and SAQ must be determined with a PCI-qualified specialist using the current [PCI DSS materials](https://www.pcisecuritystandards.org/standards/pci-dss/).

Each provider adapter must declare:

- credential reference and rotation/revocation behavior;
- connect/read/write timeouts, retryable error taxonomy, circuit breaker, and rate limits;
- request idempotency and webhook deduplication identities;
- signature verification and replay window;
- raw evidence retention/classification/redaction;
- accepted, pending, ambiguous, failed, and reconciliation-required results;
- reconciliation job against the provider's authoritative API/report;
- metrics, traces, alerts, runbook, and provider exit mapping.

OWASP highlights unsafe consumption of third-party APIs as a first-class API risk; provider data must be validated and constrained rather than trusted implicitly ([OWASP API Security 2023](https://owasp.org/API-Security/editions/2023/en/0xaa-unsafe-consumption-of-apis/)).

### 7.8 Test and evidence matrix

The module is not Done until this evidence exists:

| Area | Required proof |
| --- | --- |
| Persistence | Draft/issue/payment/delivery survive API, worker, Redis, and PostgreSQL restarts; no local-only state |
| Tenant/security | Cross-tenant ID/header/query/body tests; role-deny tests; direct repository negative tests; selected DB isolation test |
| Money | Property tests for totals/rounding; currency/scale checks; very large values; zero/negative/discount/credit boundaries |
| Concurrency | Concurrent issue commands cannot duplicate/skip incorrectly; optimistic edit conflicts; concurrent payment webhooks cannot over-allocate |
| Idempotency | Duplicate create/issue/delivery/provider events have one business effect and return the prior result/receipt |
| Immutability | Issued invoice edits/deletes fail; correction uses credit/void; artifact hash detects changes |
| Failure/recovery | PDF/email/provider timeout, 429, 5xx, worker crash, poison event, outbox retry, DLQ, replay, and reconciliation paths |
| Migration | Empty install, upgrade from legacy baseline, production-shaped fixture migration, rollback/roll-forward decision, backup/restore |
| API/contracts | OpenAPI generated client matches runtime; event compatibility and consumer contract tests pass |
| UI | Empty/loading/validation/forbidden/conflict/failure/retry/partial/overdue states; keyboard and WCAG 2.2 AA evidence |
| Operations | RED/golden-signal metrics, bounded labels, traces, SLOs, alerts, dashboard, on-call runbook, capacity/load results |
| Supply chain | Exact dependency licenses, SBOM, SAST/secrets/dependency/container/IaC scans, provenance and immutable artifact |
| Acceptance | Independent QA, security, finance/domain, product, and SRE reviews; named human release authorization |

All test records must be generated only in isolated non-production tenant/environments, visibly marked as tests, and excluded from customer-value metrics.

### 7.9 Suggested milestones

These are gates, not calendar promises:

1. **G0/G1 — outcome and requirements:** decide target users/regions, invoice semantics, pilot, metrics, and non-goals; establish work item and additive requirement trace.
2. **G2 — architecture/risk/data:** approve model promotion, tenant isolation, numbering, retention, provider, license, threat, and recovery ADRs.
3. **G3 — contracts/experience/tests:** freeze state machines, OpenAPI/events, UI flows, migration fixtures, SLO/load model, and acceptance suite.
4. **G4 — vertical implementation:** forward migration, repository/domain/API, Next.js screens, worker/outbox, one real delivery provider, audit/telemetry, and tests.
5. **G5 — integrated verification:** clean environment, real PostgreSQL/Redis/object storage/provider sandbox, failure injection, load, security, accessibility, backup/restore, and independent UAT.
6. **G6/G7 — release and observation:** cohort rollout, rollback criteria, reconciliation monitoring, error budget, support readiness, and measured production outcome.

### 7.10 Definition of successful first release

The first release succeeds only if a named pilot tenant can create and issue a real invoice from an empty migrated environment, the invoice remains immutable and tenant-isolated, delivery produces a real provider receipt or visible failure, duplicate payment evidence cannot double-apply, balances reconcile after restart/replay, operators can recover failures using documented controls, and all release evidence is independently accepted.

## 8. What comes after AR

Only after AR reaches accepted G5 should the next module enter Build. A dependency-aware order is:

1. Customer Invoicing and AR.
2. External delivery/webhook foundation, if AR did not fully certify it as a reusable shared capability.
3. Usage metering/subscription billing (FR-16), using real AR interfaces rather than conflating domains.
4. General ledger/accounting integration, driven by a named reporting/compliance requirement.
5. Support Desk and SLA.
6. Governed document ingestion/OCR.
7. E-signature, only after jurisdiction/trust decisions.
8. Generic rule engine and durable workflow gaps (FR-06/FR-08).
9. Tenant administration/SSO/SCIM and independently evidenced isolation.
10. Search/RAG, analytics/reporting, maps, commerce, collaboration, fraud/KYC, and broad connector catalog only from validated demand.

This is a sequencing recommendation, not permission to mark modules active. Each capability retains quarantine until its own promotion gate is passed.

## 9. Immediate actions

1. **Do not modify `apps/playground-web`.** Add a reviewed cleanup item for its compiled residue and an audit assertion that it never enters a runtime build context.
2. **Finish existing Release 1 gates.** WI-OI-003 through WI-OI-010 remain the highest-priority production work.
3. **Correct the platform inventory.** Record 34 retired navigation items, the seven-part 109 quarantine taxonomy, quarantined `tenancy-core`, and the legacy persisted-but-uncertified models.
4. **Open AR discovery through `sdlc_orchestrator`.** Recommend a new stable work item and additive requirement; do not change status by chat.
5. **Commission license review.** Explicitly decide Invoice Ninja ELv2, GPL/AGPL sidecars, open-core directories, exact pinned tags, and customer-facing exposure.
6. **Decide tenant isolation at G2.** Prove DB RLS or prove schema/database isolation; do not rely on enum labels.
7. **Harden the existing invoice schema by forward migration.** Never create a competing AR table set.
8. **Select one delivery provider and, optionally, one payment provider sandbox.** Keep raw payment card data out of scope.
9. **Build the full AR vertical slice and evidence package.** Do not start the next module until independent G5 acceptance.

## 10. Verification performed

The following repository audit implementations were run directly and passed after the report was drafted:

- `verify-runtime-data-integrity.mjs` for production and all-runtime scopes: 109 quarantined roots and retired `apps/playground-web` recognized;
- `verify-package-dependencies.mjs`: 80 active manifests recognized;
- `verify-api-module-boundary.mjs`: active Nest module boundary passed;
- `verify-navigation-boundary.mjs`: active Next.js navigation boundary passed;
- `verify-sdlc-governance.mjs`: 19 agent roles, 18 work items, FR-01–FR-16, WIP limit 1, and the 41/59 estimate reconciled.

The `pnpm audit:*` wrappers attempted dependency reconciliation through Corepack and could not proceed in the non-interactive, network-restricted environment. The underlying checked-in Node audit scripts were therefore invoked directly. Full build/test/integration/provider certification was not run because this work changed documentation only and had no configured external services.

## 11. Evidence limitations

- This assessment is static for the local snapshot and official sources available on 2026-09-04.
- The workspace has no `.git` directory, so commit history, dirty-tree state, signed tags, provenance, and branch ancestry could not be verified.
- No external deployed environment, secrets manager, PostgreSQL role configuration, object store, provider account, or production telemetry was inspected.
- Upstream project descriptions and release claims are their maintainers' claims, not independent performance/security certification.
- License and regulatory conclusions require named human legal/compliance authorities.
- No product behavior, work-item status, quarantine status, schema, or runtime code was changed by this analysis.

## Sources

Repository authorities: `.pi/PLAN.md`, `.pi/WORK_ITEMS.md`, `docs/REQUIREMENTS_BASELINE.md`, `docs/SDLC_DEVELOPMENT_GUIDE.md`, `docs/ENGINEERING_MODULE_PRODUCTION_COMPLETENESS_STANDARD.md`, `docs/runtime-quarantine.md`, `config/runtime-quarantine.json`, `apps/playground-web/RETIRED.md`, `pnpm-workspace.yaml`, and `packages/db/schema.prisma`.

The detailed internal claim/source ledger is maintained under `docs/research/production-grade-modules-report-source.md`. External links in the tables point to the relevant official project or standards sources.
