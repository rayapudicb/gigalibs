# WI-OI-025 — Workflow Studio & Durable DAG Orchestrator

Status: Review
Parent requirements: FR-06, FR-08, FR-09, FR-12, FR-14, FR-16, NFR-REL-001–003, NFR-OPS-001–004, NFR-SEC-001–005
Producer: SDLC Orchestrator coordinating Product, Architecture, Backend, Web, Data, Security, QA, SRE, Release, and Documentation roles
Independent reviewers: Solution Architecture, Security & Privacy, QA/SDET, Product
Current gate: G4 first vertical slice; no G5/G6 certification or release authorization

Prioritization record: on 2026-09-05, repository owner authorized Workflow Studio & Durable DAG Orchestration Engine development (Multi-step DAG visual canvas, durable execution state machine, step-level checkpointing, saga compensation rollbacks, point-in-time time-travel replay, and cross-module pipeline orchestration) on Port 5180 with Port 4000 dedicated microservice and PostgreSQL 16 schema gigalibs_workflow.

## Outcome

A multi-tenant, enterprise workflow automation and DAG pipeline engine. Acts as the central orchestrator connecting Universal Data Studio (contracts validation), MultiCurrency (FX conversion), Universal Rule Pro (decision gates), Accounts Receivable (invoicing), Spend Management (P2P approvals), Tax Configuration (statutory rates), and Cryptographic E-Sign into automated, durable end-to-end value chains.

## Product boundary

The module owns `workflow_definitions`, `workflow_versions`, `workflow_runs`, `step_executions`, and `audit_events` in the dedicated schema `gigalibs_workflow`.
It integrates with Port 5180 unified UI via `/workflows` and `/workflows/[wfId]/canvas` and BFF `/api/workflow-studio/[...path]`.
Microservice runs independently on Port 4000.
Cross-module handshakes coordinate all platform microservices via standardized event and step-execution contracts.

## Implemented Architecture & Evidence

1. **Dedicated Database Schema (`gigalibs_workflow`)**:
   - `workflow_definitions`: Tenant-scoped pipeline metadata, categories (`ORDER_TO_CASH`, `PROCURE_TO_PAY`, `TREASURY_HEDGING`), trigger configurations.
   - `workflow_versions`: Immutable published versions containing full DAG nodes and edges graphs.
   - `workflow_runs`: Durable execution state, idempotency keys, correlation IDs, execution latencies, and transaction status.
   - `step_executions`: Granular step-level checkpointing recording inputs, outputs, timestamps, and service targets.
   - `audit_events`: Regulatory append-only audit trail.

2. **Dedicated NestJS Microservice (Port 4000)**:
   - Location: `modules/workflow-studio/apps/api`
   - Controllers: `WorkflowsController`, `ExecutionController`, `RunsController`, `HealthController`.
   - Durable sequential DAG executor with step-level rollback and retry capabilities.
   - Point-in-time time-travel replay engine (`/api/workflow/v1/runs/:runId/replay`).

3. **Universal Cross-Module Handshake**:
   - Seamlessly coordinates with Data Studio (Port 3800), MultiCurrency (Port 3700), Universal Rule Pro (Port 3900), Tax Configuration (Port 3600), Accounts Receivable (Port 3400), and Spend Management (Port 3500).
   - Zero point-to-point hardwiring; loosely coupled step definitions with standard JSON schema envelopes.

4. **Next.js Workflow Platform UI (Port 5180)**:
   - Authentic Medusa UI token design at `/workflows` (Pipeline catalog, live runner, run journal, architecture handshake).
   - Interactive ReactFlow visual DAG canvas at `/workflows/[wfId]/canvas` with node configuration inspector and live execution runner modal.
   - Draft creation flow at `/workflows/new`.
