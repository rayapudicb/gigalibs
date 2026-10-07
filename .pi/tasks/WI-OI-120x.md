# WI-OI-120x: A non-admin gives no base role or scope beyond their own

- **Status:** Approved (owner, 2026-10-06: "approved", after "card the base-role bound"). Built and checked
  2026-10-07; awaiting "commit" and the Security review. Found by the independent Security review of the WI-OI-120w
  grant bound. It predates R2.
- **Work item:** WI-OI-120. Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** S
- **Exposure on UAT today: none** (read-only, 2026-10-06). Only Tenant Admins hold `users:update`, `invites:create`,
  `organization:grant` or the SCIM permissions. Two custom roles carry `users:update` ("develoepr", "QA"), and nobody
  holds either. Members hold no direct codes from these families.

## Why

WI-OI-120v stops anyone but a Tenant Admin from giving the Tenant Admin role. WI-OI-120w's grant bound stops a
non-admin from giving a custom role, or adding permissions to one, beyond what they hold. Base roles and scope are
still unbounded:

- **Base role:**
  - a non-admin holding `users:update` can make any member a Manager, themselves included (`updateMember`);
  - with `invites:create` they can invite someone as a Manager (`createInvite`);
  - with the SCIM user permissions, `createUser` and `patchUser` can do the same.
  - A Manager holds 45 permissions, among them `workflows:*`, `actions:approve`, `spend:approve` and
    `exceptions:*`. The actor may hold none of them.
- **Own scope:**
  - the same member update lets a non-admin change their own department and places;
  - `organization:grant` lets them grant themselves a unit (`OrganizationService.createGrant` has no self check).
  - Either widens where their permissions apply.

## Change

1. **Base role, bounded like the grant bound.** Someone who is not an active Tenant Admin may give a base role only
   when they hold every permission it adds to the member's current role. The added permissions are those of the new
   role that the current role does not cover. Lowering a role is not bounded. Applied to:
   - the member update;
   - an invitation, where the role is the one invited;
   - SCIM create and patch;
   - invitation acceptance: the sender's permissions are checked again when the invitation is accepted, which covers
     invitations sent before this fix, as WI-OI-120v does for admin invitations.
   - Refused with 403 `GRANT_BEYOND_OWN`, naming the permissions the actor lacks. `assertGrantWithinOwn` is reused.
2. **No self-widening.** Someone who is not an active Tenant Admin may not change their own:
   - base role;
   - department;
   - places;
   - unit grants.
   Refused with 403 `SELF_ACCESS_CHANGE`. Their employment type and their other members' records are unaffected.
3. **Settings → Team:**
   - a non-admin is offered only the base roles they may give;
   - the controls on their own row for role, department and places are read-only.

## As built

- **The base roles are defined once:** `BASE_ROLE_DEFINITIONS` in `packages/contracts/src/rbac/base-roles.ts`, moved
  unchanged from rbac-core (all 111 lines identical). rbac-core builds its hierarchy from it, and a test proves both
  resolve every role to the same permissions.
  - `baseRoleAdditions(current, next)` gives the permissions a move adds. The server and the web use the same function.
- **The server:**
  - `assertBaseRoleWithinOwn` and `assertNotOwnAccess` in `packages/tenancy-nest/src/grant-bound.ts`;
  - applied to the member update, invitations and acceptance (refused at acceptance with 403
    `INVITATION_NO_LONGER_VALID`), SCIM create and patch, and unit grants (`OrganizationService.createGrant`).
- **Settings:**
  - the member row and the invite form offer only the base roles the viewer may give;
  - a non-admin's own role, places (Places), department (legacy Departments) and unit grants (Access) are not
    offered to them.

## Not in this card

- **Explicit-scope bounds** (give a role only where you hold it): R2 slice 2b and R4.
- **Limits on removal:** taking away roles beyond one's own, and removing permissions from a role a Tenant Admin
  holds. These belong to R4.
- **Role names that mislead** (review Low): a broad role under a harmless name. The fix is to show a role's
  permissions in the "Add a role" picker; that belongs to the R4 role editor.
- **Default roles at sign-up** (OIDC just-in-time, invitation defaults): a Tenant Admin configures them, so they are
  not an actor's grant.

## Proof

- **Unit:** `tenant-admin-authority.test.ts`, or a new `base-role-bound.test.ts`:
  - a non-admin holding `users:update` cannot make anyone a Manager, themselves included;
  - a Manager holding `users:update` can make a member a Viewer, and can make a Viewer a Member when they hold what
    Member adds;
  - an invitation as Manager by a non-admin is refused, both when sent and when accepted;
  - self changes of department and places are refused;
  - an admin is allowed everything above.
- **Integration (r2_proof):** the same cases through the service, plus a self unit grant refused via
  `organization:grant`.
- **SCIM on its disposable database** (`scim_proof`, 127.0.0.1:55541): a non-admin SCIM operator is refused
  `createUser` and `patchUser` as Manager.
- `pnpm verify`; an independent Security review before deploy (access change).

## Done when

- [ ] The base-role bound is applied to the member update, invitations, acceptance and SCIM.
- [ ] Self-widening is refused for role, department, places and unit grants.
- [ ] Settings → Team offers only the roles a non-admin may give, and their own row is read-only.
- [ ] Checks pass; Security review recorded; evidence recorded; images built and handed to the owner.

## Stop and ask if

- a walk-through or the journey relies on a non-admin changing base roles or their own scope.

SCIM is not a reason to stop: a SCIM operator acts as an active member, with that member's permissions
(`scim.service.ts` `mutate`). So the bound reads that member's permissions, as it does in Settings.
