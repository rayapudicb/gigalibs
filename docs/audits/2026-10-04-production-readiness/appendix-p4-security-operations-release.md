<!-- WI-OI-119 auditor working report, copied verbatim except for masked dev-default credentials. -->
> **Provenance.** Read-only auditor report produced for WI-OI-119 on 2026-10-04/05. It covers deliverables I (security/tenant/RBAC matrix), K (observability/SLO/backup/restore), runtime vs repository, supply chain and release gates, WI-OI-013 controls.
> Findings marked CONFIRMED were reproduced by the auditor from code or commands; PLAUSIBLE ones were not. The primary
> agent re-checked every P0/P1 it relies on; that verification, and any severity changes, are in `README.md` and
> `.pi/work/WI-OI-119.md`, which take precedence over this appendix.

# P4: Security, operations and release audit (WI-OI-119)

Auditor: P4 (Security / operations / release). Mode: read-only. Repo `/Users/rayapudi/dev/gigalibs`, branch
`feat/gigaops-convergence-core`, HEAD `76b94529c75e29d1ae8525b5e08899399e0e8485` (2026-10-04 21:13 +0530).
Release verdict: **NO-GO**, and these findings confirm it.

Commands used: `git ls-files/grep/log/show`, `docker ps -a`, `docker images`, `docker inspect`, `unzip -l`, plus read-only
Python and awk parsing. No secret value appears in this report. Environment variable names were listed only after values
were stripped with `cut -d= -f1`.

Tags: CONFIRMED means the cited code, git object or command output shows it directly. PLAUSIBLE means the code is
confirmed but the runtime effect could not be observed without forbidden actions (DB connection, logs, exec, network).

---

## 0. Summary counts

| Severity | Count | Headline |
|---|---|---|
| P0 | 2 | (1) Three registered modules authenticate nobody and take the tenant from a caller header. (2) The release database schema has never been restored, and there is no PITR. |
| P1 | 15 | Running artifact matches no commit; CMMS and Workforce are down; HEAD does not build or deploy (untracked files, finance version drift); the verify gate plants a login role with a hard-coded password; finance replica tables have no RLS; the five new modules have no API negative tests and no org-scope enforcement; password login has no throttling; WI-OI-003/005/006/007/008 claims have no evidence; CI never ran; no named human reviewers; no production deployment artifact; no scans for current images. |
| P2 | 13 | Platform-context key rotation and revocation gaps; no CSP or security headers; CSRF relies on SameSite only for control-plane writes; Secure cookie off; module observability absent (no metrics, traces, alerts, SLOs or on-call); runbook gaps; legacy modules have no production authentication path; live third-party credentials in untracked workspace files; PUT/DELETE gateway routes unreachable; no session/device management; stale generated files at e532d98. |
| P3 | 6 | Concrete dev passwords in `.env.example`; hard-coded fallback DB URL in verify scripts; public governor endpoints; `.env` auto-load; CI Node 22 vs runtime Node 24; refresh cookie path `/`. |

---

## 1. Deliverable I: Security, tenant, RBAC and object-authorization matrix

### 1.1 Platform request path

