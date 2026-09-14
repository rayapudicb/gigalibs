# UAT access and role-flow status

Date: 2026-09-10  
Work item: WI-OI-013  
Release status: local UAT implementation in progress; production No-Go

## Why the SUPER_ADMIN badge did not unlock the platform

`SUPER_ADMIN` is a legacy `TenantMember.role`. It is loaded only for a selected tenant and its
permissions remain inside that tenant boundary. It is not global platform authority and cannot list,
create, suspend, or reconfigure other tenants.

The canonical platform control plane now uses the separate persisted roles `PLATFORM_OWNER`,
`PLATFORM_ADMIN`, and `PLATFORM_AUDITOR`. The platform guard reads current assignments from PostgreSQL
on every request. A stale JWT role or a tenant `SUPER_ADMIN` value cannot grant this authority.

The intended UAT account `newuser@gigalibs.io` may hold two independent assignments:

1. `PLATFORM_OWNER` for `/platform-admin` and cross-tenant lifecycle operations.
2. An active `TENANT_ADMIN` or legacy `SUPER_ADMIN` membership in `my-workspace` for tenant business
   and settings flows.

Removing the tenant membership does not remove platform authority. Removing platform authority does not
remove access to the tenant. This separation prevents a tenant administrator from promoting themselves
into the global operator plane.

## User-level flow recheck

| Persona | Entry flow | Current authority source | Expected landing and actions | Current UAT result |
| --- | --- | --- | --- | --- |
| Independent registrant | `/register` → account session → `/select-tenant` | Global user only | Create one self-service workspace | Implemented as a seven-day PostgreSQL-backed trial; one active owned trial per account |
| Trial tenant owner | Select the created workspace | Active `TENANT_ADMIN` membership + unexpired `Tenant.status=TRIAL` | Use trial-eligible modules, administer users/settings | Implemented; expiry is checked during login, refresh, tenant selection and tenant-bound API access |
| Tenant administrator | `/login` → select tenant | Current DB membership and role | Members, invitations, roles, MFA, domain/OIDC/export and seven entitled business slices | Fresh browser UAT passed; seven cards are enabled and global platform registry is denied |
| Manager | `/login` → select tenant | Current DB membership and manager role | Operational read/evaluate/approve/recover actions allowed by the canonical role hierarchy | Fresh browser/API UAT passed; six role-appropriate cards are enabled and tenant/platform administration is denied |
| Member | `/login` → select tenant | Current DB membership and member role | Personal/profile and basic read access | Fresh browser/API UAT passed; personal security is enabled and privileged module/platform APIs are denied |
| Viewer | `/login` → select tenant | Current DB membership and viewer role | Personal security plus read-only surfaces whose controllers grant a matching permission | Fresh browser/API UAT passed; personal security is enabled and privileged module/platform APIs are denied |
| Suspended member | Login or existing session | DB status is not active | No new tenant session; current authority disappears on the next request | Fresh UAT login reaches tenant selection and selecting the suspended membership is denied with `403` |
| Global platform auditor | `/login` → `/platform-admin` | Active unexpired `PLATFORM_AUDITOR` assignment | Read platform catalog, tenant registry and safe user directory; all mutation controls disabled | Fresh browser UAT passed; attempted recovery mutation was denied with `403` by the control plane |
| Global platform administrator | `/login` → `/platform-admin` | Active unexpired `PLATFORM_ADMIN` or `PLATFORM_OWNER` assignment | Create tenant trial, change tenant status, extend trial, change entitlements, request isolation | Implemented with PostgreSQL state and audit records; infrastructure provider execution remains open |

## Tenant lifecycle now implemented

### Self-service registration and trial

1. The user registers a real global identity with email, name and password.
2. The user creates a workspace from `/select-tenant`.
3. One database transaction creates the tenant, active tenant-admin membership, platform settings,
   trial module entitlements, requested isolation binding, optional reserved subdomain, and audit record.
4. The tenant starts in `TRIAL`, the plan is `TRIAL`, and `trialEndsAt` is seven days after creation.
5. The trial receives every module marked `trialEligible` in the canonical catalog. Contained and planned
   modules are rejected by the API even if a caller submits their keys directly.
