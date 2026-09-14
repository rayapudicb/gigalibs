# GigaLibs frontend data-truth and authentication audit

Date: 2026-09-09. Evidence basis: **static inspection of current working tree**, including existing modified and untracked files. This is not deployed-runtime certification. No product files changed, no external requests issued, no database data read or written. No credentials or token values reproduced here. Mandatory project baseline was read by the coordinating auditor; this reviewer read `.pi/agents/tenant_identity_access/AGENT.md`, `docs/architecture/THREAT_MODEL_AND_PERMISSIONS.md`, and auth/tenancy contracts.

## Verdict for this scope

The current frontend contains direct, unguarded routes and user journeys that fabricate successful external business actions, provider connectivity, telemetry, financial impact, and persistence claims. Several finance/maintenance routes silently substitute seeded process memory when the real service is absent or unavailable. Consequently, a populated screen or successful HTTP response cannot establish legitimate data, end-to-end execution, or business readiness for these journeys.

## Findings

### DT-01 — Critical: failed authentication service grants an administrator session

`apps/workflow-platform/app/api/auth/login/route.ts:19` checks only that email/password are nonempty. At lines 34–64, any exception during control-plane URL resolution/fetch enters a branch that creates a SUPER_ADMIN token for a fixed user and tenant, sets it as both access and refresh token, and returns `authenticated: true`. Line 36 falls back to a hardcoded signing-secret value; no production-environment guard surrounds this behavior. Password verification is absent from this branch.

Expected: missing/unavailable authentication must fail closed; credentials must be verified and a server-controlled membership must determine role/tenant. Static consequence: outage or missing configuration changes authentication into fabricated administrator success. Acceptance of this JWT by each downstream API has not been tested; its shape also differs from `packages/contracts/src/auth/index.ts:52` (required session ID and roles array).

Related registration risk: `app/api/auth/register/route.ts:81` fabricates tenant/user identifiers if an upstream 2xx response lacks them; lines 84–107 mint a JWT with the same signing-secret fallback and reuse it for refresh. Registration reaches an actual onboard service; its persistence and response contract were not audited in this subtask.

### DT-02 — Critical: direct business routes lack caller authentication and trustworthy tenant resolution

The complete reviewed handlers for analytics actions, local AR/CMMS/tax, OAuth, ontology, saga, event replay, rule kernel and live sync contain no incoming authenticated principal or permission checks. `apps/workflow-platform/middleware.ts:39` only matches selected page paths, excludes `/api`, and its function only injects routing headers before `NextResponse.next` (lines 25–36). `app/(app)/layout.tsx:7` renders the app without an authentication guard.

Concrete isolation failures: `app/api/ontology/route.ts:9` takes tenant from query, and lines 15–16 retrieve party details without applying it; omission/invalid selection returns all tenants (29–33). `app/api/rules/kernel/rules/route.ts:6` trusts header/query and lines 17–34 trust header/body for creation. AR/CMMS upstream proxy code uses a shared cached service token (`app/api/ar/[...path]/route.ts:17`, `:75`; `app/api/cmms/[...path]/route.ts:15`, `:69`) without authorizing the incoming caller. Tax forwards arbitrary caller `x-tenant-id` and no Authorization header (`app/api/tax/[...path]/route.ts:49`).

These are current source-level access paths. External ingress or deployed reverse-proxy rules were not assessed; no claim of a confirmed external exploit is made.

### DT-03 — Critical: analytics actions report external execution without executing it

UI trace: `app/(app)/analytics/page.tsx:152` → POST `/api/analytics/action` at line 158 → route switch `app/api/analytics/action/route.ts:45` → immediate `success: true`, `status: EXECUTED` response at lines 99–109 → page changes React sets and displays result at lines 168–178.

The route only validates a small tenant enum and action/entity presence, assigns fixed text/metrics, computes a hash, and returns. It makes no provider request, repository write, durable action/audit record, or entity lookup. It claims payment blocking and vendor/legal notification, a verified 14-line three-way match, mailed dunning, or a 2,500 MW grid rebalance. The payment case claims a fixed $45,000,000 held (lines 46–52); grid case claims frequency/carbon outcomes (74–80). The hash covers the fabricated response, not proof of an external effect.

