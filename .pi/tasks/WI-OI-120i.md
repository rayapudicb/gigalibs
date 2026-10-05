# WI-OI-120i (U20a): Workforce screens reach their API, with permissions

- **Status:** Approved (owner, 2026-10-05); starts after U7 (WI-OI-120g) is committed. Independent Security review
  before deploy.
- **Work item:** WI-OI-120 (U20 in `remediation-backlog.md`). Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** M

## Goal

The Workforce screens the owner tested work on screen, and each Workforce action needs the right permission:
- Engagements;
- Worker Registry;
- Payroll;
- Pack Library;
- the other WFO screens.

Today they all answer "Unsupported Workforce route".

## Cause

- **Not forwarded:** the screens call 57 `wfo/…` routes of the Workforce service. The web gateway lists none of
  them, and the service serves them without the `v1` prefix the gateway adds.
- **Roles instead of permissions:** 22 of the 60 routes name roles (`@RequireRoles`). The guard deliberately refuses
  them as "prototype role-based routes contained until migrated to Workforce permissions".
- **No check at all:** 38 routes name no permission, so the guard admits any signed-in user of a Workforce tenant.
  There is no exposure today only because the gateway does not forward them.
- **No ownership check:** at least two self-service commands (respond to an invitation, sign a contract) update by
  tenant and id only. They do not check that the record belongs to the caller.

Already sound: every `wfo` table (migrations 20–25, installed in UAT) has forced row-level security with a tenant
policy.

## Steps

1. **Permissions on every `wfo` route,** replacing `@RequireRoles`. Each uses the Workforce permission family
   (`workforce.*`), reusing existing permissions where they fit:
   - `workforce.engagements.read` and `.manage`;
   - `workforce.pay.read` and `.manage`;
   - `workforce.configuration.manage`.

   New permissions, each with read and manage or approve:
   - workers;
   - compliance;
   - staffing;
   - expenses;
   - planning;
   - reports;
   - comms;
   - vendors;
   - shifts;
   - support.

   Tenant Admins hold `workforce:*`, so they keep full access.
2. **Self-service routes** check that the record belongs to the caller as well as the permission:
   - invitations;
   - contracts;
   - shift pickups and swaps;
   - expense reports and lines;
   - compliance documents;
   - support tickets;
   - my notifications.

   Another user's record answers 404.
3. **Routes under `v1/wfo/…`.** The web client keeps calling `/api/workforce/wfo/…`; only the gateway path changes.
4. **Gateway:** the routes are added to the Workforce gateway list with their permissions. A test fails the build
   when any Workforce screen call has no gateway route, or a gateway route has no Workforce controller (as for CMMS).
5. **Proof:** an HTTP proof against the built Workforce API on an isolated database, with real migrations. Each screen
   call is signed with only the permission the gateway grants. It also checks:
   - another user's invitation or contract answers 404;
   - another tenant sees nothing;
   - a user without the permission is refused.

## Scope

- **May change:**
  - `modules/gigaops` (the `wfo` controllers and services, `module.yaml`);
  - the generated gateway;
  - `apps/workflow-platform/lib/workforce-api.ts`, only if a path must change;
  - tests and a proof script.
- **Must not change:**
  - applied migrations (a forward migration only if a column for ownership is missing);
  - the canonical `v1` Workforce routes;
  - other modules;
  - running services.

## Needs from the owner

- **Worker self-service roles:** which role should workers who are not administrators get, so they can use
  self-service (respond, pick up shifts, submit expenses)? Today only Tenant Admins hold Workforce permissions.
  Until a decision, only Tenant Admins can use these screens.

## Done when

- [ ] The owner's Workforce screens load and their actions work on screen for a Tenant Admin.
- [ ] Every `wfo` route requires a permission; no `@RequireRoles` remains on them.
- [ ] Self-service routes refuse another user's record.
- [ ] `pnpm build`, `pnpm test` and `pnpm verify` pass; the proof passes on an isolated database.
- [ ] Independent Security review recorded; evidence recorded; images built and handed to the owner.

## Stop and ask if

- a route's ownership cannot be established from the data (no link between a worker and a user);
- a fix needs a change to a canonical `v1` Workforce route or contract.