6. An expired trial cannot issue, refresh or select a usable tenant session, and tenant-bound requests
   fail closed.

### Platform-created tenant

1. A platform owner or administrator opens `/platform-admin`.
2. They enter organization, slug, existing owner email, trial duration, region, requested isolation and
   audit reason.
3. The same durable transaction creates the tenant and UAT entitlements.
4. The owner email must already belong to an active registered user. The implementation does not invent
   an identity or email delivery success.

### Trial extension and conversion

- `Extend trial 7 days` advances an unexpired trial from its current end, or restarts the calculation from
  the current time when already expired. Trial entitlements receive the same end time.
- `Activate` changes the tenant to `ACTIVE`, removes expiry from enabled entitlements and records whether
  activation used a billing reference or an administrator override.
- Suspension and cancellation revoke active tenant sessions.
- Automatic payment conversion is not implemented. It requires a selected payment provider, signed and
  idempotent webhook contract, payment-to-tenant reconciliation and refund/chargeback behavior. The UI
  states this instead of generating a fake payment result.

## Modules available for honest tenant UAT

The runtime-verified UAT catalog currently permits these seven tenant capabilities:

| Module | Catalog state | UAT scope |
| --- | --- | --- |
| Tenant & Access Administration | Available | Members, roles, invitations, MFA policy, domain, OIDC, signed export and assisted recovery |
| Personal Security | Available | TOTP enrollment, verification and one-time recovery codes |
| Execution Runs | Review | Persisted run history and evidence |
| Exceptions & Recovery | Review | Persisted exception assignment and controlled recovery |
| Approval Queue | Review | Governed approval records and decisions |
| Business Value Ledger | Review | Value definitions, evidence and benefit decisions |
| Invoice Matching | Review | Reference three-way-match outcome and evidence flow |

`Platform Control Tower` is an eighth UAT surface for global platform roles; it is not a tenant module
entitlement.

Workflow Definitions, Data Contracts and Connections were returned to containment during live browser
verification: their current suite screens target quarantined API contracts and produced explicit `503`
responses. Canonical persistence APIs exist, but a compatible production UI and server-side entitlement
integration are still required. The Accounts Receivable suite path remains blocked because the standalone
AR runtime has not yet been connected to the canonical suite identity, tenant and entitlement boundaries.
Spend, tax, currency, autonomous recovery, rules, connector hub, marketplace, analytics, CMMS, maps,
e-signature, scanner, ontology, saga, reports and solution packs remain contained or planned. A platform
role cannot override their production-completeness gate.

For platform-owner/admin UAT inspection, the sidebar now exposes `/ar`, `/spend`, `/tax`, `/currency` and
`/recovery` under Financial Operations even when the operator has no selected tenant. Each opens an honest
module-specific readiness screen and keeps business mutations unavailable. This improves discovery and
manual review without turning platform authority into tenant data access. The server-rendered visibility
check is in [finance navigation evidence](evidence/uat/finance-navigation-visibility-result.json).

## Subdomain behavior

`PLATFORM_TENANT_BASE_DOMAIN` defines the platform-owned base, for example `gigaplatforms.com`. Tenant
creation can then reserve `abc.gigaplatforms.com` in PostgreSQL. Reservation prevents another tenant from
taking the same host.

The current state stops at `RESERVED`. Production activation still requires:

1. ownership of the base domain;
2. wildcard DNS or a DNS provider adapter;
3. wildcard or per-host TLS certificate automation;
4. ingress routing from the verified host to the workflow application;
5. an infrastructure worker that writes non-secret verification evidence and changes the binding to
   `ACTIVE`;
6. host-to-tenant lookup used only as routing context, while the authenticated tenant membership remains
   the authority check.

No UI action claims that DNS or TLS is active before this evidence exists.

## Database-isolation behavior

The platform administrator can request `ROW_LEVEL_SECURITY`, `SCHEMA_ISOLATED`, or
`DEDICATED_DATABASE`. The request creates or replaces a `TenantIsolationBinding` with status `REQUESTED`.

