# Architecture Design: Workflow Studio Delta-5 Integration

## Document Metadata
- **Work Item:** `WI-OI-056`
- **Module:** `modules/workflow-studio`
- **Blueprint References:** `FR-05` (Workflow Orchestrator & Studio), `FR-08` (Cross-Domain Choreography), `TP-3` (Transactional Inbox), `TP-5` (Cryptographic Ledger Sealing)
- **Status:** Approved for Implementation (Gate G3)
- **Author:** Solution Architecture / Core Platform / QA/SDET

---

## 1. Context & Business Drivers

Workflow Studio (`modules/workflow-studio`) provides deterministic DAG topological execution, durable checkpointing, lease fencing, and action receipts for business workflows. Under the Delta-5 enterprise platform baseline, Workflow Studio requires:
1. **Tamper-Evident Execution Ledger Sealing:**
   - Every completed or terminated workflow execution run (`gigalibs_workflow.workflow_runs`) must be sealed into a hash-chained cryptographic ledger (`seal_hash`, `previous_seal_hash`, `seal_sequence`).
   - Fail-closed audit verification API (`VALID`, `UNSEALED`, `INVALID`, `INCOMPLETE`) to detect broken chains, sequence skips, or modified run states.
2. **Schema-Aware Sensitive Data Redaction:**
   - Sanitizes authorization tokens, passwords, secrets, API keys, and personal/financial data in workflow execution triggers, pipeline states, and step inputs/outputs before database persistence.
3. **Transactional Inbox Deduplication:**
   - Idempotent event ingestion via `gigalibs_workflow.inbox_events` with tenant isolation Row-Level Security (RLS) and atomic `SELECT ... FOR UPDATE` deduplication.
4. **Audit & Ledger Verification Route:**
   - `@Get('runs/ledger/verify')` exposed on `RunsController`.

---

## 2. Technical Architecture & Component Design

```
           [ Inbound Webhook / Event Trigger ]
                         │
                         ▼
        ┌───────────────────────────────────┐
        │        WorkflowInboxService       │
        │  (Transactional Event Dedup & RLS)│
        └─────────────────┬─────────────────┘
                          │
                          ▼
        ┌───────────────────────────────────┐
        │         ExecutionService          │
        │   - Topological DAG Validation    │
        │   - Sensitive Data Redaction      │
        │   - Step Checkpointing & Leases   │
        └─────────────────┬─────────────────┘
                          │
                          ▼
        ┌───────────────────────────────────┐
        │       workflow-run-seal.ts        │
        │  (Deterministic SHA-256 Ledger)   │
        └─────────────────┬─────────────────┘
                          │
                          ▼
        ┌───────────────────────────────────┐
        │    gigalibs_workflow Database     │
        │  - workflow_runs (sealed)         │
        │  - step_executions (sanitized)    │
        │  - inbox_events (deduped)         │
        └───────────────────────────────────┘
```

### 2.1 Database Migration Schema (`000003_workflow_ledger_seals_and_inbox.up.sql`)
1. Extend `gigalibs_workflow.workflow_runs`:
   - `seal_hash VARCHAR(64) NULL`
   - `previous_seal_hash VARCHAR(64) NULL`
   - `seal_sequence BIGINT NULL`
   - Unique conditional index: `runs_tenant_seal_sequence_idx ON gigalibs_workflow.workflow_runs (tenant_id, seal_sequence) WHERE seal_sequence IS NOT NULL`
2. Create `gigalibs_workflow.inbox_events`:
   - `id VARCHAR(64) PRIMARY KEY`
   - `tenant_id VARCHAR(64) NOT NULL`
   - `source VARCHAR(64) NOT NULL`
   - `event_id VARCHAR(128) NOT NULL`
   - `event_type VARCHAR(64) NOT NULL`
   - `payload JSONB NOT NULL`
   - `status VARCHAR(32) NOT NULL DEFAULT 'RECEIVED'`
   - `received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `processed_at TIMESTAMPTZ NULL`
   - Unique constraint: `uq_workflow_inbox (tenant_id, source, event_id)`
   - Enable Row-Level Security with tenant isolation policy.

### 2.2 Cryptographic Execution Ledger Sealing
- Genesis hash: `0000000000000000000000000000000000000000000000000000000000000000`
- Deterministic canonical JSON serialization over:
  - `completedAt`, `correlationId`, `previousSealHash`, `runId`, `sequence`, `status`, `tenantId`, `version`, `workflowCode`.
- Verification states:
  - `VALID`: Perfect cryptographic continuity and sequence monotonic increment.
  - `UNSEALED`: Runs exist without seals.
  - `INVALID`: Hash rupture or run payload tampering detected.
  - `INCOMPLETE`: Gap in sequence numbers detected.

### 2.3 Sensitive Data Redaction
- Key patterns: `password`, `token`, `secret`, `authorization`, `credit_card`, `cvv`, `api_key`, `bank_account`, `iban`, `ssn`.
- Replaces matches with `[REDACTED]` and returns `redactedFields` path list.

---

## 3. Verification & Acceptance Criteria
1. Migration applies cleanly and registers in `gigalibs_workflow.schema_migrations`.
2. Execution sealing functions deterministically and verifies multi-block chains.
3. Transactional inbox handles duplicate event replays safely without double execution.
4. All existing workflow tests + new tests pass with 100% pass rate.
5. Zero modifications to the 7 CMMS protected file hashes.
6. All 6 repository SDLC audits pass cleanly.
