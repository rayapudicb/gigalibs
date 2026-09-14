# WI-OI-026 — Universal Enterprise Connector Hub

Status: Review
Parent requirements: FR-02, FR-03, FR-04, FR-08, FR-14, NFR-SEC-001–005, NFR-REL-001–003, NFR-OPS-001–004
Producer: SDLC Orchestrator coordinating Product, Architecture, Backend, Web, Data, Security, QA, SRE, Release, and Documentation roles
Independent reviewers: Solution Architecture, Security & Privacy, QA/SDET, Product
Current gate: G4 first vertical slice; no G5/G6 certification or release authorization

Prioritization record: on 2026-09-05, repository owner authorized Universal Enterprise Connector Hub development (Enterprise SaaS connector catalog, inbound webhook ingestion engine for Salesforce CRM, Coupa Procurement, and Plaid/Stripe Banking, HMAC signature verification, de-duplication buffer, and direct trigger dispatch to Workflow Studio) on Port 5180 with Port 4100 dedicated microservice and PostgreSQL 16 schema gigalibs_connectors.

## Outcome

A multi-tenant, enterprise integration and ingestion hub. Connects external systems (CRM, ERP, Procurement, Banking) into GigaLibs without brittle custom code. Validates webhook signatures, enforces idempotency, archives raw payloads into an immutable journal, and automatically dispatches verified transactions as triggers into Workflow Studio DAG pipelines.

## Product boundary

The module owns `connector_definitions`, `tenant_connections`, `connector_credentials`, `raw_ingestion_journal`, `sync_jobs`, and `audit_events` in the dedicated schema `gigalibs_connectors`.
It integrates with Port 5180 unified UI via `/connections` and BFF `/api/connectors-hub/[...path]`.
Microservice runs independently on Port 4100.
Cross-module handshakes coordinate with Data Studio (Port 3800 for schema contracts) and Workflow Studio (Port 4000 for DAG execution).

## Implemented Architecture & Evidence

1. **Dedicated Database Schema (`gigalibs_connectors`)**:
   - `connector_definitions`: Catalog of certified enterprise integrations (`SALESFORCE_CRM`, `COUPA_PROCUREMENT`, `PLAID_STRIPE`, `SAP_S4HANA`, `CUSTOM_WEBHOOK`).
   - `tenant_connections`: Active tenant connection instances, auth configuration, webhook endpoints, and sync settings.
   - `connector_credentials`: Vault-referenced encrypted secrets with write-only protection.
   - `raw_ingestion_journal`: Append-only archive of inbound webhooks with SHA-256 payload hashes, headers, client IPs, and status (`INGESTED`, `VALIDATED`, `DISPATCHED`, `DUPLICATE`).
   - `sync_jobs`: Polling and batch execution records with watermark tracking (`records_ingested`, `cursor_after`, `duration_ms`).
   - `audit_events`: Regulatory append-only audit trail.

2. **Dedicated NestJS Microservice (Port 4100)**:
   - Location: `modules/universal-connector-hub/apps/api`
   - Controllers: `ConnectorsController`, `WebhooksController`, `SyncController`, `HealthController`.
   - Real-time HMAC-SHA256 signature verification, de-duplication buffer, and raw journal archiving.
   - Direct integration dispatch to Workflow Studio (`http://127.0.0.1:4000/api/workflow/v1/workflows/:id/execute`).

3. **Unified Medusa UI Experience (`/connections`)**:
   - 100% authentic Medusa UI tokens connected via Next.js BFF proxy `/api/connectors-hub/[...path]`.
   - 4 Operational Management Tabs:
     1. **Active Connections**: Live health badges (`READY`), processed event counters, test egress runner, and sync trigger.
     2. **Connector Catalog**: Visual catalog of certified enterprise integrations with 1-click configuration modal.
     3. **Ingestion Journal**: Cryptographic SHA-256 audit stream linking inbound events directly to dispatched workflow runs.
     4. **Webhook Simulator & Sandbox**: Interactive test harness to dispatch simulated Salesforce, Coupa, or Plaid webhooks.
