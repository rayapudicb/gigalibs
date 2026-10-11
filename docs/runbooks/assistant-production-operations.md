# Sovereign GigaLibs Assistant: Production Operations & Runbook

**Standard:** FR-07, FR-14–FR-16, NFR-SEC-001–006, NFR-DATA-001–004, NFR-REL-001–003, NFR-OBS-001–004  
**Lifecycle Gate:** G6 / G7 Controlled Production Rollout  
**Work Item:** WI-OI-121j (`.pi/WORK_ITEMS.md`)  
**Release Manifest:** `docs/releases/gigalibs-assistant-v1.0.0-manifest.json`  

---

## 1. System Architecture & Topology

The GigaLibs Assistant operates as a **strictly sovereign, air-gapped operational intelligence system** designed to answer work-order inquiries for authorized CMMS users with real, cited data.

```
┌─────────────────────────────────────────────────────────────┐
│                       End-User Browser                      │
│                  http://127.0.0.1:5180/assistant            │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / Session Cookies
┌──────────────────────────────▼──────────────────────────────┐
│             Next.js BFF (apps/workflow-platform)             │
│        - Staged Cohort Gating (isTenantInRolloutCohort)     │
│        - Zero-Egress Guard (assertZeroEgress)               │
│        - Private Thread BFF (/api/assistant/threads)        │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
  Signed HTTP  │                  Loopback     │ Loopback
  Ed25519      │                  Port 3333    │ Port 11434
┌──────────────▼──────────────┐ ┌──────────────▼─────┐ ┌──────▼─────────────┐
│  CMMS API (:4200)           │ │  Control Plane     │ │  Ollama (:11434)   │
│  - /v1/work-orders/search   │ │  - RBAC & Session  │ │  - llama3.2:3b     │
│  - Returns work-order items │ │  - Tenant Policy   │ │  - Apple Metal GPU │
│  - Clickable citations      │ │  - Audit Logging   │ │  - 0 Bytes Egress  │
└─────────────────────────────┘ └────────────────────┘ └────────────────────┘
               │                               │
               └───────────────┬───────────────┘
                               │ PostgreSQL 16
                ┌──────────────▼──────────────┐
                │   Schema: gigalibs_assistant │
                │   - assistant_threads (RLS) │
                │   - assistant_messages (RLS)│
                │   - assistant_runs (RLS)    │
                │   - assistant_audit_events  │
                └─────────────────────────────┘
```

---

## 2. Staged Rollout Strategy (Cohorts)

Activation follows an immutable 4-stage progression:

| Stage | Identifier | Scope | Gating Rule |
| :--- | :--- | :--- | :--- |
| **0** | `STAGE_0_SHADOW` | Synthetic internal simulations | Zero customer traffic; evaluation only |
| **1** | `STAGE_1_INTERNAL_PILOT` | Internal plant facilities (`pilot-plant-01`, `test-tenant`) | Active entitlement + exact cohort enrollment |
| **2** | `STAGE_2_EARLY_ADOPTERS` | Controlled customer cohort (max 5 tenants) | Signed DPA + Customer Opt-in + Tenant Policy Published |
| **3** | `STAGE_3_GENERAL_AVAILABILITY` | All licensed tenants | Formal G7 release gate sign-off by Release Authority |

---

## 3. Database Migration & Rollback Procedure

### Forward Migration (UP)
- **Script:** `modules/gigalibs-assistant/db/migrations/000001_assistant_private_threads.up.sql`
- **Integrity Digest:** `12fd236ca327158242a46c4cd3f3937e2ae84c1d12170fea6348dd49b377c93d`
- **Action:** Creates schema `gigalibs_assistant`, tables with `FORCE ROW LEVEL SECURITY`, tenant isolation policies, and grants.
- **Verification:**
  ```bash
  psql -d gigalibs_production -c "SELECT table_name, rowsecurity FROM pg_tables WHERE schemaname = 'gigalibs_assistant';"
  # Asserts: 6 tables returned, rowsecurity = true for all.
  ```

### Rollback Migration (DOWN)
- **Script:** `modules/gigalibs-assistant/db/migrations/000001_assistant_private_threads.down.sql`
- **Integrity Digest:** `7e37dc7bfe21b4f9a68ca9e541a05c469399e073dbbb10fa00c65c88b36abcb8`
- **Action:** Drops all 6 assistant domain tables, `schema_migrations`, and associated RLS policies cleanly.
- **Rollback SLA:** `< 60 seconds` execution time without schema locking.

---

## 4. Observability & SLO Monitoring

### Core Service Level Objectives (SLOs)
1. **Air-Gap Zero Egress:** **0 Bytes** transmitted outside loopback / Docker network. Non-zero triggers immediate P0 kill-switch.
2. **Availability:** **99.9%** successful response rate across permitted queries.
3. **P95 Latency (Time-To-First-Token):** **< 4,500 ms** for local `llama3.2` 3B model on Apple Metal GPU.
4. **Error Rate:** **< 1.0%** over a 15-minute rolling window.

### Health Probes & Telemetry Endpoints
- **Health & Metrics:** `GET /api/assistant/rollout/health`
- **Audit Ledger:** `GET /assistant/audit`
- **Local Model Probe:** `curl http://127.0.0.1:11434/api/tags`

---

## 5. Incident Response & Emergency Halt Procedures

### Incident P0-A: External Egress Detection
- **Trigger:** Network sensor or `assertZeroEgress` detects non-loopback network connection attempt.
- **Automated Response:** Circuit breaker trips (`status: HALTED`), immediately aborting request processing.
- **Manual Kill-Switch:**
  ```bash
  curl -X POST http://127.0.0.1:5180/api/assistant/rollout/health \
    -H "Content-Type: application/json" \
    -d '{"action": "HALT", "reason": "P0: Network egress alert"}'
  ```
- **Triage Action:** Audit network firewall logs, verify zero remote packets egressed, inspect `assistant_runs` for correlation ID.

### Incident P0-B: Local Model Failure / Outage
- **Trigger:** `POST /api/gigalibs-assistant/...` receives `ECONNREFUSED` or timeout from `127.0.0.1:11434`.
- **System Behavior:** Fails closed gracefully. User receives:
  > *"Sovereign AI inference is temporarily unavailable. Please refer directly to the CMMS Work Orders catalog."*
- **Recovery Action:**
  ```bash
  /opt/homebrew/bin/ollama serve
  ollama run llama3.2 "ping"
  ```

### Incident P1-A: CMMS API Signature Mismatch
- **Trigger:** BFF receives HTTP 401/403 from `http://127.0.0.1:4200/v1/work-orders/search`.
- **Root Cause:** Ed25519 signing key expired, missing in `.env.local`, or clock drift.
- **Triage Action:** Check `PLATFORM_PRIVATE_KEY` in workflow-platform environment, verify container synchronization.

---

## 6. Release Authority Sign-off Matrix

| Role | Responsibility | Required Sign-Off |
| :--- | :--- | :--- |
| **Product Authority** | Validates CMMS work-order grounding, citation accuracy, zero fake outcomes | Approved |
| **Security & Privacy** | Validates forced RLS, tenant isolation, zero external egress, zero credential leakage | Approved |
| **QA / SDET** | Validates Playwright browser journey, WCAG 2.2 AA accessibility, migration idempotency | Approved |
| **Solution Architect** | Validates modularity boundaries, manifest sync, contract immutability | Approved |
| **Operations Lead** | Validates runbook, rollout cohort gates, circuit breaker halt controls | Approved |
