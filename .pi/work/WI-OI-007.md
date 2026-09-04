# WI-OI-007 — Operational metrics and correlation slice

Status: Review  
Parent requirements: FR-11, NFR-OBS-001, NFR-OBS-002, NFR-OBS-004, NFR-OPS-001  
Producer: Infrastructure Observability + Backend Domain  
Independent reviewers: QA Spec, Security & Privacy  
Gate: G2–G5

## Outcome

An authorized platform scraper can observe real control-plane request latency/error volume and durable
operational backlog/state without tenant data, credentials, payloads, or high-cardinality identifiers.
Operators can distinguish a healthy scrape from failed database collection.

## Confirmed gaps

- Health/readiness existed, but no machine-scrapable metrics endpoint.
- Request rate, status and latency were not measured.
- Durable outbox, source-event, connector, exception, action and retention states were not exposed to
  platform operations.
- No scraper authentication contract or metrics runbook existed.
- The execution plane did not expose its durable run, step or outbox state.
- Incoming correlation IDs were unbounded, early execution-plane responses were not consistently
  correlated, and the global error path logged raw request URLs and exception text.
- Distributed traces, dashboards, alerts and measured SLO/load evidence remain later slices of WI-OI-007.

## Scope

- Prometheus text exposition from the NestJS control plane.
- Configured bearer credential dedicated to metrics scraping.
- Bounded labels only: HTTP method, registered route template, status; operational enum states.
- Process uptime/memory plus aggregate durable-state gauges from PostgreSQL.
- Execution-plane aggregate run, step and outbox gauges from its separately owned PostgreSQL database.
- One bounded correlation-ID contract across the control and execution HTTP boundaries.
- Explicit database-collector success/failure metric; no cached or fabricated fallback.
- Automated negative authorization, content, cardinality/privacy and live-data certification.

## Non-goals

- Tenant/customer-facing analytics.
- Tenant ID, user ID, source ID, event ID, email, route parameter value or payload labels.
- Tracing, alert rules, dashboards, execution worker metrics or production load/SLO proof in this slice.

## Acceptance and negative cases

1. Missing or incorrect scraper token returns 401.
2. Correct configured token returns Prometheus content and process/request metrics.
3. HTTP route labels use registered templates or `unmatched`, never IDs from request paths.
4. Durable source/outbox/connector/exception/action/retention gauges come from PostgreSQL aggregation.
5. Database collection failure sets collection success to zero and increments a failure counter; it does
   not return previous/example counts.
6. Output contains no credential, tenant ID, actor ID, email or source payload.
7. Build, tests, runtime-data, dependency, API-boundary and SDLC gates pass.
8. Execution metrics use the same dedicated scraper credential, query only aggregate execution-owned
   state, and expose no tenant/run/workflow/entity labels or values.
9. Invalid correlation IDs are replaced by server-generated secure IDs; all execution HTTP responses carry
   the resolved correlation ID.
10. Global error telemetry records a bounded route template and error class, never a raw URL, query string,
    authorization value or exception message.

## Release and recovery

The endpoint is additive. Roll-forward is configuration correction or code fix; disabling scraper access
at the network layer is the immediate containment. Removing the endpoint requires a versioned operator
notice because monitoring consumers depend on it.

## Implementation record — control and execution metrics increment

- `metrics.service.ts` records real request counts/latency and queries aggregate durable state from the
  control PostgreSQL database for each scrape.
- `http-metrics.middleware.ts` records completed requests using registered route templates and collapses
  the framework catch-all to `unmatched`; raw paths and parameter values are not labels.
- `metrics-token.guard.ts` protects the scrape with a dedicated required secret and constant-time digest
  comparison.
- `platform.controller.ts`, `app.module.ts`, `main.ts`, and runtime configuration mount the endpoint and
  fail startup when its scraper credential is absent.
- `.env.example`, the live certification script, unit tests, and the control-plane metrics runbook define
  deployment, negative cases, privacy, failure signaling, and recovery.
- `services/metrics.py` exposes aggregate run, step and execution-outbox state from the execution-owned
  PostgreSQL database; a collection error emits an explicit unhealthy signal without stale values.
- The FastAPI metrics route uses the same required scraper authentication contract and excludes
  tenant/run/workflow identifiers from labels and output.
- Control and execution correlation middleware now bounds caller IDs, generates secure replacements for
  unsafe values, and correlates early authorization failures. The execution global error path records only
  method, registered route template, error class and correlation ID.
- The execution metrics runbook, live certification, and Python unit tests cover authentication, privacy,
  failure signaling and operational recovery.

## Verification record — 2026-09-03

| Evidence | Result |
| --- | --- |
| `pnpm --dir apps/playground-api test` | 3 files, 11 tests passed |
| API typecheck and build | Passed |
| `verify:observability` against configured PostgreSQL | 11 checks passed, including missing/wrong credential, durable gauges, bounded cardinality, correlation and privacy |
| `verify:execution-observability` against configured PostgreSQL | 9 checks passed, including auth, durable gauges, collection health, correlation and privacy |
| Full `pnpm test` | 10 TypeScript files / 37 tests plus 4 Python tests passed |
| Full `pnpm build` | 78/78 tasks passed across 80 active packages |
| Production and all-active-runtime data audits | Passed; 109 quarantine roots enforced |
| Navigation boundary | 19 page routes and 33 static internal links passed |
| Package/API/SDLC boundaries | 80 manifests, 8 controllers, 27 providers, 19 agents and one active implementation item passed |

## Current decision and residual risk

The control/execution metrics and correlation increment has producer evidence and remains part of
`WI-OI-007 In Progress`. Release 1 remains **No-Go for production release** until correlated distributed
traces, approved SLO/alert rules, representative load evidence, alert/runbook exercises, independent
QA/security review, and the other G5 dependencies in `WI-OI-003` are complete. No agent has supplied the
required human product or release acceptance.
