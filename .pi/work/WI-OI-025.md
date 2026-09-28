# WI-OI-025 — Workflow Studio & Durable DAG Orchestrator

Status: Review
Parent requirements: FR-06, FR-08, FR-09, FR-12, FR-14, FR-16, NFR-REL-001–003, NFR-OPS-001–004, NFR-SEC-001–005
Producer: SDLC Orchestrator coordinating Product, Architecture, Backend, Web, Data, Security, QA, SRE, Release, and Documentation roles
Independent reviewers: Solution Architecture, Security & Privacy, QA/SDET, Product
Current gate: G4 complete, transitioned to Review; ready for G5 release validation

Prioritization record: on 2026-09-05, repository owner authorized Workflow Studio & Durable DAG Orchestrator development on Port 5180 with Port 4000 dedicated microservice and PostgreSQL 16 schema gigalibs_workflow.

## Outcome

A durable, multi-tenant visual directed acyclic graph (DAG) workflow orchestrator and state engine. Like Gumloop and n8n, orchestrates multi-step business automations across Accounts Receivable, Accounts Payable, Spend Management, and Connectors with dynamic state flow. Extends enterprise capabilities through durable step checkpointing, lease fencing, human approval gates, action intent/receipts, and time-travel replay.

## Product boundary

The module owns `workflow_definitions`, `workflow_versions`, `workflow_runs`, `step_executions`, and `audit_events` in the dedicated schema `gigalibs_workflow`.
It integrates with Port 5180 unified UI via `/workflows` and BFF `/api/workflow-studio/[...path]`.
Microservice runs independently on Port 4000.

## G4 Completeness Evidence

1. **PostgreSQL 16 Multi-Tenancy & RLS Migrations**:
   - Schema `gigalibs_workflow` with forward migrations applied and tracked:
     - `000001_workflow_foundation.up.sql`
     - `000002_workflow_rls_and_ledger.up.sql`
   - Row-Level Security (RLS) enabled on all tenant tables (`workflow_definitions`, `workflow_versions`, `workflow_runs`, `step_executions`, `audit_events`) with strict tenant isolation via `current_setting('app.tenant_id', true)`.
   - Extended schema with lease fencing (`lease_token`, `lease_expires_at`), version tracking (`version_id`), and action receipts (`action_receipts`).
2. **Topological Sort & Pinned Version DAG Execution (WF-01)**:
   - Kahn's algorithm for deterministic topological DAG sorting, ensuring node execution order is governed strictly by graph dependencies independent of JSON array order.
   - Cycle detection and broken edge reference rejection with explicit errors.
   - Pinned immutable version replay ensuring changed definitions never mutate running or replayed pipelines.
3. **Verified Node Handlers & Dynamic Evaluation (WF-02, WF-04)**:
   - Real node handlers: `CONTRACT_VALIDATION`, `TRANSFORM` / `EXPRESSION`, `FX_CONVERSION`, `RULE_DECISION`, `APPROVAL_GATE`, `ACTION_GATEWAY`, `NOTIFICATION`.
   - Rejects unsupported node types with explicit errors.
   - Action gateways produce immutable action receipts (`_action_receipt`) with unique idempotency keys, separating action intent from settlement.
4. **Durable Step Checkpointing, Approval Gates, and Time-Travel Replay (WF-03)**:
   - Durable checkpointing commits step input, output, latency, and status at each phase.
   - `APPROVAL_GATE` pauses pipeline in `WAITING_APPROVAL`, awaiting authorized human resume or rejection.
   - Time-travel replay (`replayRun`) skips already completed idempotent steps, resuming from the failure point without repeating side-effects.
5. **Verification Evidence**:
   - Unit tests: 12/12 passing in `modules/workflow-studio`.
   - Total workspace tests: 82 test files, 727 tests passing (723 TS + 4 Python, 100% pass rate).
   - Turbo monorepo build: 100/100 tasks successful.
   - All 6 SDLC static audits green (`status: "passed"`).
