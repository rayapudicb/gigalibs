# WI-OI-026 — Universal Enterprise Connector Hub

Status: Review
Parent requirements: FR-02, FR-03, FR-04, FR-08, FR-14, NFR-SEC-001–005, NFR-REL-001–003, NFR-OPS-001–004
Producer: SDLC Orchestrator coordinating Product, Architecture, Backend, Web, Data, Security, QA, SRE, Release, and Documentation roles
Independent reviewers: Solution Architecture, Security & Privacy, QA/SDET, Product
Current gate: G4 completed; ready for G5/G6 independent sign-off

Prioritization record: on 2026-09-05, repository owner authorized Universal Enterprise Connector Hub development (Enterprise SaaS connector catalog, inbound webhook ingestion engine for Salesforce CRM, Coupa Procurement, and Plaid/Stripe Banking, HMAC signature verification, de-duplication buffer, and direct trigger dispatch to Workflow Studio) on Port 5180 with Port 4100 dedicated microservice and PostgreSQL 16 schema gigalibs_connectors.

## Outcome

A multi-tenant, enterprise integration and ingestion hub. Connects external systems (CRM, ERP, Procurement, Banking) into GigaLibs without brittle custom code. Validates webhook signatures, enforces idempotency, archives raw payloads into an immutable journal, and automatically dispatches verified transactions as triggers into Workflow Studio DAG pipelines.

## Product boundary

The module owns `connector_definitions`, `tenant_connections`, `connector_credentials`, `raw_ingestion_journal`, `sync_jobs`, and `audit_events` in the dedicated schema `gigalibs_connectors`.
It integrates with Port 5180 unified UI via `/connections` and BFF `/api/connectors-hub/[...path]`.
Microservice runs independently on Port 4100.
Cross-module handshakes coordinate with Data Studio (Port 3800 for schema contracts) and Workflow Studio (Port 4000 for DAG execution).

## Implemented Architecture & Evidence

1. **Dedicated PostgreSQL 16 Schema (`gigalibs_connectors`)**:
   - `000001_connectors_foundation.up.sql`: Catalog of enterprise integrations (`SALESFORCE_CRM`, `COUPA_PROCUREMENT`, `PLAID_STRIPE`, `SAP_S4HANA`, `CUSTOM_WEBHOOK`), tenant connections, credential references, raw ingestion journal, sync jobs, and audit events.
   - `000002_connectors_rls_and_vault.up.sql`: Row-Level Security enabled on all tenant tables with restrictive `tenant_isolation_policy` enforcing `tenant_id = current_setting('app.tenant_id', true)`. Extended `connector_credentials` with AES-256-GCM IV, auth tag, and PKCE hashes. Added migration ledger `gigalibs_connectors.schema_migrations`.
   - Forward migration verified against PostgreSQL 16 (`gigalibs-postgres`) with zero drift.

2. **Live Health Probe (CN-01)**:
   - `ConnectorsService.testConnection(tenantId, connectionId)` executes real live network probe (HTTP ping / TLS check) with bounded 5,000ms timeout.
   - Detects missing credentials and unreachable endpoints, updating status to `ERROR` or `UNAVAILABLE` with actual probe error evidence.
   - Proves reachability before declaring `READY`.

3. **Credential Vault & OAuth2 PKCE Engine (CN-02)**:
   - `VaultCryptoService` implements AES-256-GCM authenticated symmetric encryption with fresh 12-byte IVs and 16-byte authentication tags.
   - RFC 7636 PKCE S256 code verifier/challenge generation and timing-safe verification.
   - Token exchange securely encrypts access and refresh tokens into `connector_credentials`; plain secrets are never returned in responses or logged.

4. **Bounded Delta Sync & Durable Checkpointing (CN-03)**:
   - `SyncService.triggerSync(tenantId, connectionId, options)` replaces mock record counters with real cursor-driven delta sync.
   - Persists source records with source ID, version, and SHA-256 payload hash into `raw_ingestion_journal`.
   - Advances `cursor_after` watermark only after durable write to PostgreSQL.
   - Reconciles ingested vs duplicate counts directly from committed records.

5. **Cryptographic Webhook Ingestion Engine (CN-04)**:
   - `WebhooksService.handleInboundWebhook`: constant-time HMAC-SHA256 signature verification (`crypto.timingSafeEqual`) supporting Salesforce (`x-sfdc-signature`), Coupa (`x-coupa-signature`), Stripe (`Stripe-Signature` with timestamp), and generic HMAC.
   - Replay protection rejects timestamps outside the 300-second window.
   - Deduplication buffer matches idempotency tokens against `raw_ingestion_journal`, returning original receipt on duplicate delivery without re-executing workflows.
   - Atomic status updates (`INGESTED` → `DISPATCHED` / `FAILED`).

6. **Unified Medusa UI Experience (`/connections`)**:
   - 100% authentic Medusa UI tokens connected via Next.js BFF proxy `/api/connectors-hub/[...path]`.
   - 4 Operational Management Tabs:
     1. **Active Connections**: Live health badges, event counters, test runner, and sync trigger.
     2. **Connector Catalog**: Visual catalog of certified enterprise integrations with 1-click configuration modal.
     3. **Ingestion Journal**: Cryptographic SHA-256 audit stream linking inbound events directly to dispatched workflow runs.
     4. **Webhook Simulator & Sandbox**: Interactive test harness to dispatch simulated Salesforce, Coupa, or Plaid webhooks.

7. **Verification & Test Battery**:
   - `connectors.service.test.ts`: AES-256-GCM encryption/decryption, tampered auth tag rejection, PKCE verification, missing credential error detection, live health probe, and OAuth flow (6/6 passing).
   - `webhooks.service.test.ts`: HMAC-SHA256 validation, tampered payload rejection, Stripe timestamp format, replay attack expiration (> 300s), valid dispatch to workflow, duplicate idempotency deduplication, and disabled connection rejection (8/8 passing).
   - `sync.service.test.ts`: delta sync with source records, duplicate skipping, remote endpoint cursor watermarking, and real database count aggregation (5/5 passing).
   - Repo-wide test suite: **73 test files, 674 tests passing (100% pass rate)**.
   - Turbo build: **100/100 Turbo tasks successful**.
   - Static audits: All 6 audits (`audit:sdlc`, `audit:production-data`, `audit:all-runtime-data`, `audit:package-dependencies`, `audit:api-boundary`, `audit:navigation`) pass with code 0.