| Step | Mechanism | Evidence | Status / gap |
|---|---|---|---|
| Browser to BFF authentication | HttpOnly cookies `gigalibs_access_token` (HS256 JWT) and `gigalibs_refresh_token` (opaque, DB-hashed, rotated). `SameSite=Lax`. `Secure` only when `COOKIE_SECURE === 'true'`. | `apps/workflow-platform/lib/auth-constants.ts:1-2`; `lib/control-plane.ts:69-86`; `packages/auth-nest/src/auth.service.ts:123-197` (hashRefreshToken, rotation) | CONFIRMED. Running web has `COOKIE_SECURE=false` (docker inspect env, value non-secret). Helm never sets it, so production cookies would be sent without Secure (P2). |
| Header hygiene | Next middleware strips `x-tenant-id`, `x-tenant-slug`, `x-tenant-subdomain`, `x-user-id` and `x-user-role` from every request. | `apps/workflow-platform/middleware.ts:5-11` | CONFIRMED good. |
| Session validation in the BFF | `verifiedSession()` calls control plane `/api/v1/auth/context` with Bearer; checks the response shape; refuses tenant status other than ACTIVE or TRIAL. | `lib/verified-session.ts:114-151` | CONFIRMED. The BFF does not check `trialEndsAt` itself; the control plane does (next row). |
| Control-plane JWT validation | Global `APP_GUARD` chain: JwtAuthGuard, then TenantBoundaryGuard, then RbacGuard. JWT is HS256 (`JWT_ACCESS_SECRET` ≥ 32 chars). Every request does a DB session lookup (ACTIVE, unexpired, tid match), checks user ACTIVE and tenant MFA policy, and reloads membership role from the DB. | `apps/playground-api/src/app.module.ts:259-261`; `packages/auth-nest/src/guards/jwt-auth.guard.ts:44-100`; `packages/auth-core/src/jwt.ts:18,34-73` | CONFIRMED good. Minor: `exp` is optional in `verifyJwt` (`jwt.ts:67`), but the signer always sets it. No iss/aud claims. |
| Tenant lifecycle | TenantBoundaryGuard refuses non-ACTIVE membership, tenant status outside ACTIVE/TRIAL, an expired trial, and a requested tenant id that differs from the token tenant. | `packages/tenancy-nest/src/guards/tenant-boundary.guard.ts:69-96` | CONFIRMED. |
| Platform context issue (`signed-platform-context-v1`) | Minted by the **web BFF**, not the control-plane API, per request through `createSignedModuleProxy`. Ed25519 compact JWS `{alg:EdDSA,typ:JWT}`. iss is `gigalibs-control-plane`; aud is per module; TTL is at most 300 s; jti is random; `session_id` and `auth_version` are carried; the entitlement claim must be ENABLED. | `packages/auth-core/src/platform-context.ts:26-46,190-227`; `apps/workflow-platform/lib/signed-module-proxy.ts:59-127` | CONFIRMED. Key source is one env var per module, `<MODULE>_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64` (`signed-module-proxy.ts:172-184`). |
| Who holds signing keys | `web` and `kernel-worker` both hold every module's private key. | `infra/compose/generated/compose.module-host.yaml:225-246`; `infra/compose/compose.modules.local.yaml:275-312`; running web env names list 8 `*_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64` keys | CONFIRMED. A compromise of the internet-facing web process can forge any tenant's context for any module (P2, architectural). |
| Rotation | No `kid`. The verifier accepts exactly one public key (`verifyPlatformContextToken(token, publicKeyPem, aud)`). No overlap window and no rotation runbook. | `platform-context.ts:48-72`; `git grep -il 'platform.context.*rotat' docs .pi infra` → only an inventory doc | CONFIRMED gap (P2). |
| Expiry and replay | `exp > now`, `iat ≤ now+5`, no `nbf`. The verifier never checks `jti`, so there is no replay cache; a token is replayable for up to 300 s. | `platform-context.ts:114-120` | CONFIRMED (P2, bounded). |
| Audience binding | Checks `aud === expectedAudience` and `iss`. Modules also re-check `entitlement.module_key === moduleKey`. | `platform-context.ts:100-112`; `packages/module-sdk/src/signed-context.ts:128-135` | CONFIRMED good. A host-proof script exists that refuses cross-module tokens (`.pi/handoff/proof-scripts/host-proof.sh:100`). |
| Revocation at modules | `isContextRevoked` reads `<schema>.auth_revocation_events` (SESSION or SUBJECT_AUTH_VERSION). | `packages/module-sdk/src/database.ts:133-152` | **No production writer exists.** `git grep -i 'insert into.*auth_revocation_events'` finds only `modules/product-catalogue/apps/api/scripts/real-database-proof.ts:133`. The table is read-only to the runtime (`MODULE_READ_ONLY_TABLES`). Revocation is therefore effective only through the BFF's per-request DB session check plus the 300 s TTL. CONFIRMED (P2). |
| Permissions | The BFF requires an allow-listed route, the entitlement and the permission (`signed-module-proxy.ts:73-93`). The module guard requires `@RequirePermissions`. `*` and `<prefix>:*` act as wildcards. | `signed-context.ts:139-142,209-215` | CONFIRMED. A route with no metadata admits any entitled member (`signed-context.ts:224-233`). All new finance controllers decorate every route (8 controllers, 96/96 routes). |
| RLS | `withTenantTransaction` runs `set_config('search_path', schema)` and `set_config('app.tenant_id', $1, true)`. Policies take the form `tenant_id = NULLIF(current_setting('app.tenant_id', true), '')` with FORCE RLS. | `packages/module-sdk/src/database.ts:92` | CONFIRMED. Gaps per module are below. |
| CSRF | The signed proxy and the legacy module proxies check the Origin against host/x-forwarded-host for mutations (`lib/same-origin.ts:1-13`). | `signed-module-proxy.ts:44,94` (only POST and PATCH count as mutating) | **Unchecked mutating BFF routes:** `app/api/control/[...path]` (settings, tenants, parties, auth external-identity revoke, MFA assisted-recovery approve), `app/api/auth/*` (login, register, change-password, MFA, select-tenant), `operational-intelligence/[...path]`, `workflows/*`, `runs/*`. These rely on SameSite=Lax only (P2). |
| Security headers | Next config has no `headers()`, CSP, HSTS, X-Frame-Options or Referrer-Policy. Nest APIs use helmet. | `apps/workflow-platform/next.config.mjs:7-25`; `apps/playground-api/src/main.ts:24` | CONFIRMED gap for the web (P2). |
| Login brute force | No password-login lockout or throttle. `failedAttempts`/`lockedUntil` exist only in the TOTP path. The Governor throttling guards are registered providers but never applied. | `packages/auth-nest/src/auth.service.ts:98` (login verifyPassword), `:638-663` (TOTP lockout); `apps/playground-api/src/app.module.ts:255-257` (providers only; no `UseGuards(Governor…)` anywhere) | CONFIRMED (P1). |

### 1.2 Per-module matrix (23 tracked `modules/*/module.yaml`)

`communications-textfly` and `platform-rbac` are untracked and excluded. "Neg tests" means module-local test or proof
files that contain cross-tenant, scope, revocation, entitlement or expiry cases (keyword scan over `git ls-files`).
The shared guard test `packages/module-sdk/src/signed-context.test.ts:94-151` covers valid, revoked, entitlement and
wildcard cases for every SDK-guard module. Web-side boundary tests live in `apps/workflow-platform/__tests__/*-boundary.test.ts`.