### DT-04 — High: AR, CMMS and tax silently replace real systems with seeded process memory

Fallback points: `app/api/ar/[...path]/route.ts:55–64`, `app/api/cmms/[...path]/route.ts:53–62`, `app/api/tax/[...path]/route.ts:28–37`. A missing service URL or caught upstream exception selects the local store without a production guard or provenance warning.

AR trace: `app/(app)/ar/page.tsx:378` → `lib/ar-api.ts:169` → `/api/ar/v1/invoices` → local `arLedgerStore.getInvoices` at route line 123. `lib/ar-ledger-store.ts:25` initializes hardcoded customers/invoices. Create at route lines 130–137 calls `createInvoiceDraft`; its write is `this.invoices.unshift` (`lib/ar-ledger-store.ts:601`). Issue uses a fixed tenant for the ledger seal at line 637. Local arrays cannot provide shared database durability, restart survival, or tenant isolation.

CMMS trace: `app/(app)/cmms/assets/page.tsx:5` → `components/cmms/CmmsDashboardView.tsx:148` for asset search / `:273` for create → `lib/cmms-api.ts:227` → `/api/cmms` → route lines 112–119 → `lib/cmms-store.ts:19` seeded assets and `:597` array mutation. New assets invent measured-looking health/reliability values (581–584). Completing a work order generates two UUIDs prefixed `sha256:` rather than hashing a payload (`:662`). The UI advertises FIPS/ACID at `components/cmms/CmmsDashboardView.tsx:299`.

Tax trace: `app/(app)/tax/page.tsx:111` or create at `:132` → `lib/tax-api.ts:95` → local route `app/api/tax/[...path]/route.ts:92–111` → `lib/tax-ledger-store.ts:11` seeded jurisdiction/business totals and `:247–270` array insertion under fixed `TEN-GIGA-INTERNAL`. These are not database commits. Independent upstream services may have actual persistence; this finding concerns what the production frontend selects when they are missing/failing.

### DT-05 — High: frontend substitutes examples even when real database result is empty

`app/(app)/ar/page.tsx:379–385` catches each API failure into hardcoded fallbacks and replaces successful empty invoice/customer lists with fallback invoices/customers. Lines 397–400 call it an “ACID ledger cache.” `app/(app)/tax/page.tsx:111–115` similarly replaces empty jurisdictions or errors and clears the error. A new legitimate empty tenant can therefore appear populated with unrelated example business data even if the backend is correct. No operational isolation label is added in these branches.

### DT-06 — High: OAuth consent, connectivity and schema discovery are fabricated

UI `app/(app)/connections/oauth-studio/page.tsx:106` creates a session, then at lines 132–138 directly posts a locally generated authorization code to `/api/oauth/callback`; it does not require provider-issued consent before this transition. The callback route has a sample auth-code default (`app/api/oauth/callback/route.ts:9`). `lib/oauth-handshake-store.ts:276–317` checks only that state exists, ignores the supplied auth code, generates random bytes as token material, marks CONNECTED, and copies static scope/entity metadata. `:323–340` returns random latency and HEALTHY without contacting a provider. UI line 163 calls it a “Live ERP Heartbeat.”

The store constructor (`:57–59`) also initializes CONNECTED Salesforce/SAP/NetSuite entries with fabricated heartbeat/fingerprint data (`:164–201`). Credentials/sessions are Maps (`:53–55`). Default tenant is defense in authorize and heartbeat routes (`app/api/oauth/authorize/route.ts:9`, `heartbeat/route.ts:9`). No provider exchange/credential-vault persistence or caller/tenant authorization exists in these paths.

### DT-07 — High: live ingestion labels hardcoded values as current provider data and PostgreSQL writes

`app/(app)/analytics/page.tsx:133` says records were synced to a PostgreSQL partition. Route `app/api/connectors/live-sync/route.ts:111–166` constructs fixed CAISO/ERCOT values with the current hour and marks HEALTHY, without any EIA request. The store uses Maps (`lib/tenant-ingestion-store.ts:40–44`), seeds business records (`:67–85`), and its upsert only calls `Map.set` (`:338–368`).

