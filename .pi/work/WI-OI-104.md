# WI-OI-104: Connector Hub is the one way in; one scheduler and job runner (ADR-0016 F8, F14)

- **Status:** In Progress. The owner started it on 2026-09-30 ("lets complete these").
- **Owner:** Integration Connectors / Developer Platform.
- **Decision records:** ADR-0016 F8 and F14, and `.pi/tasks/FOUNDATION-CLOSE.md`:
  - jobs on PostgreSQL plus Redis/BullMQ behind one kernel interface;
  - credentials encrypted in Connector Hub.
- **Task card:** `.pi/tasks/WI-OI-104.md`.
- **Independent reviewers:** Security & Privacy, Infrastructure/SRE, QA/SDET.

## G0: why

Outside data must come in through one governed path: Connector Hub, with logins, paging, retries and quarantine, then
into Analytics through no-code mapping. Today there are three connector copies (Connector Hub, Analytics and the
core API) and no scheduler. Connector Hub also trusts a caller-supplied tenant header.

## G1: scope

- **In scope:** 104a to 104f in the task card: secure Connector Hub, kernel jobs, the scheduler, the adapter
  framework, the Analytics bridge with unit conversion, and retiring the copies.
- **Out of scope:** agriculture-specific adapters (farmOS and others; agriculture phase 4), certification of
  individual connectors, and an external vault.

## G2: acceptance

1. Connector Hub trusts only a BFF-signed context. Every route names its permission, and a tenant header is never
   read.
2. One kernel job interface, with PostgreSQL and Redis/BullMQ backends, retries, dead-letter and audit.
3. One scheduler. Scheduled work runs with its owner's rights, re-checked at run time.
4. A REST source syncs on a schedule into an Analytics dataset, with no code beyond its adapter.
5. The Analytics and core API connector copies are retired.

## G3: slices

| Slice | What | Size | Status |
|---|---|---|---|
| 104a | Secure Connector Hub | M | Done, live on 5180 (2026-09-30) |
| 104b | Kernel jobs (PostgreSQL plus Redis/BullMQ) | M | Done (GPT agent); core migration live (2026-09-30) |
| 104c | Kernel scheduler | M | In progress: step 1 (schedules) built and verified (2026-09-30) |
| 104d | Adapter framework | M | Proposed |
| 104e | Bridge into Analytics with unit conversion | M | Proposed |
| 104f | Retire the connector copies | S | Proposed |

## 104a: secure Connector Hub (2026-09-30)

- **Before:** every Connector Hub route took its tenant from an `X-Tenant-Id` header (or a `tenant_id` body field on
  create) and checked no permission. The web proxy forwarded any path after only a module-level check. So any member
  with the Connections entitlement could create connections, start syncs and start OAuth, and anything on the Docker
  network could act as any tenant. The port is not published outside the network.
- **Hub:**
  - Connector Hub uses the shared `@gigalibs/module-sdk` `SignedContextGuardBase`, with Ed25519, audience
    `gigalibs-connector-hub-api` and the `connections` entitlement.
  - The tenant comes only from the signed principal.
  - Per-route permissions: `connections:read` for the catalogue, connections, journal and stats;
    `connections:write` for create and OAuth; `connections:test` for test; `connections:sync` for sync.
  - Revoked sessions are refused: migration 000005 adds `auth_revocation_events`, read-only for the runtime role.
  - The config requires `CONNECTOR_HUB_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64`, and the schema contract is 5.
- **Web:**
  - `lib/connector-hub-proxy.ts` uses the shared signed proxy with an allow-list; the shared proxy gains an
    `upstreamPathPrefix` option.
  - Not exposed: webhooks (they come from outside senders), and `credentials` and `oauth/callback`, which have no hub
    route. The old screens' webhook simulator and those two calls already failed or relied on the trusted header.
- **Infrastructure:**
  - Compose passes the key pair (the web signs; the hub verifies).
  - The credentials script adds the Connector Hub key group to an existing profile without touching other secrets.
- **Role change (tightening):** MANAGER keeps read and test (it holds `connections:read` and `connections:test`), but
  can no longer create connections, start OAuth or sync through the web. Its role never held `connections:write`.
  TENANT_ADMIN (`connections:*`) keeps everything.
- **Checks:**
  - hub guard tests: foreign key, wrong audience and other entitlements are refused; the tenant never comes from the
    header; the manager versus admin matrix; revocation; the route-permission table;
  - hub suite 43;
  - web proxy tests: signed context, no tenant header, the permission matrix, webhooks not exposed, cross-site
    refused;
  - Analytics, CMMS and gateway proxy tests still pass;
  - migration 5 dry-run on the real database rolled back (it stayed at 4);
  - `pnpm verify` passes (known drift only).
- **Deploy note:** needs the new key pair added to `infra/compose/.env.modules` (script), migration 5, and new hub
  and web images. It is part of the next deploy, with the owner's OK.

