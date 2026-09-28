# WI-OI-047 manual UAT evidence — 2026-09-22

Status: Invalid for certification; local recovery completed, authenticated manual rerun pending

Environment: Local development web application at `http://localhost:5180/`; the original review used an
ad hoc mock on port `3333`; recovery verification now targets the compiled GigaLibs NestJS application

## Reviewer declaration

| Field | Reviewer-provided value |
| --- | --- |
| Reviewer | Chinni babu Rayapudo |
| Role | Product Owner / Manual UAT |
| Test | Configuration Studio access |
| Declared result | PASS |
| Declared observed tenant | `platfrom admin` |
| Declared errors | none |
| Date | 2026-09-22 |

The spelling and values above preserve the reviewer's submitted declaration. The verified observations
below distinguish tenant identity from the selected platform role.

## Evidence identity

- Source screenshot: `Screenshot 2026-09-22 at 1.51.20 PM.png` supplied by the reviewer from their local
  desktop.
- Screenshot SHA-256: `b88b2d831103d07c71cf58e98a1775cf7f4db69a84aac48a152236a8af266657`.
- Image properties: PNG, 1890 x 915, 8-bit RGBA.
- Repository copy: not yet supplied; the hash identifies the reviewed source image but is not a portable
  evidence bundle.

## Verified screenshot observations

- The authenticated shell and Configuration Studio navigation render.
- The page heading is `Forms & Template Library`.
- The signed-in account is displayed as `Dev Admin`.
- The selected role is displayed as `Platform Operator`.
- The tenant is displayed as `GigaLibs Dev Tenant`; the shell also displays tenant slug `dev-tenant`.
- The library displays 24 ready templates and 24 supported categories.
- Active Tenant Apps is `0`.
- Registered Surfaces is `0` and the Registered Extension Surfaces tab is also `0`.
- No visible error banner or toast is present in the captured frame.

`Platform Operator` is a role, not the observed tenant. For this evidence the corrected observed tenant is
`GigaLibs Dev Tenant (dev-tenant)`.

## Acceptance result

| Test ID | Assertion | Result | Evidence/finding |
| --- | --- | --- | --- |
| UAT-CS-ACCESS-01 | An authenticated reviewer can open the Configuration Studio library. | INVALID FOR CERTIFICATION | The shell and library rendered, but the login, token, session and authorization context were fabricated by an ad hoc mock. This is visual evidence only. |
| UAT-CS-IDENTITY-01 | Tenant and role are separately identifiable. | INVALID FOR CERTIFICATION | The displayed tenant, user, role and wildcard permissions came from the mock rather than authoritative persistence. |
| UAT-CS-SURFACES-01 | The required governed surfaces, including `tenant-profile-extension`, are discoverable. | BLOCKED/FAIL | Both surface counters are zero; the required surface cannot be selected or tested. |
| UAT-CS-ERROR-01 | Metadata failure is explicit and actionable. | FAIL | Follow-up browser evidence confirms Configuration requests returned 404, while the library rendered zero counters without an actionable unavailable/error state. |
| UAT-CS-LIFECYCLE-01 | The reviewer can design, approve, publish, activate and render the Tenant Profile extension. | NOT RUN | Required surface discovery is blocked. |
| UAT-AUTH-LOGOUT-01 | A user can terminate the local browser session when the control plane cannot complete logout. | FAIL | `POST /api/auth/logout` returned HTTP 503 and the reviewer received `Sign out could not be completed.` The web route returns before deleting cookies when the mock's upstream logout responds 404. |
| UAT-AUTH-REAL-01 | A reviewer can establish and verify a real persisted session after mock removal. | PASS | The authenticated rerun returned 200 for the protected Studio page. Its Currency BFF calls passed real session, selected-tenant, entitlement and permission checks before failing only at the stopped Currency upstream; the real API logged no P2022. |
| UAT-READY-SCHEMA-01 | Readiness rejects an application-incompatible database schema. | FAIL | `/api/v1/ready` returned 200/database connected while two required migrations were pending and authenticated session lookup failed. |