| Module | Auth at module API | Tenant source | Permission / entitlement enforced server-side | Object / org scope | RLS session var | Module neg tests | Runtime now | Gaps |
|---|---|---|---|---|---|---|---|---|
| financial-operations | SDK SignedContextGuard (`src/authorization.ts`) | signed `tenant_id` | Yes; 96/96 routes `@RequirePermissions` | Org claim used only in fixed-assets (`fixed-assets.service.ts:149,850`); GL, treasury, close and budget ignore `principal.organization` | Yes. **`org_replica_versions/units/closure` have no RLS** (`db/migrations/000001…:21,36,52` vs RLS loop `:418-429`) | Pure-engine unit tests only (6 files); DB proofs `scripts/verify-*.mjs` use `rls_test_user` | **Not deployed** (no `.env.module.financial-operations`, no container, absent from the running module-host env) | P1: HEAD boot failure (§3.4); P1: no API negative tests; P1: replica RLS missing |
| product-catalogue | SDK guard | signed | Yes | `catalogue.service.ts:906` uses `organizationAccess` | Yes (22/22 tables + schema_migrations) | 1 service test; DB proof with revocation insert | In module-host (migration 1) | P1: no API negative tests |
| universal-inventory | SDK guard | signed | Yes | `inventory.service.ts:115` (one use) | Yes (27/27) | **0 test files**; DB proof + `scripts/verify-universal-inventory.mjs` | In module-host, built from an uncommitted tree (migration 2) | P1 |
| universal-orders | SDK guard | signed | Yes | **None.** `org_unit_id` is stored (`orders.service.ts:65,210`), but `principal.organization` is never read | Yes (information_schema loop) | **0 test files** | In module-host (migration 2, uncommitted at build time) | P1: org scope not enforced; no tests |
| universal-procurement | SDK guard | signed | Yes | **None** (no `principal.organization` reference) | Yes (19/19) | **0 test files** | In module-host (migration 2) | P1 |
| analytics-studio | Own signed-context guard + revocation (`src/auth/authorization.ts`) | signed | Yes (BFF allow-list `lib/analytics-proxy.ts:28-85`) | Place and org scope (5 files) | Yes | 26 tests incl. cross-tenant (5), scope (9), revoked (6) | Running (007e686 + dirty tree) | P2: revocation table has no writer |
| geospatial | Own signed-context guard | signed | Yes | Place scope | Yes | 6 tests (scope 4, revoked 1); no cross-tenant | Running | P2: no cross-tenant test |
| universal-connector-hub | Signed-context guard + `x-tenant-id` read in auth file | signed | Yes | None found | Yes | 6 tests incl. cross-tenant 1, revoked 1 | Running | Header usage should be confirmed as binding-only (PLAUSIBLE OK) |
| gigaops (Workforce) | Own signed guard + relay guard | signed | Yes | Org and place (5 files) | Yes (module-sdk DB) | 25 tests; no cross-tenant keyword | **DOWN**: `workforce-migrations` exit 1 at 07:06:35Z; API `Created`, never started | P1 runtime |
| physical-operations-cmms | Own signed guard + `auth/scope.ts` | signed | Yes | Org and place (11 files) | Yes | 21 tests incl. cross-tenant 1, revoked 3 | **DOWN**: `cmms-migrations` exit 1; API `Created` | P1 runtime |
| **universal-data-studio** | **None.** No guard; `@Headers('x-tenant-id')` | **caller header** (`lineage.controller.ts:8-18`, `contracts.controller.ts:20-104`) | **No** | None | `set_config` from the same untrusted header | 0 auth tests | Not deployed (BFF requires a loopback URL) | **P0** |
| **universal-rule-pro** | **None** | caller header or `body.tenant_id` (`evaluator.controller.ts:11-17`, `logs.controller.ts:8-10`) | **No** | None | from the header | 0 | Not deployed; catalog readiness REVIEW | **P0** |
| **workflow-studio** | **None** | header or `body.tenant_id` (`execution.controller.ts:8-23`, `runs/workflows.controller.ts`) | **No** | None | from the header | 0 | Not deployed; readiness REVIEW | **P0** |
| ontology | Dev OIDC JWKS; falls back to `x-tenant-id` when `allowInsecureOidc` | token tenant, or header in dev | Partial (default all perms in dev, `authorization.ts:73-76`) | None | Yes | 0 | Not deployed; CONTAINED | P2 (dev-gated) |
| saga-orchestrator | Same pattern as ontology | token / dev header | Partial | None | Yes | 0 | Not deployed; CONTAINED | P2 |
| document-scanner | Same pattern | token / dev header | Partial | None | Yes | 0 | Not deployed; CONTAINED | P2 |
| accounts-receivable | Module OIDC JWKS; BFF obtains tokens from the module's own **dev issuer** `/oidc/token` | token | Yes | None | Yes | 14 tests, none cross-tenant | Not deployed; CONTAINED | P2: no production auth path (dev issuer refused when `NODE_ENV=production`) |
| spend-management | Same (`auth/oidc-dev.service.ts:17-31`, refused in prod at `runtime-config.ts:22-24`) | token | Yes | None | Yes | 4 | Not deployed; CONTAINED | P2 |
| tax-configuration | Same | token | Yes | None | Yes | 5 | Not deployed; CONTAINED | P2 |
| multi-currency | Same | token | Yes | None | Yes | 6 | Not deployed; CONTAINED | P2 |
| esignature | Same | token | Yes | None | Yes | 2 | Not deployed; CONTAINED | P2 |
| autonomous-recovery-studio | Same | token | Yes | None | n/a | 2 | Not deployed; CONTAINED | P2 |
| communications | No tracked API (3 files); BFF forwards `x-tenant-id` to `COMMUNICATIONS_API_URL` (`app/api/communications/[...path]/route.ts:66-75`) | header | n/a | n/a | n/a | 0 | Not deployed; prototype | P2: trusts a header if ever wired to the untracked textfly |

### 1.3 Platform-level negative tests that exist (file paths)

- Cross-tenant: `e2e/specs/authenticated-multi-tenant-persona.spec.ts`; `apps/playground-api/src/tenant-workload-admission.spec.ts`; `packages/db/src/organization-hierarchy.integration.test.ts`; `apps/workflow-platform/__tests__/{currency,esign,ontology,recovery,saga,scanner,spend,tax,workflow-studio}-boundary.test.ts`.
- Sibling / out-of-scope: `apps/workflow-platform/__tests__/platform-context-organization-scope.test.ts`; `packages/auth-nest/src/session-permissions.spec.ts`; `packages/tenancy-nest/src/organization.integration.test.ts`; `apps/playground-api/src/kernel-worker/organization-sync.integration.test.ts`.
- Suspended: `packages/auth-nest/src/guards/jwt-auth.guard.spec.ts`; `session-permissions.spec.ts`; `apps/playground-api/src/tenant-data-export.spec.ts`; `tp6-reference-cohort.spec.ts`.
- Expired trial: `apps/workflow-platform/__tests__/{analytics,ar,cmms,connector-hub,…}-boundary.test.ts`; `packages/tenancy-nest/src/guards/tenant-boundary.guard.spec.ts`.
- Missing entitlement: `packages/module-sdk/src/signed-context.test.ts:131`; `apps/playground-api/src/kernel-worker/module-call.job.test.ts`.
- Revoked session: `jwt-auth.guard.spec.ts`; `signed-context.test.ts:144`; `apps/workflow-platform/__tests__/external-identity-bff.test.ts`; `e2e/specs/organization-admin.spec.ts`.
- **Modules lacking module-level negative tests:** financial-operations, universal-inventory, universal-orders, universal-procurement, product-catalogue (all five new hosted modules); universal-data-studio, universal-rule-pro, workflow-studio (no auth at all); ontology, saga-orchestrator, document-scanner, communications.
- **Missing BFF gateway tests:** `module-gateway-equivalence.test.ts:150-190` covers only CMMS and Workforce. Nothing tests the finance, catalogue, inventory, orders or procurement allow-lists (`lib/generated/module-gateways.ts:30-1860`).

### 1.4 Gateway method gap

`lib/generated/module-gateways.ts` declares `PUT` at lines 70 (`finance:coa:manage`) and 92 (`finance:periods:manage`, fiscal
period status), and `DELETE` at 200 (treasury unmatch) and 1079 (CMMS spaces). The only gateway route,
`app/api/[gateway]/[...path]/route.ts`, exports GET, POST and PATCH only. Those operations therefore cannot be reached from the browser (Next answers 405).
If PUT or DELETE were exported later, `signed-module-proxy.ts:44` (`MUTATING_METHODS = POST, PATCH`) would skip the Origin
check and the body read for them. CONFIRMED (P2).

---

## 2. Secrets and configuration