## 104b: kernel jobs (2026-09-30; built by the GPT agent, recorded and verified by Claude)

- **Built by the GPT (Codex) agent** between 10:20 and 11:58 IST, at the owner's request. It stopped (usage limit)
  just before recording evidence and running the repository check. Claude traced the session log, then recorded and
  verified it; the work is uncommitted.
- **`@gigalibs/jobs` (kernel):** one interface to define, schedule, enqueue and run work (`kernel-jobs.ts`, registry,
  validation, backoff).
  - The PostgreSQL store is authoritative: accepted jobs, versioned definition reference, tenant, initiating subject
    and authority version, correlation and idempotency keys, attempts, leases and heartbeats, retries and
    dead-letter, bounded result, and an append-only lifecycle audit.
  - A BullMQ adapter dispatches on Redis, which carries only the job id and is never recovery truth.
  - Each definition chooses `POSTGRES` polling or `BULLMQ` dispatch.
- **Core migration** `20260930000000_kernel_jobs_foundation`, plus `schema.prisma` models. Also edits to
  `config/package-layers.json` (package layer) and `packages/privacy-gdpr/src/inventory.ts` (the new tables in the
  data inventory).
- **ADR-0017** "PostgreSQL-authoritative kernel jobs with optional BullMQ dispatch". It is marked "Accepted for the
  bounded local-development implementation" by the agent, so the owner should confirm.
- **Checks:**
  - 13 tests: 8 unit, plus 5 integration tests against real PostgreSQL and Redis (tenant isolation, separate
    database roles, immutable audit privileges, idempotency conflicts, leases and heartbeats, bounded dispatch
    backoff, stale Redis redelivery, BullMQ deduplication). Re-run by Claude: 13/13.
  - `pnpm verify` passes together with the uncommitted 103c and 104a work (known drift only).
- **Clean-up:** the agent's two test containers (`gigalibs-wi-oi-104b-postgres` on 55432 and
  `gigalibs-wi-oi-104b-redis` on 56379, both published on all interfaces with test passwords) were removed after the
  re-run.
- **Not yet:** Redis in the local Compose stack; deploying the core migration (part of the next deploy, with the
  owner's OK); using jobs (scheduler 104c, then summary builds and connector pulls).

## Deploy (owner's "deploy", 2026-09-30 12:33)

- Backup first: `gigalibs_backup_20260930_064549Z.dump`.
- The credentials script added the Connector Hub key pair to `.env.modules` (mode 600; no secret printed).
- Every image was built at `54cacf060c4d-1ec93ce7c941`. The migrations jobs recorded `kernel_jobs_foundation`,
  and module migrations completed: Connector Hub 5, Analytics 21, the others unchanged.
- All seven services and the 5180 web are healthy.
- Negative check: an unsigned request with `X-Tenant-Id` sent from inside the network to Connector Hub is refused
  (401).
- The live proof passed: a real Tenant Admin login, signed Workforce, CMMS and Geospatial contexts, and 14
  Playwright tests.
- 103c (summaries and the two bug fixes) is live too.

## 104c: kernel scheduler (owner decisions 2026-09-30: a `kernel-worker` service; Redis in the stack)

**Step 1: recurring schedules** (not deployed):
- **Cron** (`packages/jobs/src/cron.ts`): five-field cron in an IANA time zone, with lists, ranges, steps and
  month/weekday names. Both day fields restricted means either may match, as in classic cron. A local time skipped
  by daylight saving does not run that day. The next run is searched up to two years ahead.
- **Schedules** (`packages/jobs/src/schedules.ts`), with core migration `20260930010000_kernel_job_schedules` and the
  `KernelJobSchedule` model:
  - Security: forced RLS, and the tenant and worker roles from 104b.
  - Creating a schedule validates the name, cron, time zone, job definition and payload before storing.
  - Pause (with a reason) and resume (from now).
  - `tick()` claims due schedules `FOR UPDATE SKIP LOCKED` and enqueues one job per due time. The idempotency key is
    `schedule:<id>:<due time>`, the correlation `schedule:<id>`, and the owner's auth version is re-resolved at each
    due time.
  - A schedule whose owner is no longer an active member, or whose definition can no longer run, pauses with the
    reason.
  - Missed times collapse into one run, then continue from now.
- **Classified:** in `config/package-layers.json` (core model) and the privacy inventory (`EXCLUDE_SECURITY`).
- **Checks:**
  - cron 5 tests;
  - 4 schedule integration tests on a throwaway PostgreSQL 16, bound to 127.0.0.1 and removed afterwards:
    validation and tenant isolation; two concurrent workers giving exactly one job per due time with the owner's
    auth version; a crash between enqueue and advance not duplicating; missed hours collapsing to one run; a departed
    owner pausing the schedule, and resume;
  - the 104b tests still pass (21 in total with PostgreSQL);
  - `pnpm verify` passes (known drift only).
- **Next steps:**
  - step 2: the `kernel-worker` service (core API image) running ticks, PostgreSQL jobs and BullMQ; a module-call job
    that signs a context for the owner with re-resolved permissions; Redis in Compose;
  - step 3: a schedules API, plus scheduled report runs and connector syncs as the first users.

**Step 2: the kernel worker** (not deployed):
- **Owner context for scheduled work:**
  - `AuthService.getSubjectContext(user, tenant, contextId)` builds the owner's current context the same way a login
    does, through the shared `assembleContext`: active user, tenant and membership; custom role; scopes.
  - The auth version is that of a fresh context, and MFA counts as verified, since the owner passed it when creating
    the schedule.
  - `buildPlatformContext` moved into `@gigalibs/auth-core`, and the web's mint uses it too, so the web and the worker
    build identical claims. `determinePersona` moved to contracts.
- **`module.call` job** (`apps/playground-api/src/kernel-worker/module-call.job.ts`):
  - Only listed operations can be scheduled: `analytics.report-run` (`analytics:reports:write`) and
    `connector-hub.sync` (`connections:sync`).
  - Each run re-resolves the owner, requires the permission and the module entitlement, and signs a context for that
    module's audience only. The job id is the run's idempotency key.
  - Final (not retried): owner refused by auth, permission missing, entitlement missing, the module answers 4xx.
  - Retried: database errors while checking the owner, 5xx, network errors.
- **Worker process** (`apps/playground-api/src/kernel-worker/main.ts`):
  - A tick loop: due schedules, then BullMQ dispatch when Redis is set, then up to 20 PostgreSQL jobs.
  - Health check on 127.0.0.1:4800; graceful stop on SIGTERM.
  - Only an auth refusal pauses a schedule; any other error ends the tick and is retried on the next.
- **Compose** (`compose.modules.local.yaml`):
  - `redis`: pinned digest, password, no host port, nothing on disk, `noeviction`.
  - `kernel-worker`: core API image with `dist/kernel-worker/main.js`, no published port.
  - `REDIS_PASSWORD` is added by `generate-module-runtime-credentials.sh`, appending only if missing.
- **Bug fixed in 104b's job store** (GPT's code; the owner is informed):
  - In `fail()` and lease recovery, the completion time sat in `CASE ... THEN $n ELSE NULL`, so PostgreSQL typed it as
    text and the update failed.
  - Effect: any failed or abandoned job stayed RUNNING. Now cast to `timestamptz`.
  - Two new integration tests (retry then dead-letter; lease recovery) fail without the fix and pass with it.
