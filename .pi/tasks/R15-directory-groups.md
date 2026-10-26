# R15 — Directory groups mapped to scoped roles, plus SSO

- **Status:** Group→scoped-role mapping + reconcile built 2026-10-26 (local). Plan item 3.4. Independent Security
  review before deploy. Cards: WI-OI-120p (RBAC), WI-OI-013 (SSO).

## What existed

- **OIDC SSO:** built — `TenantOidcConfiguration` + `OidcLoginTransaction` models, `auth/oidc/*` endpoints,
  `TenantOidcManager` settings UI.
- **SCIM:** built — `scim.controller.ts` / `scim.service.ts` provision users and set a member's **base** role, and
  represent each base role as a read-only SCIM Group.
- **Gap:** no way to map a directory (IdP) **group** to a **scoped custom role** (role + unit), so enterprises still
  assigned scoped roles by hand. And no SAML.

## What R15 adds — directory group → scoped role

A tenant maps each IdP group to a custom role at a scope (WORKSPACE or specific UNITS). Reconciling a member against
their current group membership grants the roles the mappings require and revokes directory-sourced roles no longer
required — manual grants are never touched. Every grant runs through the **same assignment engine** Settings → Team
uses, so a mapping can only ever grant what a Tenant Admin could grant by hand (scope enforcement incl. the R5
allow-list, scope consistency, duty conflicts, the role limit).

- **Schema + migration `20261026020000_scim_group_role_mappings`:** `scim_group_role_mappings` (tenant,
  externalGroupId, customRoleId, `scope` MemberRoleScope, unitIds; unique per tenant+group+role; CHECKs that confine
  scope to WORKSPACE/UNITS and require units iff UNITS). Relation-free like `department_role_allowances` — the role is
  validated at set time. `ScimGroupRoleMapping` classified in `config/package-layers.json` (audit:layers clean).
- **Contracts** (`rbac/directory-groups.ts`): Set/Remove/Sync schemas and the pure `resolveGroupRoleGrants` (groups +
  mappings → desired scoped grants; WORKSPACE beats UNITS for the same role, UNITS merge) and `planDirectoryReconcile`
  (desired vs held directory-sourced → grant/revoke; a scope change is revoke-old + grant-new).
- **Service** (`tenancy.service.ts`): `setDirectoryGroupMapping`, `listDirectoryGroupMappings`,
  `removeDirectoryGroupMapping` (admin, audited) and `reconcileMemberDirectoryGroups` — resolves the member, loads
  mappings, applies the pure plan under one tenant lock, all-or-nothing; directory-sourced assignments are marked by a
  `directory-sync` principal so only they are reconciled.
- **Endpoints** (`tenancy.controller.ts`): `POST/GET/DELETE current/directory-group-mappings[/:id]` and
  `POST current/directory-group-sync` (the connector calls sync), gated `roles:assign` / `roles:read`.

## Proof

- Pure logic: `rbac/directory-groups.test.ts` (8 — resolve single/merge/WORKSPACE-wins/absent, reconcile
  grant/revoke/scope-change/no-op, schema scope-vs-units rule).
- Contracts + tenancy-nest + playground-api typecheck green; `permission-catalogue` test green (new route decorators
  named valid codes); audit:layers clean; new files lint clean.

## Deferred / gated (flagged)

- **SAML SSO** — genuinely absent; a full SAML SP needs a library choice, IdP metadata and a provider to test against.
  An owner/architecture call. OIDC already covers the SSO login path.
- **Live SCIM-group push → reconcile** — `reconcileMemberDirectoryGroups` is the seam the IdP/SCIM connector calls;
  wiring SCIM `PATCH /Groups` membership changes to it, and testing end to end, needs a real IdP. The control-plane
  logic is built and unit-tested now.
- **A DB integration test** of reconcile against a throwaway control Postgres (the pure resolve/plan is covered; the
  grant/revoke apply reuses the engine proven by the R13/R14 integration tests).
- **An admin UI** for the mappings (pairs with the deferred department-allowance editor).
