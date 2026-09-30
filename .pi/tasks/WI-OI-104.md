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
   - First users: Connector Hub pulls, Analytics summary builds and scheduled report runs.
4. **104d Adapter framework** in Connector Hub:
   - logins: API key, bearer token, OAuth2;
   - paging styles: page, offset, cursor, since-watermark;
   - incremental pulls, retries, and a quarantine for bad records.
5. **104e Bridge into Analytics:** an Analytics source of type `CONNECTOR_HUB`. Journal records become raw records,
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