- **Checks:**
  - `module-call.job` 6 tests; auth subject context 2 tests (13 in the file);
  - jobs 23 tests with a throwaway PostgreSQL (the Redis one skipped);
  - `compose config` valid with both profiles;
  - `pnpm verify` passes (known drift only).
- **Worker smoke** (throwaway PostgreSQL and Redis on 127.0.0.1, removed afterwards; a stub Analytics that verifies the
  token; built `dist/kernel-worker/main.js`):
  - health 200, BullMQ on;
  - the departed owner's schedule was paused;
  - the active owner's schedule ran once and moved to 02:00 IST the next day;
  - the job SUCCEEDED as the owner;
  - the stub verified the signature for `gigalibs-analytics-api` only, and saw the owner's current scopes, the schedule
    correlation id, and the job id as idempotency key.
- **Found by the smoke, tracked in `FOUNDATION-CLOSE.md` item 7:** an empty database cannot be migrated.
  - `20260924000000_tp2_durable_export_and_outbox`: enum value used in the same transaction.
  - A1: phase 3–5 alter module schemas.

**Step 3: the schedules API and its first users** (not deployed):
- **Contract** (`packages/contracts/src/jobs`):
  - `SCHEDULED_OPERATIONS` holds each operation's module, read permission and run permission. The worker's job, the
    API and the web share it.
  - Also the request and response types.
- **Core API** `tenants/current/schedules` (`kernel-schedules.controller.ts` and `.service.ts`), reached through the
  web's existing control proxy:
  - list (filter by operation and target), create, runs, pause, resume, remove. Explicit actions, no DELETE.
  - Rights are the caller's current ones from `getSubjectContext`, as the worker resolves them. The module must be
    enabled.
    - Seeing a schedule needs the read or the run permission.
    - Creating, pausing, resuming and removing need the run permission. A schedule the caller cannot see answers 404.
  - The owner is the creator. Resume hands the schedule to whoever resumed it, since a departed owner would only pause
    it again.
  - Guards: the body is strict (no owner or job type from the client); runs at most every 15 minutes; at most 200
    schedules per workspace.
- **Jobs store:**
  - `resume(…, ownerSubjectId)`, `remove`;
  - `listByCorrelationForTenant`, `latestByCorrelationForTenant`;
  - the schedules migration grants DELETE to the tenant role only. It is not deployed yet, so editing it is safe.
