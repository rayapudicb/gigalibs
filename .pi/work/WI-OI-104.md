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
