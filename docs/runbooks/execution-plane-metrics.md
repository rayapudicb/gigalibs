# Execution-plane metrics runbook

Owner: Platform Operations  
Work item: WI-OI-007  
Endpoint: `GET /api/v1/internal/metrics` on the execution API

## Access and rotation

The execution and control metrics endpoints use the deployment-provided
`OBSERVABILITY_METRICS_TOKEN`. The scraper sends it only as a bearer credential. Store and rotate the
credential through the deployment secret provider and restrict the endpoint to the metrics network at
ingress. A missing value fails process configuration; a missing or incorrect request credential returns
401. Rotation currently requires a process restart/configuration rollout.

## Metrics and data ownership

| Metric | Type | Authoritative source |
| --- | --- | --- |
| `gigalibs_execution_metrics_collection_success` | Gauge | Result of the current execution-database collection |
| `gigalibs_execution_runs` | Gauge | `execution_runs` grouped by constrained lifecycle status |
| `gigalibs_execution_steps` | Gauge | `execution_steps` grouped by constrained lifecycle status |
| `gigalibs_execution_outbox_events` | Gauge | `execution_outbox` grouped by constrained lifecycle status |

Each scrape queries the execution-owned PostgreSQL database. A collection failure returns the family
definitions plus a zero collection-success signal; it never reuses previous or example values. Metrics do
not contain tenant, user, workflow, run, node, event, payload, URL, query, or credential labels.

## Correlation and diagnostics

Execution HTTP responses include a bounded `X-Correlation-ID`. Valid opaque IDs are preserved; missing,
short, overlong, whitespace, or control-character values are replaced with a secure server-generated UUID.
The global error log records the registered route template, HTTP method, safe error class, and correlation
ID. It does not record raw URLs, query strings, exception messages, authorization values, or payloads.

When database collection is unavailable, investigate execution database readiness and pool/network logs
using the response correlation ID and the operator-approved alert evaluation window. HTTP RED metrics,
worker/task metrics, distributed traces, approved SLO/alert rules, and exercised dashboards remain open in
WI-OI-007; this endpoint must not be described as complete observability.

## Verification

```text
EXECUTION_PLANE_API_URL=<execution-api-url> \
OBSERVABILITY_METRICS_TOKEN=<scraper-secret> \
pnpm --dir apps/playground-api verify:execution-observability
```