| # | Finding | Evidence | Sev | Tag |
|---|---|---|---|---|
| S1 | No committed `.env`, private keys or PEM blocks; no `.env` in git history | `git ls-files | grep .env` → only 9 `*.example`; `git grep 'BEGIN … PRIVATE KEY'` → none; `git log --all --diff-filter=A` → no `.env` | — | CONFIRMED good |
| S2 | **The verify gate creates a persistent LOGIN role with a hard-coded password and `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA gigalibs_finance`** in whatever DB `CONTROL_PLANE_DB_URL` targets. The role is never dropped. It runs in `pnpm verify` (`scripts/verify.mjs:32-38`). | `scripts/verify-period-close-and-forecasting.mjs:667-672` (role `rls_test_user`, password literal `rls_…`); same block at `verify-financial-operations.mjs:641`, `verify-treasury-reconciliation.mjs:575`, `verify-fixed-assets.mjs:586`, `verify-consolidation.mjs:483`, `verify-inventory-costing.mjs:597`, `verify-budgeting-and-commitment-control.mjs:590` | P1 | CONFIRMED in code; that the role exists in the live DB is PLAUSIBLE (the WI-OI-118 evidence says the gate passed against port 5440) |
| S3 | The same seven scripts default to a hard-coded owner-credential URL `postgresql://gigalibs:<dev pwd>@localhost:5440/gigalibs` | `verify-financial-operations.mjs:28`; `verify-period-close-and-forecasting.mjs:37` (and 5 more) | P3 | CONFIRMED |
| S4 | Control DB container publishes 5440 on **all interfaces** (`HostIp ""`), which increases S2/S3 exposure on the LAN | `docker inspect gigalibs-postgres` → `{"5432/tcp":[{"HostIp":"","HostPort":"5440"}]}`; `docker/docker-compose.dev.yml:11` | P2 | CONFIRMED |
| S5 | Concrete (non-placeholder) DB password in example files | `modules/analytics-studio/apps/api/.env.example:6`, `modules/esignature/apps/api/.env.example:6` (role `spend_runtime`, value redacted) | P3 | CONFIRMED |
| S6 | Compose requires every secret (`${VAR:?}`), and generators write mode-600 `.env*` files | `infra/compose/compose.yaml:7-89`; `ls -la infra/compose/.env*` → `-rw-------` | — | CONFIRMED good |
| S7 | **Untracked workspace files hold live third-party credentials**: SMTP/IMAP passwords, Twilio Account SID and Auth Token, E2E persona passwords. All are git-ignored and were never committed. Agents working in the repo can read them, and a `.env.bak` duplicate exists. | `modules/communications-textfly/apps/agent-runtime/.env.bak` lines 10, 11, 18, 24, 31, 39 (SMTP/IMAP pwd), 46 (Twilio SID), 47 (Twilio token); `…/agent-runtime/.env` lines 25, 26, 33, 39, 46, 54; `modules/communications-textfly/e2e/agnostic-suite/.env:4,6`; `…/e2e/admin-console/.env:6,10`; `modules/platform-rbac/apps/api/.env:5` (DB URL) | P2 | CONFIRMED (presence only; rotation recommended) |
| S8 | No secret material in `scratch/`, `Claude outputs/`, `universal-invoicing-demo*` (pattern scan; `unzip -l` of the zip shows no env or key files) | grep or unzip returned nothing | — | CONFIRMED |
| S9 | No `NODE_TLS_REJECT_UNAUTHORIZED`, `rejectUnauthorized:false`, `verify=False` or `sslmode=disable` in tracked code | `git grep` → none | — | CONFIRMED good |
| S10 | No wildcard CORS. All Nest apps use configured origin lists, and FastAPI uses `EXECUTION_CORS_ORIGINS`. | `apps/playground-api/src/main.ts:25-30`; modules `main.ts` `enableCors({origin: listener.corsOrigins})` | — | CONFIRMED good |
| S11 | `STORAGE_ALLOW_INSECURE: "true"` and `COOKIE_SECURE: "false"` are hard-coded in the only compose profile | `infra/compose/compose.yaml:68,132` | P2 (no production profile overrides them) | CONFIRMED |
| S12 | Control plane auto-loads `.env` and `../../.env` from the CWD at boot | `apps/playground-api/src/main.ts:4-9` | P3 | CONFIRMED |
| S13 | Public, unauthenticated governor endpoints accept an arbitrary `tenantId` and mutate in-memory buckets. They are not used for enforcement. | `apps/playground-api/src/governor.controller.ts:27-60` | P3 | CONFIRMED |
| S14 | Refresh cookie scoped to `/` and sent to every path | `lib/control-plane.ts:79-86` | P3 | CONFIRMED |

---

## 3. Running runtime vs repository

### 3.1 Containers (`docker ps -a`, project `gigalibs-configuration-local`)

| Service | Image tag | State | `org.opencontainers.image.revision` / source-state |
|---|---|---|---|
| web | `gigalibs/workflow-platform:007e686bebee-c1746f0b541b` (`sha256:c01a6a63…`) | Up 9h healthy (created 2026-10-04T07:06:29Z) | `007e686bebee…` / `c1746f0b541b…` |
| api (control plane) | `playground-api:007e686…` (`sha256:c20c3050…`) | Up healthy | same |
| kernel-worker | `playground-api:007e686…` | Up healthy | same |
| analytics-api | `analytics-api:007e686…` (`sha256:46ad1ad0…`) | Up healthy | same |
| connector-hub-api | `connector-hub-api:007e686…` | Up healthy | same |
| geospatial-api | `geospatial-api:007e686…` | Up healthy | same |
| module-host (catalogue, inventory, orders, procurement) | `module-host:007e686…` (`sha256:11eda541…`) | Up healthy | same |
| **cmms-api** | `cmms-api:007e686…` | **Created, never started** (StartedAt 0001-01-01) | — |
| **cmms-migrations** | same | **Exited (1)** 07:06:35Z | — |
| **workforce-api** | `workforce-api:007e686…` | **Created, never started** | — |
| **workforce-migrations** | same | **Exited (1)** 07:06:35Z | — |
| control-plane migrations, analytics, hub, geospatial, catalogue, inventory, orders, procurement migrations | various | Exited (0) | — |
| Postgres `gigalibs-postgres` (16-alpine, project `gigalibs-dev`, created 2026-08-30) | `postgres:16-alpine` | Up 6 days | Port 5440 on 0.0.0.0 |

### 3.2 Mapping to commits (P1, CONFIRMED)