This is desired state, not a database-provisioning success. A production worker must still create the
schema/database using an approved provider, apply and verify migrations, configure secret references,
exercise backup/restore, store the non-secret binding receipt, and only then set `effectiveMode` and
`READY`. Until that worker exists, the UI reports `REQUESTED`.

## Evidence completed in this slice

- Prisma schema and forward migration for global roles, module entitlements, isolation and subdomain state.
- Global platform-role guard that rejects tenant-only `SUPER_ADMIN` authority.
- Platform tenant registry and lifecycle API with real PostgreSQL transactions and audit events.
- Platform Control Tower UI and exact BFF route allowlist.
- Seven-day self-service trial creation and expiry checks.
- Session contract exposes tenant roles and platform roles separately.
- Module page and sidebar show only capabilities enabled for the current UAT session; blocked cards remain
  visible without links and explain the gate.
- Bootstrap operator script has no credentials or default user. It requires explicit environment inputs,
  refuses to create a second bootstrap owner and audits the assignment.
- Automated tests cover global-role isolation, expired trials, catalog eligibility, runtime containment and
  portability inventory.
- Forward migrations through `20260910003000_password_reset_credentials` are applied to the dedicated
  local UAT database; 28 Prisma migrations are present and applied.
- `newuser@gigalibs.io` has an audited active `PLATFORM_OWNER` assignment and seven enabled tenant-module
  entitlements in `my-workspace`.
- The local PostgreSQL 16 execution database, Redis queue and FastAPI execution plane pass startup
  readiness, and the NestJS and Next.js services are running on ports 3333 and 5180.
- A fresh headless Chromium sign-in reached `/modules`, observed 29 catalog entries and eight enabled
  surfaces, opened Platform Control Tower, and probed every enabled route without a page error, redirect,
  unavailable state or `5xx`. See [browser result](evidence/uat/platform-owner-browser-result.json),
  [module screenshot](evidence/uat/platform-owner-modules.png), and
  [control-tower screenshot](evidence/uat/platform-owner-control-tower.png).
- Canonical registration, invite acceptance, tenant selection, role-specific navigation and API checks
  passed for tenant admin, manager, member, viewer and suspended member. A separate independent identity
  created a seven-day persisted trial. See
  [tenant-persona browser result](evidence/uat/tenant-persona-browser-result.json).
- Platform identity management passed nine real PostgreSQL/API outcomes: optimistic profile persistence,
  current-password enforcement, session revocation, safe directory projection, global-role grant/revoke,
  digest-only one-time password recovery, suspend/reactivate behavior, suspension-driven external-identity
  deprovisioning and explicit binding revocation/reactivation. See
  [identity API result](evidence/uat/platform-identity-management-result.json).
- Separate attributable platform-owner and platform-auditor browser identities completed login, profile
  update, user-directory search, display-once recovery issuance, read-only UI verification and server-side
  mutation denial with zero page errors. The evidence screenshot masks the token and cleanup consumes the
  generated credential before deactivation. See
  [identity browser result](evidence/uat/platform-identity-browser-result.json),
  [profile screenshot](evidence/uat/platform-profile-and-security.png),
  [platform users screenshot](evidence/uat/platform-users-and-rbac.png) and the
  [auditor screenshot](evidence/uat/platform-auditor-read-only.png).

## Remaining UAT and production gates

- Run the destructive tenant lifecycle mutation matrix; platform-owner identity lifecycle/recovery,
  platform-auditor read-only enforcement and tenant-persona authorization journeys are complete.
- Wire Workflow Definitions, Data Contracts and Connections to their canonical persisted contracts and add
  server-side entitlement enforcement before returning them to UAT.
- Connect and certify payment, DNS/TLS and database-provisioning providers.
- Implement and certify each currently contained module through its own work item.
- Complete PostgreSQL 16 migration and backup/restore rehearsal, external-provider identity
  interoperability/SCIM, external-identity browser UAT, independent security/QA/product reviews and
  production release approval.