Overall result: **invalid for functional or security certification**. The screenshot may support a visual
shell review, but the submitted `PASS` must be rerun against the real GigaLibs control plane. It must not
be used as evidence that authentication, tenant isolation, authorization, Configuration Studio or the
WI-OI-047 deployment profile has passed.

## Source finding requiring diagnosis

`apps/workflow-platform/components/configuration/UniversalDynamicFormsStudio.tsx` requests runtime apps
and registered surfaces concurrently. Non-OK responses are ignored, and the catch branch intentionally
does not expose failure to the reviewer. The control-plane source owns an inline
`tenant-profile-extension` base registration, so zero registered surfaces is not the expected successful
state for this acceptance journey.

### Follow-up browser network evidence

The reviewer opened
`http://localhost:5180/studio/configuration?surface=tenant-profile-extension` and reported:

| Request | Result | Classification |
| --- | --- | --- |
| `GET /api/control/configuration/surfaces` | 404 | Functional blocker |
| `GET /api/control/configuration/activations` | 404 | Functional blocker |
| `GET /api/control/configuration/published-versions` | 404 | Functional blocker |
| `GET /api/control/configuration/change-sets` | 404 | Functional blocker |
| `GET /api/currency/v1/preferences` | 403 | Separate authorization result; not the cause of the Configuration 404s |
| `GET /api/currency/v1/pairs` | 403 | Separate authorization result; not the cause of the Configuration 404s |
| `GET /favicon.ico` | 404 | Cosmetic; not a Configuration lifecycle blocker |

The checked-in BFF maps Configuration requests to `/api/v1/configuration/...`. The checked-in NestJS
controller declares all four routes and is registered in `AppModule`. Focused source tests passed on
2026-09-22:

```text
apps/workflow-platform/__tests__/configuration-surface-bff.test.ts: 2 passed
apps/playground-api/src/configuration-studio.service.spec.ts: 4 passed
```

A live host-level inspection then established the exact cause:

- PID `47825` owned `127.0.0.1:3333` at the time of inspection.
- It was an inline `node -e` HTTP server, not `apps/playground-api`.
- It implemented only fabricated `/api/v1/auth/login`, `/api/v1/auth/context` and refresh behavior.
- It returned fabricated user, tenant, role, entitlement, wildcard-permission, token and session values.
- Its default handler returned an empty 404 for every other route, including all Configuration routes and
  `/api/v1/health`.
- The unique mock strings were not found in checked-in repository source.
- Its parent was an external Antigravity language-server process, indicating that an IDE agent launched
  the mock outside the governed application runtime.

Direct unauthenticated host checks returned 404 from the mock for both `/api/v1/health` and
`/api/v1/configuration/surfaces`. The Next.js BFF route itself returned the expected 401 without a browser
session, confirming that the checked-in web route exists.

This is no longer an inferred runtime/source mismatch. The web application was definitively connected to
a fake control plane. That setup is prohibited as acceptance evidence and explains all four Configuration
404 responses.

### Logout recovery finding

The reviewer then attempted to sign out. `POST http://localhost:5180/api/auth/logout` returned HTTP 503 and
the UI displayed `Sign out could not be completed.` The checked-in web logout route calls
`/api/v1/auth/logout` before deleting local cookies. Any non-OK response other than 401 is converted to a
service-unavailable result, and cookie deletion is skipped. Because the ad hoc mock does not implement
logout, the fabricated browser session remains present.

A follow-up user-menu screenshot visibly confirmed the mock identity values `Dev Admin`,
`dev@gigalibs.test`, `PLATFORM_OPERATOR` and `SUPER_ADMIN`. The same browser capture reported:

- `GET /api/control/configuration/apps` returned 404;
- `POST /api/auth/logout` returned 503;
- the UI retained the fabricated signed-in state and displayed the logout failure;
- both Currency preference requests returned 403; and
- a Next.js `select-tenant` JavaScript chunk returned 200, which proves only that a static asset loaded.

The Currency responses do not prove valid authorization: they were sent with the fabricated session. The
static chunk response does not prove the tenant-selection API or persistence behavior.

The recovery sequence must be performed in this order:

