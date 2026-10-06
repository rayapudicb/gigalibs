# WI-OI-120n: Tenant-to-value fixes, batch 1 (from the WI-OI-120m discovery journey)

- **Status:** Committed `7485aec`; independent review done 2026-10-06 (deploy after fixes); High and Medium findings
  fixed except the technician's reach over any work order, which the owner **accepted for UAT only** on 2026-10-06
  ("accept the technician gap for UAT"); it must be closed by M-CM1 before production. **Not deployed yet.** Independent Security review before deploy (role
  permissions change). Owner decision 2026-10-06: GPT performs a read-only security review of the batch-1 diff
  (`144c010..7485aec`) as an interim independent review **for UAT only**; findings are fixed before the UAT deploy.
  Production still requires the named D7 Security reviewer.
- **Work item:** WI-OI-120 (WI-OI-120m journey; U20a is WI-OI-120i, delivered next as its own card). Evidence goes in
  `.pi/work/WI-OI-120.md`.
- **Size:** L

## Why

The discovery journey (runs `w9gxgq`, `w9vlls`) signs up a new customer, builds the organization, invites a
supervisor (MANAGER), a technician (MEMBER), an approver (MANAGER) and an auditor (VIEWER), and tries to run CMMS
maintenance. Only the administrator can do anything: workspace roles other than TENANT_ADMIN carry no CMMS, Workforce,
Geospatial or Organization permission, so every business screen answers 403 to the people who do the work.

## Owner decisions (2026-10-06)

- **Roles:** the standard mapping. MEMBER: own work, own time, requests and absences. MANAGER: that, plus managing
  assets, schedules and workers and approving timesheets and absences. VIEWER: read only. TENANT_ADMIN: everything.
- **Worker ↔ login:** both an administrator picker and automatic linking by email. The picker is in this batch.
  Automatic linking needs the user's email in the signed module context (an auth-context change) or a control-plane
  call into Workforce; it is proposed as its own card (WI-OI-120o) rather than folded in here.
- **Modules outside the plan:** hidden from the menu; opened by link, they show "Not in your plan" with a link to
  Plan & Entitlements and make no data calls.

## Fixes

1. **Role permissions** (`packages/rbac-core/src/default-roles.ts`):
   - VIEWER: `cmms:read` and every `cmms.*.read`; `workforce:read`, `workforce.resources.read`, `workforce.jobs.read`;
     `maps:read`; `organization:read`.
   - MEMBER: VIEWER, plus `cmms.work-orders.write`, `cmms.meters.write`, `workforce.time.read`, `workforce.time.punch`,
     `workforce.absences.request`.
   - MANAGER: MEMBER, plus `cmms.assets.write`, `cmms.pm.write`, `cmms.parts.write`, `workforce.resources.manage`,
     `workforce.jobs.manage`, `workforce.bookings.manage`, `workforce.availability.manage`,
     `workforce.timesheets.approve`, `workforce.absences.approve`.
   - The menu follows the permissions, so each role sees the modules it can use.
2. **Link a Workforce person to a login:** a "Login" picker of workspace members on Resources → Create persisted
   resource, and on a resource's details (the API already accepts `platformUserId`; one person per login).
3. **Modules outside the plan:** menu hidden; the page shows "Not in your plan" (Finance, Catalogue, Inventory and
   any other module the workspace is not entitled to).
4. **App shell:** the Currency calls on every page are made only when the workspace has Currency and the person may
   read it (today: two refused calls and console errors on every page of a trial workspace).
5. **Empty states, not errors:** Settings no longer requests a runtime configuration a new workspace does not have;
   the organization structure treats "no active version yet" as empty.
6. **Invitations:** accepting a one-time link takes the person straight into the workspace.
7. **Words, not codes:** role names (Tenant administrator, Manager, Member, Viewer, Guest) in the invitation form and
   members list; the dashboard's FLAT_TENANT and TENANT_ADMIN.
8. **Attendance for administrators who are not workers:** an explanation and the team view, not two refusals.
9. **CMMS user import switched off** (owner authorised, 2026-10-06, for the protected CMMS import/export files): the
   import wrote invitations straight into `public.tenant_invites` from the CMMS connection, accepted TENANT_ADMIN and
   returned no links. The `users` import is refused with a message pointing to Settings → Team; WI-OI-120p replaces it.
10. **Build tooling:** the disk guard keeps the two newest tags per image by creation time; an unchanged image keeps
    its old creation time, so the guard removed a release's freshly tagged migrations image. It must keep the tags the
    current `.env` files name.

## Not in this batch (next cards, in order)

- **U20a (WI-OI-120i):** the Workforce `wfo` screens ("Add worker" and others answer "Unsupported Workforce route").
- **Two worker records:** "Add worker" (WFO, `wfo_workers`) and Resources (`workforce_resources`, which time and
  punches use) are separate masters. Decide one owner before U20a's worker screens are relied on.
- **Layout and accessibility batch:** the side menu's workspace card covers the last menu items; the Softphone button
  and other overlaps; serious colour-contrast failures; unlabelled inputs; a scrollable table without keyboard access.
- **CMMS:** "execute my assigned work order" is not separable from "manage any work order" (write only); the first
  organization unit type's "allowed at the top" rule is not obvious; ~3.5 s first calls on CMMS screens.

## Proof

- The discovery journey reruns on UAT after deploy: the supervisor raises and assigns a work order, the technician
  starts, logs labour and completes it, the supervisor closes it, the auditor reads but cannot change it, and the
  technician punches in once linked. Board compared with run `w9vlls`.
- Unit tests for the role mapping (each role's CMMS, Workforce, Geospatial and Organization grants; no role but
  TENANT_ADMIN gains `*:manage` outside its row).
- `pnpm build`, `pnpm test` and `pnpm verify`.

## Done when

- [ ] The journey's CMMS lifecycle and auditor checks pass as MANAGER, MEMBER and VIEWER.
- [ ] A Workforce person can be linked to a login on screen, and that technician can open their time.
- [ ] No page of a trial workspace makes a refused Currency call; modules outside the plan are hidden and explained.
- [ ] Checks pass; Security review recorded; evidence recorded; images built and handed to the owner.

## Stop and ask if

- a role needs a permission that would let it change another person's record or approve its own work;
- a fix needs a change to a canonical Workforce or CMMS contract.
