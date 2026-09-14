# WI-OI-034: Plug-and-Play Universal Rule Engine Kernel & No-Code Visual Rule Studio

**Owner**: Solution Architect & Systems Engineer  
**Status**: Review  
**Gate**: G4 (Execution & Verification)  
**Requirements**: FR-06, FR-08, FR-12, FR-14, FR-16, NFR-REL-001–003, NFR-SEC-001–005, NFR-OPS-001–004  

---

## 1. Context & Business Problem
Traditional rule engines in enterprise software are either static hardcoded `if/else` checks or developer-centric JSON ASTs that non-technical business users cannot create or manage. Furthermore, they are tied to specific schemas, making them impossible to plug into arbitrary external applications, Kafka message topics, or API Gateways without writing custom adapter code.

`WI-OI-034` delivers a **Zero-Knowledge, Plug-and-Play Universal Rule Engine Kernel** capable of evaluating arbitrary payloads from ANY host application without prior knowledge of request or response models, paired with a **No-Code Visual Rule Studio (`/rules/studio`)** for non-technical users.

---

## 2. Deliverables Produced

### 2.1 Zero-Knowledge Dynamic Schema Introspector
File: `apps/workflow-platform/lib/universal-rule-kernel-store.ts`
- Method: `introspectPayload(payload: any): DiscoveredField[]`
- Recursively crawls unknown JSON payloads, flattens nested keys, and detects data types (`NUMBER`, `STRING`, `BOOLEAN`, `ARRAY`, `OBJECT`).
- Generates human-friendly labels automatically, populating no-code visual dropdowns live.

### 2.2 Universal JSON Pointer & Operator Evaluator
- Method: `resolvePath(target: any, path: string): any`
- Safe dot-notation and array wildcard navigation (`order.total`, `lines[*].unit_price`, `headers['x-api-key']`) with zero crashing on missing keys.
- Universal Operator Matrix:
  - Numeric: `EQUALS`, `NOT_EQUALS`, `GREATER_THAN`, `LESS_THAN`, `BETWEEN`.
  - String & Sets: `CONTAINS`, `STARTS_WITH`, `IN_SET`, `NOT_IN_SET`, `REGEX_MATCH`.
  - Collections: `IS_EMPTY`, `IS_NOT_EMPTY`.
  - Comparative: `EXCEEDS_PERCENT_OF_FIELD` (cross-field dynamic variance calculations).

### 2.3 Universal Action Protocol
Five standard intervention verdicts returned in sub-millisecond latency:
- `PASS`: Proceed with execution normally.
- `BLOCK_DROP`: Abort transaction, return HTTP 403 or drop from pipeline.
- `MUTATE_ENRICH`: Inject headers, tags, or normalize payload fields.
- `REROUTE_TOPIC`: Divert payload to alternate Kafka topic, RabbitMQ queue, or Dead-Letter Queue.
- `HOLD_TRANSACTION`: Set transaction to hold in target system and dispatch dispute/alert.

### 2.4 Full Rule Lifecycle & 1-Click Emergency Kill-Switch
- Lifecycle states: `DRAFT` → `SHADOW / SIMULATION` → `ACTIVE` → `HIJACKED / PAUSED` → `DEPRECATED`.
- Emergency Kill-Switch (`toggleHijack`): Instantly pauses or resumes any non-statutory rule in 1 click.
- Statutory System Rule Protection: Prevents security guardrails from being deleted or hijacked by tenants.

### 2.5 Historical Shadow Simulator
- Method: `simulateRule(rule, sampleEvents): SimulationReport`
- Evaluates drafted rules against historical production events before deployment.
- Reports total evaluated, match rate %, simulated actions, and false-positive safety checks (`PASSED` vs `HIGH_FALSE_POSITIVE_RISK`).

### 2.6 User Interface: No-Code Visual Rule Studio
Route: `/rules/studio`
- **Tab 1 (Sentence Builder)**: Natural-language builder (`WHEN [Trigger] IF [Field] [Operator] [Value] THEN [Action] [Target]`) with live schema drop zone.
- **Tab 2 (Rule Inventory)**: Real-time management table with 1-click Emergency Kill-Switch and status badges.
- **Tab 3 (Shadow Simulator)**: Interactive replay runner against historical traffic.
- **Tab 4 (Plug & Play Guide)**: Copy-pasteable 3-line snippets for Node.js, Python, and cURL.

---

## 3. Verification & Evidence
- **Automated Vitest Tests**: 7/7 unit tests pass in `apps/workflow-platform/__tests__/universal-rule-kernel.test.ts`.
- **Full Suite**: 96/96 tests pass across 20 test files repo-wide.
- **Static Page Generation**: 77 static pages and all dynamic API routes compiled cleanly in Next.js 15.5.24 (`/rules/studio` size: 9.66 kB).
- **Sub-Millisecond Execution**: Average evaluation latency: **0.16ms – 0.22ms**.
- **Live HTTP Verification (Port 5180)**:
  - `GET /api/rules/kernel/rules` -> `HTTP 200 OK` (rules returned).
  - `POST /api/rules/kernel/introspect` -> `HTTP 200 OK` (auto-discovered fields on unknown JSON).
  - `POST /api/rules/kernel/evaluate` -> `HTTP 200 OK` (executed `REROUTE_TOPIC` in 0.22ms with FIPS SHA-256 seal).
  - `GET /rules/studio` -> `HTTP 200 OK` (68,993 bytes HTML rendered).
- **Mandatory Audits**: All 6 governance audits passed (`audit:production-data`, `audit:all-runtime-data`, `audit:package-dependencies`, `audit:api-boundary`, `audit:navigation`, `audit:sdlc`).