- `.pi/NOW.md:9` claims the stack runs `3da222030dc2-a0ca08f61655`. It actually runs `007e686bebee-c1746f0b541b` (built 2026-10-04 12:27-12:35 IST, started 07:06Z). NOW.md is stale.
- `007e686` (2026-10-04 08:47 +0530) is an ancestor of HEAD, with **14 commits not deployed** (`git log 007e686..HEAD`), including WI-OI-113 handshake and every finance phase (WI-OI-094, 095, 114-118).
- **The running images match no commit.** Source-state `c1746f0b…` is a dirty-tree hash: `scripts/compute-source-state-sha256.mjs` hashes `git ls-files -co` (tracked plus untracked), and the Dockerfile uses `COPY . .`. Proof: the running module-host env has `UNIVERSAL_INVENTORY/ORDERS/PROCUREMENT_EXPECTED_MIGRATION_VERSION=2` (docker inspect), while `git show 007e686:infra/compose/generated/modules.json` says version 1. The migration `000002_*_outbox_inbox_relay` files were first committed in `e532d98` at 12:43:56 +0530, **after** the 12:36 IST deploy.
- **No image exists for HEAD** (`docker images` shows no tag for `76b9452`, `10bbfba` or any finance commit).
- Generated files were stale at a committed state: at `e532d98`, `modules/universal-inventory/db/runtime-manifest.txt` lists `000002`, but `infra/compose/generated/modules.json` says `migrationVersion: 1` (`git show e532d98:…`). `module-manifests --check` would have failed at that commit (P2).

### 3.3 Registered modules without a running service or image

| Module | Compose defines it? | Image present? | Note |
|---|---|---|---|
| financial-operations | Yes (`generated/compose.module-host.yaml:5-16,163-167`) | No (not in running module-host env; no `.env.module.financial-operations`) | 7 phases "complete" in NOW.md, but nothing is deployed |
| physical-operations-cmms, gigaops | Yes | Yes | Down (migrations exit 1) |
| accounts-receivable | Own `modules/accounts-receivable/deploy/compose/compose.yaml` only | No | — |
| spend-management, tax-configuration, multi-currency, esignature, autonomous-recovery-studio, universal-data-studio, universal-rule-pro, workflow-studio, ontology, saga-orchestrator, document-scanner, communications | **No** service in any `infra/compose/*.yaml` (only empty `*_API_URL` web env at `compose.yaml:136-148`) | No | — |

### 3.4 HEAD is not buildable or deployable from git (P1, CONFIRMED)

1. `infra/compose/docker/Dockerfile:26-27` COPYs `packages/db-migrations-runtime/control-migration-policy.mjs` and `run-control-migrations.mjs`. Both are **untracked** (`git status` shows `??`; `git ls-files packages/db-migrations-runtime` lists only `package.json` and `prisma.config.mjs`). The lines were introduced in `2f18945`. `packages/db/package.json:24` (`db:migrate`) also points at the untracked runner, and `Dockerfile:171` CMD uses it. A clean checkout cannot build the migrations image.
2. Untracked control-plane migrations `packages/db/migrations/20260923590000_tp2_cancelled_enum_predecessor/` and `20261002000000_database_extensions_foundation/` (created 2026-10-02 15:25/15:29) sit inside the directory `Dockerfile:37` copies. The 2026-10-04 migrations image was built from that working tree, so it contained them. Whether they were applied to the live DB is PLAUSIBLE; this audit cannot connect to the DB to check.
3. **Finance version drift:** `modules/financial-operations/db/runtime-manifest.txt` lists 000001-000006 and omits `000007_finance_period_close_accruals_forecasting.up.sql`, so 000007 is never copied into the image. The generated compose sets `FINANCIAL_OPERATIONS_EXPECTED_MIGRATION_VERSION: "6"` (`generated/compose.module-host.yaml:165`, plus `MODULE_EXPECTED_MIGRATION_VERSION "6"` at :18). The code declares `SCHEMA_CONTRACT_VERSION = 7` (`modules/financial-operations/apps/api/src/config.ts:9`). `loadModuleRuntimeConfig` parses that variable with min = max = 7 and throws (`packages/module-sdk/src/module-runtime-config.ts:43-47,115-120`). The module-host at HEAD would therefore fail to construct the finance module, which takes down every hosted module in that process. PLAUSIBLE at runtime; CONFIRMED in code. `pnpm verify` stays green because nothing ties `config.ts` to `runtime-manifest.txt`.
4. Migration 000007 was **applied by hand** to the live DB on port 5440, outside the migration runner (`.pi/work/WI-OI-118.md:30` "Applied `000007…` to `gigalibs_finance`"; no finance migration container exists in `docker ps -a`). This repeats the "D2 lesson" that `.pi/NOW.md` itself warns about.

### 3.5 Deployment profiles

`config/deployment-profiles/*.json` (4 files, last changed `bfc4c66` 2026-09-30) are all `*-local-development-v1`. **None mentions
`module-host`, financial-operations, product-catalogue, universal-inventory, universal-orders or universal-procurement** (Python
count = 0 for each). The running module-host carries label `profile-key=module-runtime-local-development-v1`, a profile that does
not define it. No staging or production profile exists. The `verify` step `deployment profile` reports the known
`WORKFORCE_API_URL` drift (`scripts/verify.mjs:13,27-31`).

### 3.6 Helm (the only non-local deployment artifact) is unusable (P1, CONFIRMED)

`infra/helm/workflow-platform/values.yaml:2-17`: tags `1.0.0`, `digest: ""`, registry `ghcr.io/gigalibs/*` (no push evidence).
In `templates/web.yaml`, the env sets `CONTROL_PLANE_URL` where the code reads `CONTROL_PLANE_API_URL` (`lib/control-plane.ts:20-22`) and sets
unused `NEXTAUTH_*`. It omits `BFF_MAX_REQUEST_BYTES`, which `authenticated-upstream.ts:25-35` requires, so every write would throw, and omits `COOKIE_SECURE`.
It passes a single `PLATFORM_CONTEXT_PRIVATE_KEY` where the code needs per-module `*_BASE64` keys, and uses port 3000 where the app uses 5180. The API template lacks
`JWT_ACCESS_EXPIRES_IN`, `OBSERVABILITY_METRICS_TOKEN`, `CONTROL_PAYLOAD_ENCRYPTION_KEY`, `CORS_ORIGINS` and others required at `compose.yaml:36-89`.
The chart defines no module services, module-host or kernel-worker. Last change `ece9a1c` 2026-09-28.

---

## 4. Deliverable K: Observability, SLO, runbook, backup and restore matrix

### 4.1 Platform