- **First users (web):**
  - Analytics Reports: a Schedule panel per report (every day, week or month, at a time, in a time zone). It shows the
    owner, next run, the last run's result, and pause, "resume as me" and remove.
  - Connector Hub connections: a "Sync schedule" panel per connection.
- **Retired:** Analytics' `POST v1/reports/schedules`. It stored rows in `report_schedules` that nothing ever ran, and
  the web never called it.
  - The table stays, since dropping it would drop data. It goes with the 103f cleanup, with the owner's OK.
- **Not done: summary builds.** The task card lists them as a first user, but they are started by saving a chart or
  dashboard, not by a clock. Their kernel hand-over belongs with 104e, when connector data creates new dataset
  versions. This needs the owner's confirmation.
- **Checks:**
  - schedules API 5 service tests and 2 HTTP route tests (Nest app on 127.0.0.1: filters, strict body, UUID ids,
    status codes);
  - `module.call` 6 tests;
  - jobs 24 tests with a throwaway PostgreSQL: new owner on resume, run history per tenant, remove within its tenant
    only;
  - web cadence 2 tests; Analytics reports and route permissions 36 tests;
  - `pnpm verify` passes (known drift only).
- **Deploy notes for 104c:**
  - the core migration `20260930010000_kernel_job_schedules`;
  - `REDIS_PASSWORD` via the credentials script;
  - the `redis` and `kernel-worker` services;
  - new core and web images; a new Analytics image (route retired).
  - Outside the local stack, the core's database user must be able to `SET ROLE` to the two jobs roles.

## 104c deploy (owner: "go as per your recommendation", 2026-09-30 14:05)

- Backup first: `gigalibs_backup_20260930_083914Z.dump`.
- `REDIS_PASSWORD` was added to `.env.modules` by the credentials script (mode 600; no secret printed).
- **First image build failed:** the image workspace (`infra/compose/docker/pnpm-workspace.yaml`) did not list
  `packages/jobs`, and did not allow the `msgpackr-extract` build that bullmq needs. `pnpm verify` cannot see this.
  - Fixed, and all images rebuilt at `13cd27af9761-214bebf5ead2`: the commit plus that fix, uncommitted until the
    owner's "commit".
  - The core image loads the worker entry, `ioredis` and `@gigalibs/jobs`.
- **Deploy:**
  - Every migrations job exited 0. Core recorded `20260930010000_kernel_job_schedules`; modules unchanged (CMMS 14,
    Workforce 14, Geospatial 3, Connector Hub 5, Analytics 21).
  - Every service is healthy, including the new `redis` and `kernel-worker` (neither has a host port). The worker
    started with BullMQ on, and no tick failed.
  - 5180 answers. An unsigned request to Connector Hub is refused (401).
- **Live proof:** a real Tenant Admin login; signed Workforce, CMMS and Geospatial contexts; 14 Playwright tests.
- **Schedules live proof** (`scratchpad/schedule-live.mjs`, web on 5190, a throwaway tenant; sessions revoked):
  - Create and list through the web control proxy.
  - Refused: a run every 5 minutes (400), a smuggled owner (400), a viewer creating (403) or pausing.
  - Pause and resume.
  - Both schedules made due. The live worker ran each once as its owner. Analytics and Connector Hub each accepted
    the worker-signed context and answered 404 for the deliberately missing target (a bad signature is 401), so the
    job ended MODULE_REFUSED, and the schedule moved to its next time.
  - Run history listed; both schedules removed, with their job history kept.
- The 5190 container and credential files were removed, and superseded images pruned.
- 104c is live. WI-OI-104 continues with 104d (the adapter framework).

## 104d: the Connector Hub adapter framework

**Step 1: the framework** (not deployed):
- **Pull source per connection** (`apps/api/src/pull/pull-source.ts`), set through `POST connections/:id/source`
  (`connections:write`) and validated:
  - base URL (http(s), no credentials, query or fragment), resource path, static query;
  - records path, id field;
  - optional watermark (field, parameter, and iso or epoch format);
  - paging: none, page, offset, cursor or next link; `maxPages` of 500 at most;
  - login: none, API key (header or query; `Authorization`, `Cookie`, `X-Tenant-Id` and similar refused), bearer, or
    OAuth2 client credentials (basic or body client authentication).
- **Secrets:** `POST connections/:id/credentials` replaces the connection's secrets in one transaction.
  - Encrypted with the existing vault key (AES-256-GCM) and never returned. The audit records only the kind.
  - The web proxy has no route that reads them (404).
- **Requests** (`source-http.ts`):
  - every URL, including token URLs and next links, must pass `CONNECTOR_HUB_ALLOWED_OUTBOUND_HOSTS`, and next links
    must stay on the source's origin;
  - redirects are refused;
  - pages are capped at 5 MB while streaming;
  - 429, 5xx and network errors are retried up to 4 times, honouring Retry-After, within a 90 s run budget.
