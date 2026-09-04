# Durable Workflow Orchestration & Saga Compensation Runbook

Owner: Backend & Data Engineer + Solution Architecture  
Work item: WI-OI-017  
Standard: FR-06, FR-08, NFR-REL-001, NFR-REL-002, NFR-REL-003

## 1. Durable State Machine Architecture

Workflows in GigaLibs execute as deterministic state machines:
- **Checkpointing:** Every completed step emits an immutable `WorkflowNodeRun` row with execution input, output, and duration.
- **Node Crash Recovery:** If an execution worker process restarts mid-workflow, the recovery supervisor polls `PENDING`/`RUNNING` leases older than 360 seconds and resumes from the last completed node checkpoint.
- **Distributed Idempotency:** Inbound triggers calculate a SHA-256 idempotency key (`tenantId + triggerType + payloadHash`). A distributed Redis lock prevents duplicate executions.

## 2. Saga Compensation Pattern

When an irrevocable downstream step fails (e.g. ERP posting fails after inventory was reserved):
1. The engine pauses forward execution and transitions the run to `COMPENSATING`.
2. The orchestrator iterates backward through completed nodes that define a compensation handler:
   - `Step 3 (Post ERP - FAILED)` ➔ No compensation needed.
   - `Step 2 (Reserve Inventory - SUCCEEDED)` ➔ Executes `UnreserveInventoryHandler`.
   - `Step 1 (Authorize Payment - SUCCEEDED)` ➔ Executes `VoidAuthorizationHandler`.
3. The run status updates to `COMPENSATED` with full audit logs.