| Control | State | Evidence | Sev |
|---|---|---|---|
| Structured logging | Control plane uses pino (`packages/logger/package.json:26`, redact at `src/logger.ts:29`). Modules use the default Nest text `Logger`/console (no `useLogger` in any module `main.ts`). | `git grep useLogger` → only playground-api | P2 |
| Metrics | A Prometheus endpoint exists **only** on the control plane (`apps/playground-api/src/metrics.service.ts`, `platform.controller.ts`, token guard `metrics-token.guard.ts`). There is none on module-host, any module, the web or the kernel-worker. | `git grep -l 'prom-client\|# HELP'` → 2 files | P2 |
| Traces | **None.** OpenTelemetry appears only in the parked `apps/workflow-api/requirements.txt`. | `git grep -l opentelemetry` | P2 |
| Correlation | `X-Correlation-Id` is generated or forwarded by the BFF (`signed-module-proxy.ts:110`) and the SDK `CommandContext` (`signed-context.ts:88-97,217-220`). The control plane uses `correlationMiddleware` (`main.ts:22`). | — | partial, OK |
| Alerts | `infra/prometheus/alerts.yml:4-148` has 14 rules for the control plane, Configuration Studio and the **parked** execution plane. Nothing covers modules, module-host, relays/DLQ, the web, Postgres, Redis, backups or certificate expiry. There is no Alertmanager or receiver config, and no Prometheus or Grafana container runs. | `git grep -n alertmanager infra` → none; `docker ps` | P2 |
| SLOs | No SLO or error-budget definitions file. WI-OI-007 itself says traces, SLO and load evidence are missing (`.pi/work/WI-OI-007.md:30-31,105-109`), yet `.pi/WORK_ITEMS.md:15` claims "Prometheus alerts pass; traces and SLO evidence in .pi/work/WI-OI-007.md". | contradiction | P1 (claim without evidence) |
| Health / readiness | Web `/api/health/live` and `/api/health/ready`; API `/api/v1/ready`; module-host readiness aggregates hosted modules (`apps/module-host/src/host.spec.ts:13-33`). Every module has a HealthController. | compose healthchecks `compose.yaml:97-106,154-163` | OK |
| DLQ / queue monitoring | Module outbox/inbox relays dead-letter without alerts. `.pi/NOW.md` notes 980 place facts dead-lettered during WI-OI-105, with replay still an open decision. | `alerts.yml` has no relay rule | P2 |
| On-call / support | None: no Alertmanager, PagerDuty or escalation docs. `.github/CODEOWNERS:1` names one person ("Temporary… add independent finance, security, data, and release teams before G4"). | `git grep -il 'on-call\|pagerduty\|alertmanager' docs infra config` → only generic docs | P1 (G6 requires it) |
| Runbooks | 11 files in `docs/runbooks/` (control-plane metrics, config studio, DR, SSO/residency, …). There is **no** runbook for module-host, any business module, relay/DLQ replay, platform-context key rotation, finance period-close recovery or session revocation. | `ls docs/runbooks` | P2 |

### 4.2 Backup, restore and PITR

| Item | State | Evidence | Sev |
|---|---|---|---|
| Engine | PostgreSQL 16 (`postgres:16-alpine`, `gigalibs-postgres`) | docker inspect | — |
| Latest backup | `infra/compose/backups/gigalibs_backup_20261004_061720Z.dump`: 6,278,571 B, `custom-fc`, sha256 `17058f28…`, **tagged release `…3da222030dc2-a0ca08f61655`**, so it predates the current deploy identity | `.json` sidecar | — |
| Backup storage | Same host and disk (108 MB, 77 files, gitignored). No off-host vault. **Not encrypted** (`backup.sh:54` is plain `pg_dump -Fc -Z 6`), although WI-OI-006 AC3 requires an encrypted archive. | `infra/compose/scripts/backup.sh:54` | P1 |
| WAL / PITR | **None.** Postgres runs default `["postgres"]`; no `archive_mode` or `archive_command` anywhere. The DR runbook claims "Target RPO < 1 minute (via WAL archiving)" (`docs/runbooks/database-disaster-recovery.md:5`) and concedes at `:42,53-57` that WAL/PITR is unproven. | docker inspect Cmd; `git grep archive_command` → none | **P0** (with the next row) |
| Last restore rehearsal | Local `verify-local-restore` on **2026-09-24T15:22:54Z**: control DB at **37** migrations, configuration tables only (`infra/compose/evidence/wi-oi-046-tp1-20260924T131638Z/restore.json`, gitignored, uncommitted). Committed evidence is only `docs/audits/2026-09-09-readiness/evidence/uat/postgresql16-backup-restore-result.json` (2026-09-15, 35 migrations, 420 KB). Today the control DB has **51** tracked plus 2 untracked migrations and module schemas (finance v7, inventory/orders/procurement v2, catalogue v1, analytics 29, …) that have **never been restored**. | file reads | **P0** |
| Scale | Largest proven restore is about 6 MB, single host. No representative-volume, failover or host-loss drill. | — | P1 |
| Evidence folders | `infra/compose/evidence/` is **gitignored** (`.gitignore:56`). The latest folder is `wi-oi-082-20260928T075902Z`. Nothing after 2026-09-28 covers module-host, finance, inventory, orders or procurement. | `git check-ignore -v` | P1 |

### 4.3 Per-module observability

Metrics: only the control plane exposes Prometheus. Analytics, spend and recovery "metrics" hits are business APIs. OTel: none anywhere.

| Module | Health | Prom metrics | Structured log | Correlation | Alerts | Runbook | DLQ visibility |
|---|---|---|---|---|---|---|---|
| analytics-studio | Yes | No | No (Nest Logger) | Yes | No | No | relay code, no alert |
| geospatial | Yes | No | No | Yes | No | No | No |
| universal-connector-hub | Yes | No | No | Yes | No | No | relay code, no alert |
| gigaops | Yes | No | No | Yes | No | No | relay code, no alert |
| physical-operations-cmms | Yes | No | No | Yes | No | No | No |
| module-host (finance, catalogue, inventory, orders, procurement) | Yes (aggregate) | No | No | catalogue/inventory/finance only; orders/procurement 0 refs | No | No | outbox/inbox tables, no alert |
| 13 legacy/prototype modules | Yes | No | No | partial | No | No | No |

---

## 5. Supply chain and release gates (G5-G7)