- **Logins** (`source-auth.ts`): OAuth2 tokens are cached per connection until a minute before expiry, and a 401
  drops the token and tries once more.
- **Runner** (`pull-runner.ts`):
  - A connection lease (5 min) allows one pull at a time; a second pull gets 409.
  - The job is recorded as RUNNING, then COMPLETED or FAILED. It keeps its counts, pages, truncation, watermark before
    and after, the correlation id, and SCHEDULED when started by the kernel worker.
  - Each page is written in one transaction. The journal is idempotent on source id plus payload hash, so a changed
    record is a new version and a re-read is a duplicate. Unidentifiable records go to `quarantined_records` with a
    reason.
  - The watermark comes from the records themselves, and only as far as they prove it.
  - A failure keeps what was written, leaves the watermark alone, marks the connection ERROR, and answers 502 when
    retrying may help or 424 when the source or login needs fixing. The kernel job therefore retries or stops.
- **Routes:** `GET connections/:id/sync-jobs` and `GET connections/:id/quarantine` (`connections:read`). The web
  proxy allow-list adds these and the two write routes.
- **Migration 000006** (additive): sync lease, fuller sync jobs, `quarantined_records` (RLS forced), and the catalogue
  entry "REST API (scheduled pull)" (`GENERIC_REST_PULL`). The Hub schema contract is now 6.
- **Tightened:**
  - The sync route no longer accepts caller-supplied records. Webhooks, with their signatures, are the push path.
  - No tenant id is sent to outside sources.
  - The old sync test of that injection path is replaced.
- **Checks:**
  - 8 framework tests against a local source: every paging style, API key, OAuth2 token reuse and renewal, retries,
    allowlist, next link leaving the source, page cap, quarantine reasons, watermark rules;
  - 4 PostgreSQL tests with the real module migration runner and the non-superuser runtime role (RLS forced):
    - OAuth2 pull across pages, quarantine and watermark; secrets stored encrypted;
    - incremental and duplicate handling, a changed record as a new version, a full re-read;
    - the lease (409) and a failure (502, job FAILED, watermark kept, lease released);
    - tenant isolation, allowlist refusal (424), invalid config (400), a connection without a source.
  - All 50 Hub tests pass; the web boundary test covers the new routes.
  - `pnpm verify` passes (known drift only).
- **Fixed on the way:**
  - The runner's lease release used one parameter as both varchar and text, so PostgreSQL refused it and the lease
    was never released. The runner now casts it, and logs instead of silently ignoring a failed release.
  - The 104c image-workspace fix (1f1c572) allowed the `msgpackr-extract` build that bullmq needs, but not in the
    reviewed deployment-profile allowlist, so the profile audit failed. It is now added to
    `artifactPolicy.allowedLifecycleBuilds`, a reviewed supply-chain list change for the owner to note.
- **Not in 104d:** the OAuth2 consent flow (authorization code). Its routes stay "not implemented".
- **Next:** step 2, the web (configure a pull source and its login, run it, see pulls and quarantine), then the 104d
  deploy (Hub migration 6, Hub and web images) with the owner's OK.

**Step 2: the web** (not deployed):
- `components/connectors/PullSourcePanel.tsx` goes on each Connector Hub connection card ("Set up a pull source" /
  "Pull source"):
  - Source form: base URL, resource path, fixed query parameters, records path, id field, changed-at field with its
    parameter and time format, paging style with its settings, most pages per pull, and the login with its
    non-secret settings.
  - When saved, the form becomes a summary with "Edit source" and "Pull now".
  - Login secrets: write-only password fields (API key, token, or client ID and secret), replaced as a whole and never
    shown.
  - Recent pulls: status, manual or scheduled, new, unchanged and quarantined counts, pages, page limit, and the error.
  - Quarantined records: the reason, source id and time, with the kept payload collapsed.
- `lib/connectors/pull-source-form.ts` maps the flat form to and from the pull source, sending only the chosen paging
  style's and login's settings. 2 tests, including a farmOS-style JSON:API source that round-trips.