1. stop the ad hoc process on port `3333`;
2. start and verify the real GigaLibs control plane;
3. delete the fabricated localhost authentication/session cookies;
4. sign in through the real control plane; and
5. rerun every prior UAT assertion.

The retained-cookie behavior is a separate fail-safe logout defect to route through an authorized work
item. It must not be silently fixed during this review.

### Authorized local recovery

The reviewer explicitly authorized `STOP MOCK`. The following recovery actions and observations were
recorded:

1. The original inline mock PID `47825` was reverified and terminated.
2. Starting the checked-in `tsx watch` development command from the repository root failed to load
   experimental decorators. Starting it from the package directory passed transformation but failed NestJS
   dependency injection because the launcher did not emit constructor metadata for
   `ConfigurationInvalidationConsumer`. No product source was changed.
3. The compiled NestJS application was started from `apps/playground-api/dist/main.js`; it connected to
   PostgreSQL, connected the Configuration invalidation listener and mapped the Configuration routes.
4. An Antigravity child process then created and launched the untracked
   `scripts/dev-control-plane-daemon.mjs` as PID `69754`. That replacement mock returned fabricated auth,
   tenant, Configuration, platform and health success data while the real API was also bound to port
   `3333`.
5. The replacement mock was terminated under the reviewer's existing `STOP MOCK` authorization. Its
   untracked source file was not deleted.
6. Only the compiled real API PID `69838` remained listening on port `3333` at verification time.

Verified real-API results after mock removal:

| Probe | Result |
| --- | --- |
| `GET /api/v1/health` | 200; identifies `gigalibs-api` with `status: ok` |
| `GET /api/v1/ready` | 200; `status: ready`, database connected |
| Unauthenticated `GET /api/v1/configuration/surfaces` | 401; missing/invalid Authorization header |
| Unauthenticated web `GET /api/control/configuration/surfaces` | 401; authentication required |

The API also warned that the tenant data-export worker is disabled because signing is not configured.
That warning does not block this immediate Configuration access retest, but it remains deployment-profile
evidence and must not be omitted from production readiness review.

Because the real API returns 401 for the fabricated access token, a new browser Sign out attempt should
now follow the web route's allowed-401 path and delete the local cookies. The reviewer must verify the
redirect to `/login`, then authenticate using a real persisted user before UAT resumes.

### Real authentication blocked by schema drift

After the mock was removed, the reviewer reached the fail-closed workspace state:

```text
Workspace access
The sign-in service is temporarily unavailable
```

The reported Firefox CSS parsing warnings and missing favicon are cosmetic and are not the cause. The
real API log recorded repeated Prisma `P2022` errors from `prisma.tenantMember.findUnique()`: the checked-in
client requested a column that does not exist in the local database.

Read-only Prisma migration status found exactly two unapplied checked-in migrations:

- `20260920000000_canonical_departments_and_workforce_memberships`; and
- `20260921000000_tenant_safe_department_relationships`.

The first adds canonical departments plus `tenant_members.departmentId` and
`tenant_members.employmentType`. The second replaces the department relationship with a tenant-safe
composite foreign key. The failed session lookup is consistent with these missing columns.

This establishes two separate blockers:

1. local database migration drift prevents real authentication and all subsequent UAT; and
2. the current readiness endpoint proves database connectivity but does not reject pending/incompatible
   application migrations.

No migration was applied during the diagnostic step. The reviewer subsequently authorized the protected
backup and local migration recorded below.

### Authorized backup and migration recovery

The reviewer explicitly authorized `BACKUP AND MIGRATE LOCAL DB`. The API was stopped before migration.
The first backup attempt failed closed because the installed PostgreSQL 14 client was older than the
PostgreSQL 16 server; it made no database change. A compatible PostgreSQL 18.4 client then produced a
valid archive of the root-environment database:

| Evidence | Verified value |
| --- | --- |
| Archive | `/private/tmp/gigalibs-pre-migration-20260922.dump` |
| Format | PostgreSQL custom archive, dump format 1.16 |
| Database/server | `gigalibs`, PostgreSQL 16.14 |
| Size | 1,266,006 bytes |
| Permissions | `600` (`-rw-------`) |
| TOC entries | 1,916 |
| SHA-256 | `be56d3f875a3eaa80bffc6ffc3176e7c91ca035b8bc0b82b9b7d16e7f680c523` |