| Gate item (SDLC guide `docs/SDLC_DEVELOPMENT_GUIDE.md:61-82`) | Evidence found | Status |
|---|---|---|
| CI build and test | `.github/workflows/repository-governance.yml` runs only 6 `node scripts/verify-*.mjs` audits on Node 22. It does no build, no test, no lint, no typecheck. | **Unmet** |
| Secret scan | None in CI (no gitleaks or trufflehog config) | **Unmet** |
| SAST | None (Biome lint is not run in CI) | **Unmet** |
| Dependency audit | Dependabot only (`.github/dependabot.yml`); no `pnpm audit` / OSV step | **Unmet** |
| Container scan | Trivy JSON for `5abfa667bb10-*` images only (`docs/audits/2026-09-24-wi-oi-042-replacement-evidence/vulnerability/{api,web,migrations}-trivy.json`, 15-17 MEDIUM + 7 LOW each, no risk acceptance; `2026-09-25-wi-oi-060…/workforce-api-trivy.json`). **No scan of the running `007e686` images, module-host, analytics, hub, geospatial or cmms, or of HEAD.** | **Unmet** |
| IaC scan | None (no checkov or tfsec) | **Unmet** |
| SBOM | CycloneDX for the same 2026-09-24/25 images only (`…/sbom/*.json`) | **Unmet for current code** |
| Provenance / signing | None. Commits unsigned (`git log -1 --format=%G?` → `N`). No cosign or attestations. Local image IDs exist, but there is no registry digest, and the Helm digest is `""`. | **Unmet** |
| Base image pinning | Positive: base images are digest-pinned (`infra/compose/docker/Dockerfile:6` `node:24-bookworm-slim@sha256:0e0ff40c…`, `:125` distroless `nodejs24@sha256:bb6b03d8…`). Images are non-root and read-only in compose (`compose.yaml:10,33,123`). | Met (partial) |
| Immutable artifact for HEAD | **None.** No image built from `76b9452` or any finance commit. The running images were built from an uncommitted tree. | **Unmet** |
| Code reached CI at all | Branch has **no upstream** (`git rev-parse @{u}` → fatal). Local `origin/master` and `origin/dev` = `f874df4` (2026-09-04), and `git rev-list --count origin/master..HEAD` = **145**. By local refs, CI has never run on any audited commit. Remote state is PLAUSIBLE (no fetch was allowed). | **Unmet** |
| WI-OI-008 claim | `.pi/WORK_ITEMS.md:16` says "CI secret/SAST/dependency/container/IaC/SBOM/provenance gates pass". `.pi/work/WI-OI-008.md` (26 lines) is a scope and acceptance spec with **no command, digest, timestamp or result**. | **False claim (P1)** |
| Migration rehearsal | Finance 000007 hand-applied (§3.4). CMMS and Workforce migrations failed on the last deploy. No rehearsal from the previous release to HEAD. | **Unmet** |
| Rollout / halt / recovery plan, canary, cohort | Only plan docs (`docs/plans/universal-configuration-studio-production-rollout.md`, `value-first-all-module-release-program.md`). No halt criteria executed, no canary environment, no production profile. | **Unmet** |
| Known-issue approval | None recorded | **Unmet** |
| Support / on-call activation | None (§4.1) | **Unmet** |
| Named human release authority | **None.** Reviewers are AI agent roles (`config/sdlc-governance.json` `importedAgents` = 18). CODEOWNERS has a single temporary owner. Owner approvals in `.pi/tasks/WI-OI-102e.md:3`, `102f.md:3`, `105.md:3`, `107.md:3` and `WI-WFO-001/002` accept **scope or plan decisions only**, not release, security, DR or supply-chain evidence. `.pi/work/WI-OI-007.md:105-109` states: "No agent has supplied the required human product or release acceptance". | **Unmet (P1)** |
| WI-OI-003 independent verification | `.pi/work/WI-OI-003.md` cites "37 TypeScript unit tests + 4 Python tests", covers "Release 1 Core AP" with the parked `apps/workflow-api`, and does not cover the current module set | Stale, so **unmet** |
| WI-OI-005 threat model | `docs/architecture/THREAT_MODEL_AND_PERMISSIONS.md` is 35 lines, last commit `7867251` 2026-09-04. It has **0 mentions** of platform context, Ed25519, module-host, finance, inventory, procurement, CSRF, CSP, revocation or the kernel worker. | Stale (P1) |
| WI-OI-006 DR | `.pi/work/WI-OI-006.md` is a spec only; see §4.2 | **Unmet (P0 / P1)** |
| WI-OI-009 accessibility, WI-OI-010 performance | `.pi/work/WI-OI-009.md` and `WI-OI-010.md` are specs only (outcome, scope, AC; no results). WORK_ITEMS rows 17-18 claim "pass". | **Unmet (P1)** |
| G7 production observation | No production environment exists | N/A, unmet |

**Gates for the platform as a whole:** G5 is not met. There are open P0 and P1 items, negative tests are missing for the
new modules, the DR, a11y and performance evidence is absent, and no human Product Owner has accepted the integrated journey.
G6 is not met: there is no frozen source (untracked files are required to build), no SBOM or provenance for current code,
no immutable artifact, no migration rehearsal, no rollout or halt plan, no on-call, and no named release authority.
G7 is not met and does not yet apply.

---

## 6. WI-OI-013 control table (FR-14; WORK_ITEMS row 21 says Blocked/No-Go, while `.pi/work/WI-OI-013.md:3` still says "In Progress")

