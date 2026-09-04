# Control-plane metrics runbook

Owner: Platform Operations  
Work item: WI-OI-007  
Endpoint: `GET /api/v1/internal/metrics`

## Access

Configure `OBSERVABILITY_METRICS_TOKEN` as a dedicated random secret of at least 32 characters. The
scraper sends it only in the `Authorization: Bearer` header. Store and rotate it through the deployment
secret provider; do not place it in source, URLs, logs or dashboards. Restrict the endpoint to the metrics
network at ingress in addition to application authentication.

Missing or invalid credentials return 401. Rotation is a restart/config-roll operation until a dynamic
secret provider is implemented.

## Metric contract

| Metric | Type | Meaning |
| --- | --- | --- |
| `gigalibs_http_requests_total` | Counter | Completed requests by method, registered route template and status |
| `gigalibs_http_request_duration_seconds` | Histogram | Completed request latency with bounded route labels |
| `gigalibs_metrics_collection_success` | Gauge | `1` when the named collector succeeded for the current scrape, else `0` |
| `gigalibs_metrics_collection_failures_total` | Counter | Collector failures since process start |
| `gigalibs_source_events` | Gauge | Durable source events by lifecycle state |
| `gigalibs_control_outbox_events` | Gauge | Durable outbox backlog/state |
| `gigalibs_connector_attempt_records` | Gauge | Persisted connector attempts by operation/state |
| `gigalibs_operational_exceptions` | Gauge | Exceptions by lifecycle state |
| `gigalibs_business_actions` | Gauge | Controlled actions by lifecycle state |
| `gigalibs_retention_executions` | Gauge | Retention jobs by lifecycle state |

No tenant, user, connection, event, action or route-parameter value is a label. Business-state gauges are
queried from PostgreSQL on every scrape. If collection fails, the response exposes failure explicitly and
does not substitute cached/example counts.

## Initial operator checks

- Alert when `gigalibs_metrics_collection_success{collector="database"}` remains zero for the
  operator-approved evaluation window.
- Investigate growth in pending/processing outbox records together with worker logs and database health.
- Investigate open/assigned exceptions and failed retention executions through the authenticated control
  API; metrics deliberately do not expose tenant identities.
- Use request error rate and latency by route template. Never add raw URL, query, tenant or entity labels.

Formal alert thresholds and SLO burn-rate rules require representative load evidence and remain in
WI-OI-007. This runbook does not invent thresholds before that evidence exists.

## Verification

Run the live certification with explicit configuration:

```text
API_URL=<versioned-control-api-url> \
OBSERVABILITY_METRICS_TOKEN=<scraper-secret> \
pnpm --dir apps/playground-api verify:observability
```
