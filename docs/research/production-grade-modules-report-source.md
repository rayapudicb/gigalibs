# Production-grade module strategy — research source ledger

Research date: 2026-09-04  
Scope: GigaLibs repository snapshot plus current official upstream project, standards, and legal sources.  
Purpose: Canonical evidence ledger for `docs/production-grade-module-strategy.md`.

## Repository evidence

| Claim | Evidence | Confidence / qualification |
| --- | --- | --- |
| Release 1 is between G4 and G5; G5 evidence is incomplete. | `.pi/PLAN.md`, current-gate and delivery-sequence sections | High; repository-declared status, not independent certification. |
| All 18 registered work items are in Review; delivery estimate is 41 earned / 59 remaining. | `.pi/WORK_ITEMS.md` | High; planning estimate only. |
| The quarantine contains exactly 109 roots in seven categories: 76 + 4 + 2 + 2 + 5 + 1 + 19. | `config/runtime-quarantine.json`; `docs/runtime-quarantine.md` | High; machine-readable authority. |
| `apps/playground-web` is retired and workspace-excluded. | `apps/playground-web/package.json`; `apps/playground-web/RETIRED.md`; `pnpm-workspace.yaml` | High. |
| The retired UI currently declares 34 platform-admin navigation items, not 24. | `apps/playground-web/src/App.tsx`, navigation groups around lines 948–1037 | High for this snapshot; count is 17 operational + 6 admin + 11 sandbox. |
| The retired source contains fabricated invoice, tenant, ticket, signature, OCR, map, ledger, workflow, and analytics records. | `apps/playground-web/src/App.tsx`; `apps/playground-web/src/components/*` | High. |
| Historical compiled output remains under `apps/playground-web/dist`. | File-system inventory | High; it is not included by current workspace configuration, but is misleading residue. |
| Legacy `Invoice`, `InvoiceLineItem`, `PaymentTransaction`, `Client`, `SupportTicket`, `JournalEntry`, e-sign, geofence, rule, and fraud tables already exist in the active Prisma schema. | `packages/db/schema.prisma`; migration `20260902030000_legacy_module_baseline` | High. A table is not evidence of a production module. |
| No customer-AR controller/service is present in `apps/playground-api`; existing invoice endpoints are AP supplier-invoice endpoints. | Search of `apps/playground-api/src` and `apps/workflow-platform` | High for this snapshot. |
| The legacy AR model has unsafe/incomplete invariants: globally unique number, tenant-only scope, mutable totals, cascade deletion, and payment status defaulting to `SUCCEEDED`. | `packages/db/schema.prisma` lines 763–905 | High static-analysis finding; runtime reachability is not established. |
| Tenant enforcement found in this snapshot is primarily application-level: Nest guard plus explicit tenant predicates / AsyncLocalStorage helpers. No SQL `CREATE POLICY` or `ENABLE ROW LEVEL SECURITY` migration was found. | `packages/tenancy-nest/src/guards/tenant-boundary.guard.ts`; `packages/db/src/multi-tenant.ts`; migration search | High for the inspected snapshot. This does not prove no external DB control exists. |
| `packages/tenancy-core` is quarantined, although `tenancy-nest` is active. | `config/runtime-quarantine.json`; workspace configuration | High. |
| The supplied snapshot has no `.git` directory. | File-system check | High. This prevents commit-history, dirty-tree, and provenance validation from this environment. |

## Local Invoice Ninja evidence

| Claim | Evidence | Confidence / qualification |
| --- | --- | --- |
| The local reference checkout is Invoice Ninja 5 and describes itself as source-available. | Local Invoice Ninja 5 `README.md`, lines 9–18 | High. |
| It is licensed under Elastic License 2.0. | Local `LICENSE`, line 1 | High. |
| ELv2 prohibits providing the software as a hosted/managed service when customers receive access to a substantial set of its features. | Local `LICENSE`, lines 7–15; official ELv2 FAQ | High as a license-text observation. Application to GigaLibs requires counsel. |

## External primary sources

### Finance and payments