| Control | State | Evidence |
|---|---|---|
| OIDC (Authorization Code + PKCE) | **Implemented-locally**; real-IdP interop is **Blocked-external** | `packages/auth-nest/src/oidc.service.ts`; `auth.controller.ts:139-215`; `.pi/work/WI-OI-013.md:334` |
| External identity link / unlink / deprovision | **Implemented-locally** | migration `packages/db/migrations/20260911000000_external_identity_lifecycle`; `auth.controller.ts:175-205`; `.pi/work/WI-OI-013.md:103-158` |
| SCIM | **Partially.** A control-plane `scim.controller.ts` exists, but the BFF route is disabled (`app/api/scim/v2/Users/route.ts:1-6` uses `unavailableCapability`). Provider interop is Blocked-external. | — |
| SAML | **Missing** (no SAML code; only a string in `lib/module-knowledge-registry.ts`) | `git grep -il saml` |
| WebAuthn / passkeys | **Missing** (only catalogue/error strings) | `git grep -il webauthn` |
| Profile / password / recovery | **Implemented-locally** (profile, change and reset password, MFA TOTP with lockout, recovery codes, assisted recovery) | `auth.controller.ts:78-368`; `auth.service.ts:638-663` |
| Session / device lifecycle | **Partially.** Logout, refresh rotation and server-side revocation on suspension exist. There is **no** list or revoke for own sessions or devices, and **no password-login throttling**. 721 sessions remain active (`.pi/NOW.md`, open decisions). | route list `auth.controller.ts:78-368` |
| Tenant membership / suspension / last-owner protection | **Implemented-locally** (last active TENANT_ADMIN protection) | `packages/tenancy-nest/src/tenancy.service.ts:~1023-1036`; `tenant-boundary.guard.ts:74-82` |
| Plan / trial / entitlement lifecycle | **Implemented-locally.** Trial expiry is enforced server-side; entitlements are checked in the BFF and in the signed claim. **Payment conversion is missing** (`.pi/work/WI-OI-013.md:30-33`). | `tenant-boundary.guard.ts:78-79`; `platform-context.ts:197-200` |
| DNS / TLS | **Blocked-external.** Subdomains stay `RESERVED` until DNS/TLS evidence exists (`.pi/work/WI-OI-013.md:24-25`); tenant domain verification is local (`packages/tenancy-nest/src/domain-verification.ts`). | — |
| Regional isolation / residency | **Blocked-external.** Isolation binding stays `REQUESTED` until a worker receipt arrives (`platform-administration.service.ts:389-430,649-668`; `.pi/work/WI-OI-013.md:22-24`). | — |
| Secrets / key rotation | **Partially.** Control-payload key rotation is implemented (`CONTROL_PAYLOAD_PREVIOUS_KEYS_JSON`, `compose.yaml:78`; `.pi/work/WI-OI-013.md:394`). **Missing** for platform-context Ed25519 keys (no kid or multi-key), JWT secret, relay keys and metrics token (rotation means a restart, per `docs/runbooks/control-plane-metrics.md:14`). | — |
| PostgreSQL 16 PITR / backup / restore / failover | **Missing / Blocked.** Logical dump and a restore on 09-15 and 09-24 only; no WAL, PITR or failover; current schema never restored (§4.2). | — |
| Destructive tenant lifecycle UAT (cancel, purge, export, erasure) | **Partially.** CANCELLED is terminal with a separate restoration requirement (`platform-administration.service.ts:484-540`), and a signed tenant export exists (`tenant-data-export.*`). **No purge or erasure path and no UAT evidence.** | `git grep deleteTenant\|purgeTenant` → none |
| Named independent reviews | **Missing** (§5) | — |

---

## 7. Findings register (deduplicated)

**P0**
1. `universal-data-studio`, `universal-rule-pro` and `workflow-studio` APIs have no authentication. The tenant comes from caller `x-tenant-id`, body or query, so the context is forgeable and RLS is keyed off the same untrusted value. Evidence: `modules/workflow-studio/apps/api/src/execution/execution.controller.ts:8-23`; `modules/universal-rule-pro/apps/api/src/evaluator/evaluator.controller.ts:11-17`; `modules/universal-data-studio/apps/api/src/lineage/lineage.controller.ts:8-18`. CONFIRMED in code. Exposure is PLAUSIBLE (not deployed now; rule-pro and workflow-studio are catalog REVIEW).
2. No restore has ever been proven for the release database schema, and PITR does not exist. The last restore was 2026-09-24 at 37 control migrations; now there are 51+2 plus module schemas (finance v7 and others) never restored. No WAL. Backups are unencrypted on the same disk. Evidence: `infra/compose/evidence/wi-oi-046-tp1-20260924T131638Z/restore.json`; `backup.sh:54`; `database-disaster-recovery.md:5,42,53-57`. CONFIRMED.

**P1**
1. Running artifact ≠ any commit (dirty-tree build; migration 2 deployed before `e532d98`); 14 commits undeployed; NOW.md stale (§3.2).
2. CMMS and Workforce are down: migrations exited 1 at 07:06:35Z and the APIs never started (`docker ps -a`, inspect).
3. HEAD cannot build: `Dockerfile:26-27` and `packages/db/package.json:24` need untracked files, and untracked migrations get swept into images (§3.4).
4. Finance runtime-manifest, compose and config version drift (6 vs 7) makes module-host boot fail at HEAD; migration 000007 was hand-applied (§3.4). `pnpm verify` is green regardless.
5. The verify gate plants a persistent LOGIN role with a hard-coded password and GRANT ALL on `gigalibs_finance` (S2); Postgres listens on 0.0.0.0 (S4).
6. Finance `org_replica_*` tables have no RLS (`000001…:21-59` vs `:418-429`); the parity test omits finance (`packages/module-sdk/src/organization-replica.test.ts:9-12`).
7. The five new hosted modules have no module or API negative security tests; inventory, orders and procurement have 0 test files; no BFF gateway tests (§1.3).
8. Organization scope is signed but not enforced in orders, procurement and most of finance (§1.2).
9. Password login has no lockout or rate limit; throttle guards are never applied (§1.1).
10. WI-OI-008 claims passing CI security gates, but CI runs governance scripts only and the evidence file has no results (§5).
11. WI-OI-003/005/006/007/009/010 status claims rest on specs or stale evidence; the threat model is 35 lines dated 2026-09-04 (§5).
12. No named human reviewer or release authority (CODEOWNERS single temporary owner; reviewers are AI roles).
13. No production deployment artifact: Helm broken or stale, all profiles local, module-host absent from profiles (§3.5, §3.6).
14. No container scan or SBOM for running or HEAD images; MEDIUM findings unaccepted; no signing; branch never pushed (145 commits ahead of last-known origin).
15. Infra evidence is gitignored and nothing is newer than 2026-09-28; there is no on-call or alert routing (§4).

**P2:** platform-context rotation, key concentration and replay (§1.1); module revocation table never written; no CSP or security headers on the web; control-plane BFF writes lack an Origin check; Secure cookie off and no production override; module observability absent (metrics, traces, logs, alerts, SLO, DLQ); runbook gaps; legacy modules depend on a dev OIDC issuer refused in production (no production auth path); live third-party credentials in untracked `.env`/`.env.bak` (S7); PUT/DELETE gateway routes unreachable (§1.4); no session or device management; stale generated files at `e532d98`; `communications` BFF forwards a raw tenant header.

**P3:** concrete dev passwords in two `.env.example` files; hard-coded fallback owner DB URL in seven verify scripts; public governor endpoints; `.env` auto-load in the control plane; CI Node 22 vs runtime Node 24 (`node:24-bookworm-slim`, distroless nodejs24); refresh cookie path `/`.
