# WI-OI-102g: merge platform-rbac into the kernel, then retire it (ADR-0016 F6)

- **Status:** Done (2026-09-29). Evidence is in `.pi/work/WI-OI-102.md` under "102g". WI-OI-102 is in Review.
- **Work item:** WI-OI-102, the last slice. Evidence goes in `.pi/work/WI-OI-102.md`, under "102g".
- **Size:** M.

## Findings that shape the merge

- The kernel **already has** departments (the `Department` model, with hierarchy, manager and members) and user
  groups (`UserGroup`). platform-rbac's `departments` and `groups` tables duplicate them.
- platform-rbac's genuinely extra parts are:
  - custom roles with a role-permission mapping;
  - per-user permissions and resource-level ACLs;
  - impersonation sessions.

  The kernel has fixed base roles and no impersonation. These belong to **WI-OI-077** (custom roles and persona
  navigation), which extends the kernel's roles.
- The "Marketplace" is billing: module purchases, invoices, credit wallets and a usage ledger. ADR-0013 rules out a
  ledger, and billing is frozen. The kernel already covers **enabling modules**: platform operators set tenant
  entitlements (`PUT /api/v1/platform/tenants/:id/entitlements`), and tenants see their plan in Settings → Plan
  (`TenantPlanEntitlements`).
- The `gigalibs_platform` database schema has 14 tables, all empty. The service never ran in the local stack.

## Steps

1. Move the `module-marketplace` catalogue entry to `platform/core.yaml` as the kernel's "Modules & Plan" (same key,
   so entitlements stay valid). `/marketplace` opens Settings → Plan.
2. Remove the dead `/api/marketplace` proxy, its test, and the `PLATFORM_RBAC_API_URL` setting (Compose, the
   example env and the profile contract, kept consistent).
3. Record the carried-over design (custom roles, the role-permission mapping, resource ACLs, impersonation) in the
   WI-OI-077 plan row and in ADR-0016.
4. Retire `modules/platform-rbac`; git keeps its history. Leave the empty `gigalibs_platform` schema in the database:
   dropping it needs a backup and the owner's OK.

## Done when

- [ ] `/marketplace` shows the kernel's plan and modules; the manifest check and `pnpm verify` pass.
- [ ] Nothing references the retired module or its setting.
- [ ] WI-OI-102 moves to Review, and `.pi/NOW.md` is updated.

## Stop and ask if

- anything running depends on platform-rbac;
- removing the setting changes the running web in a way that needs a redeploy decision.
