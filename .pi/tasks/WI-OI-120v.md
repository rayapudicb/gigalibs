# WI-OI-120v: Only a Tenant Admin grants or changes the Tenant Admin role

- **Status:** Approved (owner, 2026-10-06: "fix now"). Done 2026-10-06. Found by the independent Security review of R1
  (WI-OI-120q); it predates R1. Evidence: `.pi/work/WI-OI-120.md` § WI-OI-120v.
- **Work item:** WI-OI-120.
- **Size:** S

## Why

Any member whose role grants `users:update` could make any member a Tenant Admin, themselves included
(`tenancy.service.ts` `updateMember`). The same held for `invites:create` (an invitation as Tenant Admin) and for
SCIM user permissions (create, change or delete). Base Managers do not hold `users:update`, but a custom role can,
and the role editor has always offered it.

## Change

- `assertTenantAdminAuthority` (`packages/tenancy-nest/src/tenant-member-safety.ts`): an active Tenant Admin (or
  Super Admin) is needed to:
  - give the Tenant Admin role;
  - change, suspend or remove a member who holds it.
  Anyone else is refused with 403 `TENANT_ADMIN_ONLY`. The check runs inside the existing locked transaction, next
  to "the last administrator is kept".
- **Applied to:**
  - member update;
  - invitation;
  - invitation acceptance: an admin invitation counts only while its sender is still an active administrator, which
    covers invitations sent before this fix;
  - SCIM create, change and delete.
- **Settings → Team:** "Tenant Admin" is offered only to administrators, and a Tenant Admin's row is read-only for
  everyone else.
- `users:update`, `invites:create` and the SCIM permissions still manage every other member.

## Not in this card (R4, delegation)

A role creator is not yet limited to the permissions they hold themselves, so `roles:create` with `users:update`
can still build a broad custom role. R4 adds the bound.

## Proof

- `tenant-admin-authority.test.ts` (8 tests): grant, self-promotion, demotion, suspension, others still managed, an
  admin allowed, the invitation refused, and acceptance refused when the sender is not an administrator.
- SCIM integration on its disposable database (127.0.0.1:55541, `scim_proof`), over real HTTP: a non-administrator
  with SCIM user permissions is refused granting, self-promotion, admin creation, suspension, demotion and removal.
  Ordinary changes still succeed. 7 of 7 pass.