- The existing "Trigger Sync" message now reports new, unchanged and quarantined counts.
- Hub validation and permissions stay server-side; the panel shows their messages.
- **Checks:** web typecheck; `pnpm verify` passes (known drift only). Not yet seen in a browser.
- **Deploy plan (owner's OK needed):**
  - backup;
  - Hub migration 000006 through its migrations job;
  - Hub and web images, then the live proof.
  - **Pull proof, without changing the live Hub's allowlist:**
    - a throwaway source container and a throwaway Hub container on the Compose network, the Hub allowing only that
      host;
    - the 5190 proof web pointed at that Hub;
    - Playwright sets up a pull source with an API key, stores the secret, pulls, and sees the result and the
      quarantine.
    - Afterwards both containers go and the test sessions are revoked.

## 104d deploy (owner: "deploy", 2026-09-30)

- Backup first: `gigalibs_backup_20260930_101247Z.dump`.
- **Builds:**
  - The disk guard stopped the module build at 58 GB free (60 required). The build cache was trimmed to 10 GB (no
    volumes) and the build resumed.
  - The session ended mid-build, so the build was restarted.
  - All images are at `fcfb580d7a60-7546df7beda8`.
- **Deploy:**
  - Every migrations job exited 0. Connector Hub is at migration 6; the others are unchanged (CMMS 14, Workforce 14,
    Geospatial 3, Analytics 21).
  - Every service is healthy, including `redis` and `kernel-worker`. 5180 answers, and an unsigned Hub request gets
    401.
- **Live proof:** a real Tenant Admin login, signed contexts, 14 Playwright tests.
- **Pull proof** (`e2e/specs/connector-pull.spec.ts`, harness `.pi/handoff/proof-scripts/pull-live.sh`):
  - Setup, leaving the live Hub's allowlist untouched:
    - a throwaway source container;
    - the 5190 proof web;
    - a throwaway Hub sharing the proof web's network namespace, reached at 127.0.0.1:4100 (the web accepts only
      loopback or the service name) and allowed to reach only the source;
    - a throwaway tenant with a Tenant Admin.
  - In Chrome, the admin created a REST pull connection and set up the source (page paging, changed-at field, API key
    header).
  - Pulling without the key said to store the credentials. The key field is a password field and was cleared after
    storing.
  - The first pull read 3 pages: 4 new and 1 quarantined, with its reason shown. The second pull asked only for
    changes: 1 unchanged.
  - Both pulls appear in the history, and the key never appears on the page.
  - All containers and files were removed and the session revoked.
- The proof scripts of 104c and 104d are kept in `.pi/handoff/proof-scripts/` so they outlive the session scratchpad.
- **104d is live.** Next: 104e, the bridge into Analytics, on ADR-0007's outbox-relay-inbox pattern.

## 104e: the bridge into Analytics (ADR-0007 outbox, relay and inbox)

**Step 1: the bridge** (not deployed):
- **Connector Hub, migration 000007:**
  - `deliver_to_analytics` per connection;
  - `outbox_events` (RLS forced);
  - definer functions `relay_lease_analytics_records` (the oldest pending fact per record, so versions arrive in
    order), `relay_settle_analytics_record` and `outbox_sweep` (delivered facts after 30 days). EXECUTE is revoked
    from PUBLIC.
  - The Hub schema contract is now 7.
- **Connector Hub code:**
  - When a connection sends to Analytics, each newly journalled record writes a `CONNECTOR_RECORD_PULLED_V1` fact in
    the same page transaction. The aggregate is the source record, and its version counts that record's facts.
  - `AnalyticsOutboxRelay` and `HubOutboxRetention` (Module SDK) sign with `ANALYTICS_INBOX_RELAY_PRIVATE_KEY_BASE64`
    and deliver to `http://analytics-api:4400/internal/v1/inbox`.
  - `POST connections/:id/delivery` (`connections:write`) sets the switch. An allow-listed `relayCall` is added.
- **Analytics, migrations 000022 and 000023:**
  - The source type `CONNECTOR_HUB` gets its own migration, since a new enum value must be committed before use (the
    fresh-install lesson).
  - `source_connections` gains `hub_connection_id`, with host, port and database now required only for Postgres and
    synthetic sources.
  - `source_sync_runs.hub_sync_job_id`; `inbox_receipts` (RLS forced); `outbox_sweep` for receipts after 90 days.
  - The schema contract is now 23.
- **Analytics inbox** (`src/inbox/connector-hub-inbox.ts`):
  - `POST internal/v1/inbox` answers only a relay token from Connector Hub for the Analytics audience, bound to the
    exact body. `rawBody` is on, and the route-permission spec allows exactly this one relay route.
  - Each message is receipted once. The first delivery creates the Hub connection's `CONNECTOR_HUB` source; each Hub
    pull becomes one sync run; each record becomes a raw record version at the time Hub pulled it.
  - Anything else answers 400, which the relay dead-letters.
  - The Postgres ingestion refuses Hub sources.
  - Analytics now depends on `@gigalibs/module-sdk`.
- **Compose and keys:**
  - The Hub has `CONNECTOR_HUB_RELAY_ANALYTICS_URL` and the private key; Analytics has the public key.
  - `generate-module-runtime-credentials.sh` appends the Analytics inbox key pair if missing.
  - `generate-relay-credentials.sh` now refuses only when CMMS or Workforce relay keys exist, so the new key cannot
    block a fresh setup.
- **Web:** a "Send pulled records to Analytics" switch in the pull-source panel, and the proxy route with its
  boundary test.
- **Caught before running:** the new source rule first allowed only Postgres and Connector Hub. It would have broken
  the Demo Lab's synthetic sources; synthetic is now allowed, and the proof loads the sample farm.