Defense and Treasury branches do attempt real public-provider fetches, but substitute enormous defaults for missing, invalid, or zero values (`app/api/connectors/live-sync/route.ts:80–94`, `:183–188`), swallow errors, then mark HEALTHY and update last synced timestamps (`:103–110`, `:207–214`). Thus a checksum and fresh timestamp do not distinguish genuine provider records from constants or failed refresh. Provider field semantics and correctness were not verified against live services in this read-only task.

### DT-08 — High: saga and event replay claim external commit/recovery from local status assignments

`app/api/saga/route.ts:56–69` calls `executeSaga` and reports all external systems committed or rollback with zero corruption. `lib/saga-orchestrator.ts:205–273` stores purported HTTP actions as strings; loop lines 288–327 assigns SUCCESS/COMPENSATED and log text without executing those requests. State resides in a Map (`:47`). GET reports fixed 100% integrity and 14.8 ms latency (`app/api/saga/route.ts:27–28`).

`app/api/event-fabric/replay/route.ts:19` → `lib/event-fabric-queue.ts:240–275` patches payload, assigns SUCCESS, removes error/quarantine context, stores in Map, and says committed to tenant partition. It does not republish to a broker, validate downstream acceptance or write a partition. Queue statistics add 18,450 ingested and 18,447 delivered events and return fixed latency (`:225–236`).

### DT-09 — High: solution packs record financial outcome before any evidenced ERP effect

UI `app/(app)/solutions/page.tsx:116` → route `app/api/solutions/execute/route.ts:9` (default defense/pack) → `lib/solution-packs-store.ts:292`. It falls back to sample payload (`:302`), claims PII-redacted fields without performing redaction (`:308–312`), uses a fixed goods receipt (`:332`), assigns ERP_WRITEBACK_SUCCESS or a generated hold reference (`:339–346`), increases preventedLeakageUsd in memory, then calls broker simulation (`:350`). Trace financial impact is recorded at `:372`; history is an array capped at 50 (`:378–379`). This subtask did not establish whether broker infrastructure calls succeed; even successful broker transport cannot by itself prove the separately claimed ERP financial effect.

### DT-10 — High: metering and identity displays can be unrelated to authenticated tenant/business facts

`app/api/admin/metering/route.ts:32` starts invoice count at 14, attempts a shared service query, forces successful empty list to at least 1 (`:53`), and otherwise returns fixed tenant business counts/quotas (`:63` onward). It is not a verified customer billing meter.

`lib/auth-profiles.ts:17` hardcodes profiles; `:68–81` defaults to a SUPER_ADMIN profile, and `:84–91` writes selected role/user/tenant to client-controlled storage and cookies. This does not prove actual downstream privilege escalation by itself, but identity/tenant presentation is detached from the authenticated account. It combines badly with unguarded handlers and fixed tenant stores.

## Scope and gaps

Search covered `apps/workflow-platform/lib` and `app/api` for fabricated state, fallback, tenants, authentication and persistence markers. Detailed traces covered login/registration, analytics actions/live ingestion, AR, CMMS, tax, OAuth, ontology, saga, event replay, solution execution, rule kernel, metering and the shared upstream helper. The local business-store findings here involve arrays/Maps; no JSON-file business write was identified within this narrow frontend-library scope. JSON files or persistence in independent module services were not comprehensively audited.

Positive boundary: `app/api/operational-intelligence/[...path]/route.ts:18–21` uses `authenticatedUpstream`, returns authentication-required when no token, and unavailable on exception. `lib/authenticated-upstream.ts:113–129` propagates the access token to the control/execution plane and handles refresh. Existence of this safer path does not protect separate handlers that bypass it, and the login fallback weakens session confidence globally.

No manual UI actions, HTTP requests, restart tests, database/provider cross-checks, or production checks were run by this reviewer. No module is certified business ready. Next evidence should come from an isolated environment: unauthenticated/cross-tenant negative tests; control-plane outage login rejection; empty-database screens; AR/CMMS/tax create-read-restart verification; real provider consent/token/heartbeat tests; durable action and downstream-effect reconciliation; and independent review of security/financial findings. These are required confirmations/remediation acceptance cases, not already passing results.
