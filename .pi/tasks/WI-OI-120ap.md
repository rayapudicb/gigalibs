# WI-OI-120ap: TextFly into GigaLibs, the inventory (port the engine, drop the shell)

- **Status:** Carded, in the bucket, not started (owner, 2026-10-15: "keep the textfly in the bucket"). It starts
  when plan v3 reaches step 1.12 (N1 email), or earlier if the owner moves it.
- **Plan v3:** the step 0.7 decision "`communications-textfly`: adopt or remove". The owner's direction: adopt, by
  integrating TextFly and aligning it with the GigaLibs architecture, not by rebuilding it. It feeds 1.12 (N1 email)
  and Phase 6 (M-U21, the other channels).
- **Work item:** WI-OI-120 (later its own work item). Evidence in `.pi/work/WI-OI-120.md`.
- **Size:** M for the inventory; the port is carded per slice afterwards.

## Why

TextFly (`/Users/rayapudi/dev/TextFly`, clean at `6eafd0b`) is a working multi-tenant communications platform.

| Part | Built with | Size |
| --- | --- | --- |
| `agent-runtime` | Fastify 4, raw `pg`, `jose` JWT; Twilio, Azure Communication Services, SMTP/SES/SendGrid adapters; a Postgres delivery queue with retries and dead letters | 318 files, ~57k lines |
| `admin-console` | React 18, Vite, Tailwind | 170 files, ~38k lines |
| `embed-demo-host`, `packages/*` | embed SDK, host kit, contracts | — |
| Database | 64 SQL migrations (`docs/db/migrations`) | — |

GigaLibs differs where it matters:
- NestJS module APIs on the module SDK;
- one control plane for sign-in, tenants, roles, permissions, entitlements and billing;
- a signed platform context, not plain tenant headers;
- one schema per module, with tenant isolation and a least-privilege role, migrated by the runner;
- the outbox and kernel worker;
- Next.js and Medusa UI screens on metadata windows (the S16 kit);
- the zero-mock audit.

Pasting TextFly in whole would run a second login, tenant model, permission system and billing, and would fail the
repository's audits. Its apps are quarantined in `config/runtime-quarantine.json` today.

## What the inventory produces (for the owner's approval)

A table of every TextFly folder, route group and table, each marked keep, adapt, replace or drop:

- **Keep and move (mostly copy; adapt the edges):** `channels` (provider adapters), `delivery` (queue, retries, dead
  letters), `templates`, `inbox`, `reach` (campaigns), `scheduler`, `pipeline` (to be read: rules or routing),
  provider callbacks and delivery receipts. Their tables move into `gigalibs_communications` as numbered migrations,
  with tenant isolation.
- **Replace with GigaLibs':**
  - `auth`, `tenants`, `entitlements`, `billing`, `platform`, `platform-care`, `support`, `settings`, `security` (where
    they duplicate the control plane);
  - `credentials` (the Connector Hub vault);
  - `connectors` (the Connector Hub; WhooCrew only if needed).
- **Re-wire thinly:** Fastify routes become NestJS controllers on the module SDK. Admin-console screens become GigaLibs
  windows; the current Communications screen is the start.
- **Drop:** `demo` and `embed-demo-host`. The embed SDK and host kit go too, unless embedding into other products stays
  a goal (owner decision).
- **Later, to decide:** `call-transcription`; `skills` and `tools` (they overlap the Assistant's GU cards).
- **Security, before any connection:** the GigaLibs proxy must send a signed platform context, not the plain
  `x-tenant-id` and `x-user-id` headers used today (WI-OI-120ak S4 note).
- **Security, before any connection (WI-OI-120ak review L1):** remove the Communications route's bypass for platform
  operators and `*` holders, so the module lock, entitlement and permission apply to everyone.
- **Source of truth:** the standalone repository, not the untracked `modules/communications-textfly` copy inside
  GigaLibs (owner to confirm).

## Done when

- [ ] The inventory table is written from the code and approved by the owner.
- [ ] The port is split into slices in plan order: N1 email first (1.12), then the other channels (M-U21).
- [ ] The decision on the untracked copy and the embed kit is recorded.