- **Fixed during testing:** the outbox insert used parameters as both varchar and text (the same PostgreSQL inference
  issue as before); they are now cast.
- **Checks:**
  - Hub 51 tests with a throwaway PostgreSQL (migrations 1–7, runtime role, RLS forced). The relay test: with
    delivery on, only newly pulled records become outbox facts (none on a full re-read, none visible to another
    tenant). The real `AnalyticsOutboxRelay` signs each; a stub inbox verifies every token; all are published except
    the refused one, which is dead-lettered; a second pass finds nothing.
  - Analytics `proof:connector-hub-inbox` on a throwaway PostgreSQL (migrations 1–23, non-superuser):
    - one source per Hub connection, and sync runs per Hub pull;
    - duplicates ignored, other tenants isolated, malformed messages refused;
    - discovery, mapping and a dataset build work unchanged. The newest version of each record wins, and a
      late-arriving older copy does not.
    - The Demo Lab sample farm still loads.
  - Analytics `proof:real-database` passes; all 364 Analytics tests pass.
  - `pnpm verify` passes (known drift only).
- **Next:** step 2, unit conversion in mappings; step 3, dataset builds on a schedule with chained summary builds.
  Then the 104e deploy with an end-to-end proof (a Hub pull reaching an Analytics dataset).

**Steps 2–4: units, scheduled rebuilds with chained summaries, and the Sources screen** (not deployed):
- **Units** (`packages/contracts/src/analytics/units.ts`):
  - mass (g, kg, quintal, t, lb), area (m², ha, acre) and volume (mL, L, m³), with common spellings ("Quintals",
    "qtl", "Tonnes", "metric ton");
  - conversions stay within a dimension, and binary noise is rounded away.
  - A mapping's number field may convert from a fixed unit or from the unit named in another field of each record.
    Analytics validates the pairing (for example, kg to ha is refused).
  - At build time, a value whose unit is unknown or of another kind becomes null and is logged, never guessed.
- **Nested records:** mapping source fields may be dot paths (up to five segments), and discovery profiles nested
  objects as dot paths. JSON:API records such as farmOS's (`attributes.…`) can therefore be mapped without code.
- **Scheduled rebuilds:**
  - `POST v1/datasets/build` uses the latest published mapping version when none is given.
  - After a READY build, semantic models on an older build of the same mapping version (identical fields) move to the
    new version, each move audited (`SEMANTIC_MODEL_REFRESHED`, Analytics migration 000024, contract 24). Models on
    another mapping version stay.
  - A failed model move is logged and never turns the finished build FAILED. The dataset spec caught the first
    placement of this code inside the build's failure path.
  - The answer cache key includes the dataset version, so a moved model never serves stale answers.
- **Chained summaries:**
  - `POST v1/datasets/:id/summaries` (kernel only; the web proxy answers 404) builds, and waits for, the summaries the
    saved charts and dashboards on that version need.
  - Kernel operations: `analytics.dataset-build` (schedulable; target a mapping; needs `analytics:mappings:write`) and
    `analytics.summaries-build` (internal).
  - A READY build enqueues the summary job as the same owner (idempotency `summaries:<version>`). A FAILED build is
    final (`BUILD_FAILED`).
  - The schedules API never lists internal operations. `module.call` jobs now have ten minutes.
- **Sources screen** (`/analytics/sources`, menu "Sources"):
  - lists mappable sources (`GET v1/sources`: names, kinds and status only; the Postgres connector's own routes stay
    unexposed, as the boundary test requires);
  - "Map fields": discover, then per field use, dataset name, type and unit conversion; save and publish;
  - Datasets: latest build, "Build now", "Make explorable" (a model with a total of each number field and a record
    count), and a rebuild "Schedule".
  - The data steward role holds every right the screen needs.
- **Checks:**
  - units 2 tests; mapping draft 2 tests; kernel job and schedules tests (chaining, final failure, internal operations
    not listed, the mapping right required);
  - Analytics boundary test for the Sources routes; navigation test with the intended Sources entry; all 364
    Analytics tests;
  - `proof:connector-hub-inbox` (throwaway PostgreSQL, migrations 1–24):
    - quintals, tonnes and acres converted and an unknown unit left empty;
    - nested fields mapped;
    - a rebuild after a new harvest moved the model (audited) and the saved chart's total went from 1,200 to 3,200 kg;
    - the chained summary build readied the chart's summary, and the chart now answers from it;
    - the Demo Lab sample farm still loads.
  - `pnpm verify` passes (known drift only).