- Invoice Ninja repository and license: <https://github.com/invoiceninja/invoiceninja/blob/v5-stable/README.md?plain=1>
- Elastic License 2.0 FAQ: <https://www.elastic.co/licensing/elastic-license/faq>
- ERPNext repository (GPL-3.0; ERP/accounting): <https://github.com/frappe/erpnext>
- Kill Bill repository (Apache-2.0; subscription billing/payments): <https://github.com/killbill/killbill>
- Hyperswitch repository and architecture (Apache-2.0; payment orchestration): <https://github.com/juspay/hyperswitch>, <https://github.com/juspay/hyperswitch/blob/main/docs/architecture.md>
- Formance Ledger (ledger primitives): <https://github.com/formancehq/ledger>
- TigerBeetle architecture (financial transaction database, not a complete GL): <https://github.com/tigerbeetle/tigerbeetle/blob/main/docs/ARCHITECTURE.md>

### Product capabilities

- Keycloak (Apache-2.0 IAM): <https://github.com/keycloak/keycloak>
- ZITADEL licensing and product repository (AGPL-3.0 with directory exceptions): <https://github.com/zitadel/zitadel>, <https://github.com/zitadel/zitadel/blob/main/LICENSING.md>
- Chatwoot (MIT support/omnichannel): <https://github.com/chatwoot/chatwoot>
- Zammad (AGPL-3.0 help desk): <https://github.com/zammad/zammad>
- Documenso (AGPL-3.0 e-sign): <https://github.com/documenso/documenso>
- PaddleOCR (Apache-2.0 OCR/document parsing): <https://github.com/PaddlePaddle/PaddleOCR>
- Docling (MIT document conversion): <https://github.com/docling-project/docling>
- Tesseract OCR (Apache-2.0): <https://github.com/tesseract-ocr/tesseract>
- Open Policy Agent (Apache-2.0 policy engine): <https://github.com/open-policy-agent/opa>
- Temporal (MIT durable execution): <https://github.com/temporalio/temporal>
- PostGIS (GPL-2.0-or-later spatial extension): <https://github.com/postgis/postgis>
- MapLibre GL JS (map rendering): <https://github.com/maplibre/maplibre-gl-js>
- OSRM (routing engine): <https://github.com/Project-OSRM/osrm-backend>
- OpenSearch (Apache-2.0 search/analytics): <https://github.com/opensearch-project/OpenSearch>
- Apache Superset (Apache-2.0 BI): <https://github.com/apache/superset>
- JSON Forms (MIT JSON-Schema UI): <https://github.com/eclipsesource/jsonforms>
- Novu (MIT core plus commercial enterprise directories): <https://github.com/novuhq/novu>
- Svix webhooks service: <https://github.com/svix/svix-webhooks>
- Saleor (BSD-3-Clause headless commerce): <https://github.com/saleor/saleor>
- Twenty CRM (license review required; TypeScript/Nest/PostgreSQL stack): <https://github.com/twentyhq/twenty>
- Meltano (MIT data integration engine; plugin licenses vary): <https://github.com/meltano/meltano>
- Haystack (Apache-2.0 RAG/LLM framework): <https://github.com/deepset-ai/haystack>
- LiveKit (Apache-2.0 real-time audio/video): <https://github.com/livekit/livekit>

### Standards and regulatory anchors

- PostgreSQL row-security documentation: <https://www.postgresql.org/docs/current/ddl-rowsecurity.html>
- PCI DSS overview/document library: <https://www.pcisecuritystandards.org/standards/pci-dss/>
- OWASP API Security Top 10 (2023), including unsafe API consumption: <https://owasp.org/API-Security/editions/2023/en/0x03-introduction/>, <https://owasp.org/API-Security/editions/2023/en/0xaa-unsafe-consumption-of-apis/>
- EU Regulation 2024/1183 (European Digital Identity / amended eIDAS): <https://eur-lex.europa.eu/eli/reg/2024/1183/oj?locale=en>
- U.S. ESIGN Act text: <https://www.govinfo.gov/content/pkg/USCODE-2008-title15/pdf/USCODE-2008-title15-chap96.pdf>
- OpenSanctions documentation (software vs commercially licensed dataset): <https://www.opensanctions.org/docs/>

## Interpretation rules

- A repository, license, release, or maintainer claim is candidate evidence, not GigaLibs production certification.
- License names describe the inspected upstream state as of the research date and must be rechecked at the exact pinned tag and for every bundled directory/dependency.
- AGPL/GPL/ELv2 and open-core candidates require legal review before architectural commitment; this report does not give legal advice.
- Regulatory compliance cannot be inherited by copying code. It depends on deployment, operations, controls, contracts, data flows, jurisdiction, and human acceptance.
- “Real-time” means committed server state delivered with sequence/reconnect/resync semantics, not client timers or browser-local calculations.
