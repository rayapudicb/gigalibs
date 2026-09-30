# WI-OI-104: Connector Hub is the one way in; one scheduler and job runner (ADR-0016 F8, F14)

- **Status:** Planned 2026-09-30. Evidence goes in `.pi/work/WI-OI-104.md`.
- **Decisions:** `.pi/tasks/FOUNDATION-CLOSE.md`.
  - Jobs on PostgreSQL plus Redis/BullMQ behind one kernel interface.
  - Credentials encrypted in Connector Hub's own schema.
- **Size:** L. Several sessions; each piece verified and committed on its own.

## What exists today (checked 2026-09-30)

- **Connector Hub** (`modules/universal-connector-hub`, 1,628 lines, schema `gigalibs_connectors`, 4 migrations):
  - catalogue, connections, connection test, OAuth initiate and callback, webhook intake, a delta sync into
    `raw_ingestion_journal`, and statistics;
  - AES-256-GCM credential encryption already exists (`vault-crypto.service.ts`).
  - **Security gap:** the API trusts a plain `X-Tenant-Id` header, with no signed platform context and no per-route
    permissions. The web proxy (`app/api/connectors-hub/[...path]`) forwards any path after only a module-level
    check. The port is not published outside the Docker network.
- **Connector copies F8 retires:**
  - Analytics' own PostgreSQL connector (`source_connections`, `v1/connectors/*`, sync contained);
  - the core API's connector services (`connector-credential`, `-profile`, `-http.client`, `-postgres.client`,
    `-network-policy`).
- **Jobs:** `@gigalibs/queue` (BullMQ) exists but is unused. Redis is not in the local stack. There is no scheduler.
  Analytics summary builds run in the API process for now.
- **Shared pieces to reuse:**
  - `@gigalibs/module-sdk` `SignedContextGuardBase`, as used by CMMS, Workforce and the module host;
  - the manifest gateway (`spec.gateway`), as used by CMMS and Workforce.

## Pieces

1. **104a Secure Connector Hub:**
   - signed `PlatformContextV1` through `module-sdk`, with per-route permissions (`connections:read`,
     `connections:write`, `connections:test`, `connections:sync`); `X-Tenant-Id` trust is removed;
   - web access through the manifest gateway, and the hand-written proxy retires;
   - webhooks stay outside the user context but must pass their per-connection signature check;
   - tests, and a real-database proof in a throwaway container.
2. **104b Kernel jobs** (`@gigalibs/jobs`):
   - one interface (define, schedule, enqueue, run, retry with backoff, dead-letter, audit), with two backends:
     a PostgreSQL job table (`SKIP LOCKED`) and BullMQ on Redis;
   - Redis added to the local stack as infrastructure (holds no durable truth);
   - a short ADR records the design.
3. **104c Kernel scheduler:**
   - Schedules live in the kernel. Due runs are dispatched to the owning module over a signed service context:
     scheduled work runs with the schedule owner's rights, re-resolved at run time.
   - First users: Connector Hub pulls and scheduled report runs. Analytics summary builds move to 104e (owner
     decision 2026-09-30): they follow new dataset versions, not a clock.
4. **104d Adapter framework** in Connector Hub:
   - logins: API key, bearer token, OAuth2;
   - paging styles: page, offset, cursor, since-watermark;
   - incremental pulls, retries, and a quarantine for bad records.

   Plan (2026-09-30), in two steps:
   - **Step 1, the framework.**
     - A pull source per connection (`configuration.source`, validated): base URL, resource path, records path,
       id field, optional watermark field and parameter, static query.
     - Paging: none, page, offset, cursor, next link.
     - Logins: none, API key (header or query), bearer token, OAuth2 client credentials (token cached until expiry).
       Secrets live only in the encrypted `connector_credentials`, rotated through their own route and never
       returned.
     - Every URL, including token URLs and next links, must pass the outbound allowlist, and next links stay on the
       source's origin.
     - Retries on 429, 5xx and network errors, honouring Retry-After. Bounded pages, bytes and time per run.
     - One sync per connection at a time (a lease).
     - Journal writes are idempotent (source id plus payload hash). Bad records go to `quarantined_records` with a
       reason.
     - The watermark advances only from the records themselves, and only when the run completes (or the source is
       sorted by it).
     - Sync history and quarantine routes; migration 000006.
     - Tightened: the sync route no longer accepts caller-supplied records (webhooks are the push path), and no
       tenant id is sent to outside sources.
   - **Step 2, the web.** Configure the pull source and its login on a connection, run it, and see the sync
     history and quarantine.
   - **Not in 104d:** the OAuth2 consent flow (authorization code, for example Salesforce). Its initiate and callback
     routes stay "not implemented" until a client needs it.
5. **104e Bridge into Analytics:** an Analytics source of type `CONNECTOR_HUB`. Summary builds become kernel jobs
   here, started by each new dataset version.

   Plan (2026-09-30), following ADR-0007's outbox-relay-inbox pattern (no module reads another's schema):
   - **Step 1, the bridge.**
     - Connector Hub: a per-connection "send pulled records to Analytics" switch. Each newly journalled record also
       writes a `CONNECTOR_RECORD_PULLED_V1` outbox row in the same transaction.
     - The Module SDK `OutboxRelay` delivers those rows with a dedicated relay key (Analytics inbox key pair) to
       Analytics `/internal/v1/inbox`.
     - Analytics deduplicates by message id, keeps one `CONNECTOR_HUB` source per Hub connection (created on first
       delivery), and stores each record as a raw record version. The existing discovery, mapping and dataset steps
       then apply unchanged.
   - **Step 2, unit conversion in mappings:** mass (g, kg, quintal, t, lb), area (m², ha, acre) and volume (L, m³),
     applied when a dataset is built.
   - **Step 3, from pull to dataset on a schedule.**
     - Kernel operation `analytics.dataset-build` (schedulable, runs as the owner).
     - When it produces a new dataset version, the job enqueues `analytics.summaries-build` for it. This is the
       summary-build hand-over the owner decided on.
     - Exit (agriculture plan phase 2): a REST source syncs on a schedule into a dataset with no code beyond its
       adapter settings.
 Journal records become raw records,
   then go through the existing discovery, mapping, dataset and model steps. Mapping gains unit conversion (kg,
   quintal, t).
6. **104f Retire the copies:**
   - Analytics' PostgreSQL connector (routes, service and screens) retires;
   - the core API connector services retire;
   - catalogue entries are updated.

## Stop and ask if

- a change alters what an existing base role can do;
- a migration would drop data (old Analytics source connections, core connector profiles);
- the scheduler needs signing keys in a service that does not hold them today.