- **Deploy plan (owner's OK):**
  - backup;
  - Hub migration 7 and Analytics migrations 22–24;
  - the Analytics inbox relay key pair (credentials script);
  - new core, web, Hub and Analytics images.
  - **End-to-end proof in the browser:**
    - a throwaway source and throwaway Hub that relays to the live Analytics inbox;
    - a pull with "Send pulled records to Analytics" on;
    - on Analytics Sources: map with a unit conversion, build, and make it explorable;
    - then a scheduled rebuild through the live kernel worker, with its chained summary job.

## 104e deploy (owner: "deploy", 2026-09-30 18:24)

- Backup first: `gigalibs_backup_20260930_125422Z.dump`. The credentials script added the Analytics inbox relay key
  pair to `.env.modules` (mode 600; no secret printed).
- All images are at `53247eb8d1c0-603838479495`. Migrations: Connector Hub 7, Analytics 24; the others unchanged.
  Every service is healthy. 5180 answers, and an unsigned Hub request gets 401.
- **Live proof:** a real Tenant Admin login, signed contexts, 14 Playwright tests.
- **End-to-end proof** (`e2e/specs/connector-to-analytics.spec.ts`, harness `.pi/handoff/proof-scripts/e2e-104e.sh`
  and `kernel-stage.sh`). A throwaway source, plus a throwaway Hub sharing the 5190 proof web's network and relaying
  to the live Analytics inbox. In Chrome, a throwaway tenant's Tenant Admin:
  - Connector Hub: set up a REST pull with page paging and an API key; turned on "Send pulled records to Analytics";
    pulled 3 pages, 4 new records.
  - Analytics › Sources: the source appeared (Connector Hub) within seconds.
    - Map fields: `quantity` became `yield_kg`, converted from the unit named in each record's `unit` field
      ("Quintals", "qtl", "tonnes", "kg"). Published with 6 fields.
    - Build now gave dataset version 1 with 4 records. Make explorable created the model.
    - The model answered maize 3,200 kg (12 quintals + 2 tonnes), rice 800 and wheat 500.
    - A saved chart, and a daily rebuild schedule.
  - **Kernel stage:** the schedule was made due. The live kernel worker ran `analytics.dataset-build` (SUCCEEDED,
    dataset version 2 READY), which chained `analytics.summaries-build` (SUCCEEDED, 1 summary ready).
    - The model moved to version 2, and the move was audited (`SEMANTIC_MODEL_REFRESHED`).
    - The schedule was removed afterwards, and no proof schedules remain.
- **The proof found a UI flaw:** "Send pulled records to Analytics" ticked only after Connector Hub answered, so the
  click seemed to do nothing.
  - Fixed: the switch now moves at once and moves back if Hub refuses. The saved spec uses `check()` again, and the
    fix ships with the next deploy.
  - The deployed run clicked and waited instead. Two further harness faults were fixed: a message matched with the
    wrong quotes, and SQL quoting, now in `kernel-stage.sh` with psql variables.
- **104e is live.** F8 remaining: 104f, retiring the connector copies (owner decision: retire Analytics' Postgres
  connector now; a Hub Postgres adapter when a client needs one).

## 104f: retire the connector copies

**Part 1, Analytics' own Postgres connector** (dfa2112; owner: retire now, with a Hub Postgres adapter when a client
needs one):
- `connectors/` and `ingestion/` are deleted (routes, services, modules, specs). Discovery checks the source directly.
- The truth-boundary test now proves Connector Hub through the relay inbox is the only way in.
- The tables stay until the package inventory.
- Checks: 307 Analytics tests; both real-database proofs; `pnpm verify`.

**Part 2, the core API's pull side** (owner option A, 2026-09-30):
- Findings:
  - The core's pull code (HTTP client, Postgres client, network policy) served only "test" and "profile" of REST,
    CSV-over-HTTP and PostgreSQL connections. Every intake path is push: the events API, signed webhooks and file
    uploads.
  - All 40 core connections (and their attempts, events and contracts) belong to old test and certification tenants.
- Done:
  - `connector-http.client.ts`, `connector-postgres.client.ts` and `connector-network-policy.ts` are deleted.
  - Creating a REST, CSV-over-HTTP or PostgreSQL connection answers 400 with a pointer to Connector Hub. Testing or
    profiling an existing one answers 410, before any attempt or circuit state is recorded.
  - Kept: webhooks, file uploads and the events API, the credential service (webhook signatures), the profiler (file
    profiles), the error type.
- Web:
  - "Register source connection" offers only a signed webhook or a file upload, with a link to Connector Hub pull
    sources.
  - An existing pulled connection shows a note instead of Test and Profile.
- Certification scripts:
  - `verify-connector-interfaces.mjs` (only the retired pull types) is retired.
  - `verify-operational-intelligence`, `verify-ap-outcome` and `verify-retention` now register a file-upload source
    (their events come through the events API), and no longer need `CONNECTOR_VERIFICATION_SOURCE_URL`.
  - The operational-intelligence script also asserts that REST is refused with the Connector Hub pointer.
- Named for later: FOUNDATION-CLOSE item 8, the core's push intake.
- Checks: `operational-intelligence.pull-retired.spec.ts` (5 tests); core and web typecheck; `pnpm verify`.
