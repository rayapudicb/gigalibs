# WI-OI-120p: Access model and people administration (bulk and delegated)

- **Status:** Proposed (owner direction and decisions 2026-10-06; card to be approved before work starts). Starts after
  WI-OI-120n. Independent Security review before deploy.
- **Work item:** WI-OI-120 (tenant-to-value; WI-OI-120m journey). Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** XL (delivered in slices, each approved and deployed separately)

## Owner direction (2026-10-06)

"A department head or manager can hire any number of persons and entitle modules for them", with bulk upload and bulk
invitation; departments of 100 to 200 people using different modules.

## Owner decisions (2026-10-06)

- **What a department head may assign:** an admin-approved list per department (e.g. Maintenance: technician,
  planner). Never Tenant Admin; never more than the head holds.
- **Seats per module:** not now. Anyone given a module role can use the module; seats can come with billing.
- **CMMS user import** (writes invitations straight into `public.tenant_invites` from the CMMS connection, accepts
  TENANT_ADMIN, returns no links): switched off in WI-OI-120n; replaced here through the control plane.

## Today (verified in code)

- **Access is four checks on every call:** the workspace has the module (entitlement); the person holds the permission
  (from their roles); the record is in their scope (organization units, or places for CMMS); ownership and
  maker-checker where the module applies them.
- **A member** has one base role (TENANT_ADMIN, MANAGER, MEMBER, VIEWER, GUEST), at most one custom role, extra
  permissions, a department, and unit and place grants.
- **Organization scope** applies only once the primary tree has a version in force. Then Tenant Admins (and anyone
  with a platform role) see the whole workspace; everyone else sees their granted units and below, plus shared
  records. A member with no grant sees only shared records.
- **Modules applying organization scope:** Analytics, Workforce, Geospatial, Catalogue and part of Inventory. CMMS
  applies place scope only. Procurement, Orders and Finance apply neither.
- **Invitations:** one at a time, Tenant Admin only. SCIM syncs users; its groups are the five base roles only.

## Slices

1. **Module roles:** ready-made custom roles per module (Maintenance technician, planner, manager; Warehouse operator,
   supervisor; Workforce scheduler, timesheet approver; Finance clerk, approver; Procurement buyer, approver; Sales
   order clerk), shipped as system roles a workspace can copy and adjust.
2. **Several roles per person:** a member holds several custom roles (schema change, forward migration); permissions
   are their union.
3. **Department allowances:** the Tenant Admin sets, per unit, which roles its head may assign.
4. **Delegated people management:** a `people:manage` permission scoped to the head's units. The head invites or adds
   people only into those units, only with allowed roles, only for modules the workspace has.
5. **Bulk add:** CSV upload or a pasted list (name, email, unit, roles, worker yes or no). Every row is checked before
   anything is created; invitations are created together; one-time links are given as a download until email
   delivery is configured; a tracker shows who has joined; resend and revoke in bulk.
6. **Workers in the same step:** "is a worker" also creates the Workforce person linked to the login (with WI-OI-120o).
7. **Bulk unit grants:** grant or move many people between units at once; offboarding deactivates in bulk.
8. **Directory groups:** SCIM groups map to a role plus unit, so enterprise customers add nobody by hand.
9. **Scope in every module:** organization scope in Procurement, Orders and Finance, and units (not only places) in
   CMMS; each module gets a test that a department-A user cannot read or change department-B records.
10. **Platform roles:** review that any platform role gives tenant-wide data authority inside a workspace the person
    belongs to.

## Proof

- The discovery journey grows a department step: the hierarchy is switched on; the North plant head bulk-adds
  technicians with allowed roles; they join with their links; a North technician cannot see South plant's work orders;
  the head cannot assign Tenant Admin or a role outside the department's list.
- HTTP proofs for delegated invitation (unit, role and escalation refusals) and for scope in each module.

## Stop and ask if

- a slice needs a role or permission that lets a head act outside their units or above their own authority;
- email delivery needs a provider or credentials.