`pg_restore --list` successfully parsed the archive and listed the expected application schemas. This is
backup-integrity evidence, not a restore rehearsal. The archive is local recovery material in temporary
storage and must not be treated as a durable production backup.

`prisma migrate deploy` then applied its two pending checked-in migrations. Independent verification
confirmed the root-environment database was current. However, the compiled API was launched from
`apps/playground-api`, whose package-local `.env` takes precedence. The API therefore used
`127.0.0.1:5432/gigalibs_dev_runtime`, not the migrated root-environment database at
`localhost:5440/gigalibs`. The first recovery statement was consequently incomplete.

The reviewer's next browser retry reproduced Prisma `P2022`. A read-only comparison established the exact
environment-target mismatch. The API was stopped again. A separate pre-migration backup was created for
the actual runtime database:

| Evidence | Verified value |
| --- | --- |
| Archive | `/private/tmp/gigalibs-dev-runtime-pre-migration-20260922.dump` |
| Format | PostgreSQL custom archive, dump format 1.16 |
| Database/server | `gigalibs_dev_runtime`, PostgreSQL 14.20 |
| Size | 536,265 bytes |
| Permissions | `600` (`-rw-------`) |
| TOC entries | 959 |
| SHA-256 | `63a032cff3643b7f5c40b1515920b7c14bf299b7bd1fb0be99369d1a1c935fbd` |

`pg_restore --list` successfully parsed this archive. Collision checks found none of the new tables,
columns or indexes already present. Prisma reported five pending migrations in the actual API database.
After review, `prisma migrate deploy` applied these checked-in migrations in order:

1. `20260914000000_add_saga_governor_parenttenant`;
2. `20260915000000_align_saga_governor_tenant_columns`;
3. `20260915001000_align_configuration_datamodel`;
4. `20260920000000_canonical_departments_and_workforce_memberships`; and
5. `20260921000000_tenant_safe_department_relationships`.

Independent verification of the actual runtime database confirmed:

- Prisma reports all 37 migrations up to date;
- the aligned saga/governor/tenant columns exist;
- the Configuration activation lookup index exists;
- `tenant_members.departmentId` and `tenant_members.employmentType` exist; and
- both tenant-safe department foreign keys exist.

A read-only Prisma probe against an existing membership passed every `TenantMember` scalar, the tenant,
user, custom-role and department relations, and the default selection that previously raised `P2022`.

The compiled real API was restarted as PID `46951` and is the sole listener observed on port `3333`.
Post-recovery probes against the correct runtime database returned:

| Probe | Result |
| --- | --- |
| `GET /api/v1/health` | 200; `status: ok`, service `gigalibs-api` |
| `GET /api/v1/ready` | 200; `status: ready`, database connected |
| Unauthenticated `GET /api/v1/configuration/surfaces` | 401; missing/invalid authorization header |
| Unauthenticated web `GET /api/control/configuration/surfaces` | 401; authentication required |
| Unauthenticated web `POST /api/auth/logout` | 200; `authenticated: false` |

No Prisma `P2022` occurred during the final restart or these probes. The 200 logout probe proves that the current
web-to-real-API path can clear an unauthenticated/stale session; it does not certify logout from a valid
authenticated session. Likewise, the probes do not certify real sign-in, tenant selection, Configuration
surface discovery or lifecycle behavior. Those remain manual rerun requirements.

The historical readiness finding also remains open: after migration the database is compatible, but the
current readiness contract has not been changed or tested to prove that it will reject future pending or
application-incompatible migrations.

### Authenticated rerun and separate Currency dependency

After the correct runtime migration and fresh sign-in, the reviewer reported:

| Request | Result | Classification |
| --- | --- | --- |
| `GET /studio/configuration?surface=tenant-profile-extension` | 200 in 80 ms | Authentication/workspace recovery evidence; visual lifecycle assertions still pending |
| Configuration Studio JavaScript and CSS assets | 200 | Static asset delivery passed |
| `GET /api/currency/v1/preferences` | 502 | Separate Multi-Currency runtime dependency was stopped |
| `GET /api/currency/v1/pairs` | 502 | Separate Multi-Currency runtime dependency was stopped |
| `GET /favicon.ico` | 404 | Cosmetic |

