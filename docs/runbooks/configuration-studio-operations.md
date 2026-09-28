# Configuration Studio operations runbook

Owner: Platform Operations / SRE with Configuration Backend owner  
Work item: WI-OI-039  
Dashboard: `infra/grafana/dashboards/configuration-studio.json`  
Alert rules: `infra/prometheus/alerts.yml`

## Safety boundary

Configuration metadata, activations, values, records, audit and outbox state are authoritative in
PostgreSQL. Runtime manifest reads may use the bounded 30-second process cache only while the PostgreSQL
invalidation listener is connected. A disconnected listener forces authoritative database reads; reconnect
resynchronizes known scopes before cache use resumes. Never bypass an outage with an unverified in-process
manifest, fixture, default tenant or manual database mutation. Use supported Configuration APIs for rollback
and replay; direct SQL below is read-only diagnosis.

Metrics contain bounded route/status/lifecycle labels only. Do not add tenant, user, record, event,
configuration key, raw URL, query string or payload values to Prometheus labels or dashboard variables.

## Dashboard interpretation

| Signal | Healthy interpretation | Operator action |
| --- | --- | --- |
| Request rate and 5xx/503 | Traffic is attributable to route templates; sustained 503 means database unavailability | Follow database-unavailable procedure; do not serve stale state |
| Read p95 | Below the independently accepted target; two seconds is provisional NFR-PERF-002 | Correlate route, API saturation and PostgreSQL query/lock health |
| Change sets and old submissions | Review queue progresses; stale counter returns to zero | Contact assigned product/domain reviewer; never self-approve |
| Activations | Expected active/inactive distribution with recent authorized audit | Inspect activation/audit history and last-good version |
| Outbox status and oldest age | No FAILED records and oldest PENDING age below alert window | Follow outbox procedure; confirm consumer convergence before further activation |
| Manifest listener and cache | Listener is `1`; cache outcomes and reconciliation failures match expected traffic | If listener is `0`, verify cache bypass, restore LISTEN connectivity and confirm authoritative resynchronization |
| Database collector | `1` on every scrape | Treat `0` as monitoring degradation and possible database outage |

## Database unavailable

1. Confirm `ConfigurationStudioDatabaseUnavailable` and the database collector signal. Correlate sanitized
   503s by request correlation ID; do not expose driver messages or connection details to callers.
2. Check PostgreSQL service/readiness, storage, connection saturation, recent migration and platform events.
   A retryable 503 includes `Retry-After: 1`; clients may retry idempotent reads and commands with their
   original idempotency key after the service recovers.
3. Do not activate, publish or roll back while authoritative persistence is uncertain. A network failure is
   an unknown outcome until the relevant activation, idempotency, audit and outbox records are reconciled.
4. After recovery, read the active manifest twice from separate replicas, compare checksum/version to the
   last accepted activation, write only through a supported non-production verification flow, and confirm
   no pending/processing claim was stranded.
5. For local certification only, use the guarded database-restart command in
   `database-disaster-recovery.md`. Production recovery follows the deployment-profile WAL/PITR and RPO/RTO
   procedure; never run the local container command against customer infrastructure.

## Configuration outbox delayed or failed

1. Pause new activation decisions for the affected environment/cohort and inspect worker readiness/logs.
   Configuration invalidations are published on PostgreSQL channel
   `gigalibs_configuration_events_v1`; a `PUBLISHED` row proves the transaction emitted the signal, not that
   every listener consumed it.
2. Read bounded state without mutating it:

   ```sql
   SELECT status, count(*)
   FROM control_outbox_events
   WHERE "aggregateType" IN ('configuration-version', 'configuration-activation', 'configuration-record')
   GROUP BY status;
   ```

3. For a failed item, correlate `eventId`, aggregate identity, attempt count, error code, audit entry and
   target consumer. Do not copy payloads into tickets or metrics.
4. The transport is at least once. Consumers must deduplicate on `eventId`; a larger `attempt` is a replay,
   not a new business event. The envelope is an invalidation signal only, so reconnecting or gap-detecting
   listeners must reread the authoritative tenant/environment/cohort state from PostgreSQL.