The Currency BFF performs real session, selected-tenant, module-entitlement and permission checks before
contacting its upstream. Receiving 502 rather than 401/403 establishes that those checks passed. The web
application was configured for the checked-in Multi-Currency API at `127.0.0.1:3700`, but no process was
listening there.

The module database already contained both required Currency migrations. The compiled real Currency API
was started as PID `47569`; it connected to the `gigalibs_currency` schema and reported two migrations.
Post-start verification returned:

| Probe | Result |
| --- | --- |
| `GET /api/currency/v1/health` | 200; healthy, database connected |
| Authenticated test-tenant `GET /v1/preferences` | 200; documented USD/en-US defaults, no persistence write |
| Authenticated test-tenant `GET /v1/pairs` | 200; empty list, no synthetic rate creation |

The module warns that its local non-production database role is superuser/BYPASSRLS. This is not acceptable
production-profile evidence and remains in scope for independent deployment/security review. Browser
confirmation that the two Currency BFF calls now return 200 remains pending.

The authenticated manual rerun must capture the sanitized response body for:

- `GET /api/control/configuration/surfaces`; and
- `GET /api/control/configuration/apps`.

The local runtime and schema recovery are complete. No product correction is authorized by this evidence
record. Certification remains blocked until real authentication and persistence are demonstrated and the
reviewer can see and select `tenant-profile-extension`.

## Next manual step

Reload `http://localhost:5180/studio/configuration?surface=tenant-profile-extension` and record:

1. whether the Universal Configuration Studio loads;
2. whether `Tenant profile` is selected under Target surface;
3. whether the five workflow tabs render;
4. whether both Currency requests now return 200;
5. any toast, banner, disabled control or browser-visible error; and
6. a screenshot that includes the Target surface and workflow tabs.

## Superseding technical evidence — 2026-09-23

The 2026-09-22 screenshot and submitted PASS remain invalid for certification because they were captured
against the fabricated control plane. They are preserved as historical evidence and are not rewritten.

The real exact-image local stack was subsequently certified through the automated and operator-driven
evidence bundle at `infra/compose/evidence/phase-a-20260923T103641Z/`. The authoritative summary is
`docs/audits/2026-09-23-wi-oi-047-local-technical-closure.md`.

| Area | 2026-09-23 result | Evidence |
| --- | --- | --- |
| Real Configuration lifecycle | PASS, including separate maker/checker, self-approval denial, publish, activation and checksum | `f2-runtime.json` |
| Tenant isolation and live revocation | PASS across two tenants plus role, membership, user, tenant and logout revocation | `f2-runtime.json` |
| Generated test data | PASS; zero active generated users, tenants or memberships after cleanup | `f2-runtime.json`, `restart-checksum.json` |
| Latency | PASS; 100 reads at concurrency 10, p95 29.349 ms and p99 37.667 ms | `f2-runtime.json` |
| PostgreSQL/MinIO failure behavior | PASS for the bounded F2 dependency contract | `postgres-outage.json`, `minio-outage.json` |
| Backup/restore | PASS into a disposable database with 37 migrations and semantic activation/checksum verification | `restore-final.json` |
| Exact-image restart | PASS; authoritative manifest checksum persisted | `restart-checksum.json` |
| Automated accessibility | PASS; seven Chromium/axe scans with zero violations | `accessibility-automated.json` |

This technical result supersedes the earlier runtime blockers but does not turn the historical screenshot
into valid UAT. The following still require human evidence:

- Product review of the real visible Configuration Studio journey;
- manual keyboard-only, screen-reader, 200%/400% zoom and high-contrast testing;
- named Security, Backend/Data, Web/Accessibility and QA/SDET decisions; and
- review and routing of the repository-wide failures recorded in `gates-summary.json`.

The work item is therefore in `Review`, not `Accepted`. No production or cloud claim is made.