5. Use the supported retry/claim recovery mechanism only after confirming whether delivery occurred. Never
   change status, `claimedAt`, attempts or publication timestamps directly. If a consumer outcome is
   uncertain, reconcile its authoritative read model before replay.
6. Confirm PENDING/PROCESSING age returns to normal, terminal failures have an audit entry and every replica
   reads the authoritative active checksum. Retain incident evidence and the exact artifact digest.

## Manifest invalidation listener disconnected

1. Confirm `ConfigurationStudioManifestConsumerDisconnected` and
   `gigalibs_configuration_manifest_listener_connected == 0` on the affected replica. The process must
   report cache requests as `result="bypass"` and read PostgreSQL directly while disconnected.
2. Check database reachability, connection capacity, proxy support for long-lived PostgreSQL sessions and
   the dedicated listener application name. Do not log or copy the database URL or notification payload.
3. Do not enable cached reads manually. The consumer reconnects with bounded exponential backoff, executes
   `LISTEN`, rereads every known scope from authoritative PostgreSQL and only then reports connected.
4. After reconnect, verify listener `1`, successful resynchronization increments, failed notification and
   resynchronization counters stay stable, and two replicas return the same active checksum/version.
5. Replay an outbox event only through the supported claim/retry path. Replays use the same `eventId`; the
   consumer records deduplication only after an earlier notification completed successfully.

## High latency or saturation

1. Split manifest reads from application list/detail reads by registered route template and status.
2. Check API CPU/memory, connection-pool saturation, PostgreSQL locks/slow queries and record/page size.
3. Compare with the bounded 250-field/two-tenant certification profile. Do not raise a budget or remove
   validation, authorization, masking, audit or outbox work to make the graph green.
4. If an indexed projection is involved, verify its approved registry, backfill checkpoint and rebuild
   health. Fall back only to an explicitly supported bounded query path.

## Java manifest client failure

1. Treat `HTTP_STATUS_UNEXPECTED` with 401/403 as an identity, tenant-membership or permission failure.
   Refresh credentials only through the supported authentication flow; do not retry with another tenant or
   log the bearer/response body.
2. A non-loopback cleartext endpoint is rejected by design. Correct the environment to the accepted HTTPS
   endpoint. Never disable TLS, hostname verification or the JVM trust store to restore service.
3. Redirect, media-type and response-size failures indicate an endpoint/proxy/contract problem. The client
   deliberately follows no redirect, accepts only JSON and reads at most two megabytes. Reconcile the
   deployed route and proxy configuration before retrying.
4. After recovery, fetch the manifest through the authenticated client, compare its checksum with the
   active server version and verify the consumer rereads authoritative state. Local loopback HTTP evidence
   is not target-profile TLS or trust-chain acceptance.

## Stale review or unsafe activation

1. A submitted change set older than 24 hours is a workflow alert, not authority to bypass maker-checker.
2. Confirm the author, assigned independent reviewer, checksum and reason through the authenticated UI/API.
3. If an activation causes a verified issue, select an older published version through the rollback API.
   Verify the resulting audit record, outbox delivery and manifest checksum on every replica.
4. If rollback is denied because persisted records are incompatible, stop and follow a reviewed forward-fix
   or migration plan. Never edit immutable versions or extension values directly.

## Verification and handoff

Run:

```text
CONFIGURATION_OBSERVABILITY_EVIDENCE_PATH=docs/audits/2026-09-09-readiness/evidence/uat/configuration-studio-observability-result.json \
  pnpm audit:configuration-observability
```

The static check proves metric/alert/dashboard/runbook naming and safety alignment. G5 still requires a live
deployment-profile scrape, fired-and-resolved alert evidence, notification routing, dashboard import and an
operator who did not author the implementation to execute the scenario in both deployment profiles. A
guarded local scrape can be certified separately with:

```text
CONFIGURATION_LIVE_OBSERVABILITY_EVIDENCE_PATH=docs/audits/2026-09-09-readiness/evidence/uat/configuration-studio-live-observability-result.json \
  pnpm certify:configuration-observability-live
```

That command requires a local PostgreSQL 16 URL, creates a generated database, starts one loopback API and
verifies cleanup. It must not be used as deployment-profile or independent release acceptance.
